/* File system primitives.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require ('fs'),
    nodepath = require ('path'),
    util = require('util'),
    CodeMirrorServer = require('operational-transformation').CodeMirrorServer,
    async = require('async');

var driver = require('./driver'),  // Driver.
    type = require('./type');      // Type system.



// Gather information for the profiler.
//
// Numbers are to computer science what a telescope is to an astrophysicist.

var bench = {
  openFiles: 0,
  totalOpenFilesEver: 0,
  size: 0,
  nbops: {},    // Number of operations per second (for each file).
};

function profile (param) {
  var data = [
    {doc:'Number of open files', data:bench.openFiles},
    {doc:'Number of opened files ever', data:bench.totalOpenFilesEver},
    {doc:'Core Size (warning -- overstating) (bytes)', data:bench.size},
  ];
  if (param && param.path) {
    data.push({
      doc: 'Number of operations/sec at ' + param.path,
      data: bench.nbops[param.path] || 0,
    });
  }
  return data;
};




// Directory primitives.

// `vpath` is a String identifying a unique virtual path to the file.
// `cb: function ( err, file )`
// is a function triggered when the file is fully constructed.
//
// - the content as a string for text files,
// - an object with a property for each file, that links to the corresponding
//   <File> object, for directories.
//
// This is the constructor for the File object.
//
//     var f = new File ( '/path/to/myfile', function(err, file) {
//       …
//     });
//
// - `f.path` is the path (as a String).
// - `f.meta` contains meta information, like the `type`.
// - `f.isOfType` is a method that takes a mime type (as a String).
// - `f.content` is the data associated to the file.
//   Open the file before using it. Close it when you stop accessing it.
// - `f.open` will count one more user editing that file.
// - `f.close` will count one less user. (That doesn't really matter
//   for folders).
// - `f.rm` will remove the file for good (if nobody is using it).
// - `f.driver` contains additional functionality associated to files of this
//   type.
function File (vpath, cb) {
  this.path = driver.normalize(vpath);
  this.count = 0;   // Number of users modifying the content.
  this.content = null;
  this.meta = {};   // Default: empty (may be overriden by what is on disk).

  this.writo = null;    // Regular write timeout.
  this.nbops = 0;       // Number of operations since last period.

  var that = this;
  driver.loadMeta(this.path, function (err, meta) {
    if (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      console.error("While loading metadata:", err.stack);
    } else {
      that.meta = meta || {};
    }

    if (that.meta.type === undefined) {
      // We only need to guess the type if it isn't already in meta.
      type.guessType(that.path, function (err, td) {
        if (err) {
          //console.error("While guessing type", err.stack);
          cb(err);
          return;
        }
        if (td === undefined) that.meta.type = type.fromName['text/plain'];
        else that.meta.type = td;    // `td`: type descriptor (Number).
        that.driver = type.driver(that.meta.type);
        cb(null, that);

        // We had, to guess. Let's write that down.
        driver.dumpMeta(that.path, that.meta);
      });
    } else {
      that.driver = type.driver(that.meta.type);
      cb(null, that);
    }
  });
};



// Checks whether a `file` is of type `typename` (or falls back into it).
//
// - `file`: a File.
// - `mimeType`: a string, case-perfect match of a defined Type.
//
// Warning: this is not *cycle-safe* just yet. This is only an issue if you
// have mistakenly created a loop in the type system.
// It can really screw everything up though.
File.prototype.isOfType = function (mimeType) {
  if (this.meta.type === undefined) {
    console.error('fs:isoftype: file %s has no type.', this.path)
  }
  return type.isCompatible(this.meta.type, type.fromName[mimeType]);
};

// We try to write the file to disk every half minute.
File.writePeriod = 30000;

// The following function is meant to be bound to a file.
// It writes the file to disk if there were modifications.
function writeAtPeriod() {
  bench.nbops[this.path] = this.nbops / File.writePeriod * 1000;
  if (this.nbops > 0) {
    this.write();
  }
  this.nbops = 0;
}

// When you open a file, its content becomes synchronous, immediately available.
// Use it when you need to use readSync and writeSync.
File.prototype.open = function (cb) {
  // If this file had no user, populate the content.
  if (this.count <= 0) {
    var that = this;
    this.driver.read(this.path, function(err, data) {
      if (err !== null) {
        console.error('FS:OPEN:', err.message);
      } else {
        that.content = data;
        // Strings are UCS-2 (or UTF-16): characters are 2 bytes.
        if (data.length)  bench.size += that.content.length * 2;

        // Counts.
        that.count++;
        bench.openFiles++;
        bench.totalOpenFilesEver++;
      }

      if (that.driver.write) {
        that.writo = setInterval(writeAtPeriod.bind(that), File.writePeriod);
        bench.nbops[that.path] = 0;
      }
      cb(err);
    });
  } else {
    // Counts.
    this.count++;
    bench.openFiles++;
    bench.totalOpenFilesEver++;
    cb(null);
  }
};

File.prototype.close = function () {
  if (this.count <= 0) {
    console.error('FS:FILE: count is negative (%s). Keeping it at 0.',
        this.count);
    return;
  }

  this.count--;
  bench.openFiles--;
  if (this.count === 0) {
    var self = this;
    if (this.driver.write) {
      clearInterval(this.writo);
      this.write(function (err) {
        if (err) console.error('FS:WRITE:', err.message);
        self.content = null;    // Let it be garbage-collected.
      });
    } else this.content = null;
    delete fileFromPath[this.path];
  }
};

File.prototype.write = function (cb) {
  if (this.content !== null && this.driver.write)
    this.driver.write(this.path, this.content, this.meta, cb);
};


File.prototype.ot = function (io, cb) {
  var channel = io.of(this.path),
      file = this;
  this.open(function (err) {
    if (err) {
      cb(err); this.close(); return;
    } else if (!channel.codeMirrorServer) {
      channel.codeMirrorServer = new CodeMirrorServer(
          file.content,
          channel,
          [],
          function (socket, cb) { cb(true); }
      );

      channel.on('connection', function (socket) {
        // Call this function after the server send the user information to
        // the new client, such that the user
        // doesn't receive his own information.
        process.nextTick(function () {
          channel.codeMirrorServer.setName(socket, '' + (+new Date()));
        });
        socket.on('disconnect', function () {
          file.close(); // TODO close file when socket is killed.
        });
        socket.on('operation', function () {
          file.nbops++;
          file.content = channel.codeMirrorServer.str;
        });
      });

      cb(null);
    } else {
      cb(null);
    }
  });
};


File.prototype.rm = function (cb) {
  if (this.driver.rm) {
    // We have removed the file, but we need the parent folder to acknowledge it
    var parentPath = nodepath.dirname(this.path);
    if (fileFromPath[parentPath] !== undefined) {
      // We only do this if it is loaded in memory.
      var subfile = this;
      file(parentPath, function(err, parent) {
        if (parent.count > 0) {
          // The content is loaded.
          var subfileIndex = parent.content.indexOf(
            nodepath.basename(subfile.path));
          parent.content.splice(subfileIndex, 1);
        }
      });
    }

    this.driver.rm(this.path, cb);
  } else {
    console.error("Fs:File:rm: Cannot rm file %s of driver %s.",
        this.path, util.inspect(this.driver));
  }
};


// The following two functions are directory-only.

File.prototype.mkdir = function (name, cb) {
  if (this.isOfType('dir')) {
    // We don't want name to have slashes (avoid attacks).
    if (name.indexOf('/') !== -1) {
      console.error("FS:file:mkdir: made folder %s which has a /.", name);
    } else {
      this.driver.mkdir(this.path + '/' + name + '/', cb);
    }
  } else {
    console.error("FS:file:mkdir: tried to make folder %s from non-folder %s.",
        name, this.path);
  }
};

File.prototype.mkfile = function (name, cb) {
  if (this.driver.mkfile) {
    // We don't want name to have slashes (avoid attacks).
    if (name.indexOf('/') !== -1) {
      console.error("FS:file:mkdir: made folder %s which has a /.", name);
    } else {
      this.driver.mkfile(this.path + '/' + name, cb);
    }
  } else {
    console.error("FS:file:mkfile: tried to make file %s from non-folder %s.",
        name, this.path);
  }
};


// We may want to have all the files (as actual file objects) of a folder.
File.prototype.files = function (cb) {
  if (!this.isOfType('dir')) {
    cb(new Error("You can only get the files of a directory."));
    return;
  }

  var folder = this;

  folder.open(function(err) {
    if (err) { cb(err); return; }

    // Now we can use the content.
    async.map(folder.content, function(item, cb2) {
      file(folder.path + '/' + item, function(err, f) {
        if (err) { cb2(err); return; }
        cb2(null, f);
      });
    }, function(err, files) {
      // We are finished now.  All files are processed!
      cb(err, files);   // Return from continuation.
      folder.close();
    });
  });
};

// `Subfiles` gives all the leafs of the tree recursively, as relative paths.
//
// The callback `cb` is of the form `function(err, leafs) { … }`.
File.prototype.subfiles = function (cb, depth) {
  depth = depth !== undefined? depth: Infinity;

  // This function is meant to return [] if this is not a directory.
  if (!this.isOfType('dir')) { cb(null, []); return; }

  var folder = this,
      paths = [];

  folder.open(function(err) {
    async.forEach(folder.content, function(item, cb2) {
      file(folder.path + '/' + item, function(err, f) {
        if (err) { cb2(err); return; }
        var isDir = f.isOfType('dir');
        paths.push(item + (isDir? '/': ''));

        if (depth > 0 && isDir) {
          // We need to go deeper! ☺
          f.subfiles(function(err, leafs) {
            for (var i = 0; i < leafs.length; i++) { leafs[i] = item + '/' + leafs[i]; }
            paths = paths.concat(leafs);
            cb2();
          }, depth - 1);
        } else {
          cb2();
        }
      });
    }, function(err) {
      // We are finished now.  All files are processed!
      cb(err, paths);   // Return from continuation.
      folder.close();
    });
  });
};



/* This hashmap registers all files ever asked for.
 * The keys are the *fake* paths of those files.
 */
var fileFromPath = {};  // From (fake) paths to already loaded files.


/* Read the path, construct the file according to the filename.
 * This function takes care of already accessed files.
 *
 * - `vpath`: String of virtual path starting with a `/`.
 * - `cb`: function (err, <new File()>).
 */
function file (vpath, cb) {
  // Sanitize the path.
  //vpath = nodepath.normalize('/' + vpath);

  var mem = fileFromPath[vpath];
  if (mem !== undefined) {
    cb(null, mem);
  } else {
    new File(vpath, function(err, file) {
      cb(err, file);
      fileFromPath[vpath] = file;
    });
  }
}


// Exports.

exports.fileFromPath = fileFromPath;
exports.type = type;
exports.File = File;
exports.file = file;
exports.profile = profile;

