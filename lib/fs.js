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
  nbops: {},        // Number of operations per second (for each file).
  nbop: {},         // Number of operations (for each file).
  maxops: ["", 0],
  maxop: ["", 0],
  count: {},        // Number of users (for each file).
  latestFile: "",   // Latest file modified.
};

function profile (param) {
  var data = [
    {doc:'Number of open files', data:bench.openFiles, unit:'files'},
    { doc:'Number of opened files ever',
      data:bench.totalOpenFilesEver,
      unit:'files' },
    {doc:'Core Size (warning -- overstating)', data:bench.size, unit:'bytes'},
    {doc:'Max frenzy for a single file', data:bench.maxops, unit:'op/s'},
    {doc:'Max activity for a single file', data:bench.maxop, unit:'operations'},
    {doc:'Latest modified file', data:bench.latestFile},
  ];
  if (param && param.path) {
    data.push({
      doc: 'Frenzy at ' + param.path,
      data: bench.nbops[param.path] || 0,
      unit: 'operations/sec',
    });
    data.push({
      doc: 'Activity at ' + param.path,
      data: bench.nbop[param.path] || 0,
      unit: 'operations',
    });
    data.push({
      doc: 'Number of users at ' + param.path,
      data: bench.count[param.path] || 0,
      unit: 'users'
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
//     newFile ( '/path/to/myfile', function(err, file) {
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
function File (path) {
  this.path = path;
  this.count = 0;   // Number of users modifying the content.
  this.content = null;
  this.type = null;
  this.meta = {};   // Default: empty (may be overriden by what is on disk).

  this.writo = null;    // Regular write timeout.
  this.nbops = 0;       // Number of operations since last period.
}

var fileFromPath = {};  // From (fake) paths to already loaded files.

function file (vpath, cb) {
  var path = driver.normalize(vpath);
  if (fileFromPath[path] !== undefined) {
    cb(null, fileFromPath[path]);
    return;
  }

  var that = fileFromPath[path] = new File(path);
  type.guessType(that.path, function (err, td) {
    if (err) {
      //console.error("While guessing type of", that.path, err.stack);
      cb(err);
      return;
    }
    if (td === undefined) {
      that.type = type.fromName['text/plain'];
    } else {
      that.type = td;    // `td`: type descriptor (Number).
    }
    that.driver = type.driver(that.type);

    driver.loadMeta(that.path, function (err, meta) {
      if (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        console.error("While loading metadata for", that.path, ":", err.stack);
        cb(err, null);
      } else {
        that.meta = meta || {};
      }

      if (that.meta.type === undefined) {
        that.meta.type = type.nameFromType[that.type];
        driver.dumpMeta(that.path, that.meta);
      }
      cb(null, that);
    });
  });
}



// Checks whether a `file` is of type `typename` (or falls back into it).
//
// - `file`: a File.
// - `mimeType`: a string, case-perfect match of a defined Type.
//
// Warning: this is not *cycle-safe* just yet. This is only an issue if you
// have mistakenly created a loop in the type system.
// It can really screw everything up though.
File.prototype.isOfType = function (mimeType) {
  if (this.type === undefined) {
    console.error('fs:isoftype: file %s has no type.', this.path);
  }
  return type.isCompatible(this.type, type.fromName[mimeType]);
};

// We try to write the file to disk every half minute.
File.writePeriod = 30000;

// The following function is meant to be bound to a file.
// It writes the file to disk if there were modifications.
function writeAtPeriod() {
  if (!bench.nbop[this.path])  bench.nbop[this.path] = 0;
  bench.nbop[this.path] += this.nbops;
  bench.nbops[this.path] = this.nbops / File.writePeriod * 1000;
  if (bench.maxops[1] <= this.nbops) {
    bench.maxops = [this.path, bench.nbops[this.path]];
  }
  if (bench.maxop[1] <= bench.nbop[this.path]) {
    bench.maxop = [this.path, bench.nbop[this.path]];
  }
  if (this.nbops > 0) {
    this.write();
  }
  this.nbops = 0;
}

// When you open a file, its content becomes synchronous, immediately available.
// Use it when you need to use readSync and writeSync.
File.prototype.open = function (cb) {
  //console.log('opening file', this.path);
  // If this file had no user, populate the content.
  if (this.count <= 0) {
    var that = this;
    this.driver.read(this.path, function(err, data) {
      if (err !== null) {
        console.error('fs:open:', err.message);
      } else {
        that.content = data;
        // Strings are UCS-2 (or UTF-16): characters are 2 bytes.
        if (data.length)  bench.size += that.content.length * 2;

        // Counts.
        that.count++;
        bench.openFiles++;
        bench.totalOpenFilesEver++;
        bench.count[that.path] = 1;

        if (that.driver.write) {
          that.writo = setInterval(writeAtPeriod.bind(that), File.writePeriod);
        }
      }
      cb(err, data);
    });
  } else {
    // Counts.
    this.count++;
    bench.openFiles++;
    bench.totalOpenFilesEver++;
    bench.count[this.path]++;
    cb(null);
  }
};

File.prototype.close = function () {
  //console.log('closing file', this.path);
  if (this.count <= 0) {
    console.error('fs:file: count is negative (%s). Keeping it at 0.',
        this.count);
  } else {
    this.count--;
    bench.openFiles--;
    bench.count[this.path]--;
  }

  if (this.count === 0) {
    var self = this;
    if (this.driver.write) {
      clearInterval(this.writo);
      this.write(function (err) {
        if (err) console.error('fs:write:', err.message);
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

File.prototype.writeMeta = function (cb) {
  driver.dumpMeta(this.path, this.meta, cb);
};


File.prototype.ot = function (io, cb) {
  var channel = io.of(this.path),
      file = this;
  this.open(function (err) {
    if (err) {
      cb(err); file.close(); return;
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

        socket.on('disconnect', function () { file.close(); });

        socket.on('operation', function () {
          file.nbops++;
          file.content = channel.codeMirrorServer.str;
          bench.latestFile = file.path;
        });
      });

      cb(null);
    } else {
      file.close();
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
      console.error("fs:file:mkdir: made folder %s which has a /.", name);
    } else {
      this.driver.mkdir(this.path + '/' + name + '/', cb);
    }
  } else {
    console.error("fs:file:mkdir: tried to make folder %s from non-folder %s.",
        name, this.path);
  }
};

File.prototype.mkfile = function (name, cb) {
  if (this.driver.mkfile) {
    // We don't want name to have slashes (avoid attacks).
    if (name.indexOf('/') !== -1) {
      console.error("fs:file:mkdir: made folder %s which has a /.", name);
    } else {
      this.driver.mkfile(this.path + '/' + name, cb);
    }
  } else {
    console.error("fs:file:mkfile: tried to make file %s from non-folder %s.",
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


// Exports.

exports.fileFromPath = fileFromPath;
exports.type = type;
exports.file = file;
exports.profile = profile;

