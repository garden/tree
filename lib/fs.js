// File system primitives.
// Copyright © 2011-2013 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var nodefs = require ('fs');
var nodepath = require ('path');
var util = require('util');
var EditorOTServer = require('ot').EditorSocketIOServer;
var async = require('async');

var driver = require('./driver');   // Driver.
var type = require('./type');       // Type system.
var lookup = require('./lookup');   // Metadata lookup.
var pwdCheck = require('./pwd-check');  // Password check.



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
    {doc:'Core Size (warning — overstating)', data:bench.size, unit:'bytes'},
    {doc:'Max frenzy for a single file', data:bench.maxops, unit:'op/s'},
    {doc:'Max activity for a single file', data:bench.maxop, unit:'operations'},
    {doc:'Last modified file', data:bench.latestFile},
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

// `path` is a String identifying a unique virtual path to the file.
//
// This is the constructor for the File object.
//
//     file ( '/path/to/myfile', function(err, file) {
//       …
//     });
//
// - `f.path` is the path (as a String).
// - `f.meta` contains meta information, like the MIME `type`.
// - `f.type` holds a number. See lib/type.js.
// - `f.isOfType` is a method that takes a mime type (as a String).
//   Open the file before using it. Close it when you stop accessing it.
// - `f.open` will count one more user editing that file.
// - `f.close` will count one less user. (That doesn't really matter
//   for folders.)
// - `f.rm` will remove the file for good (if nobody is using it).
// - `f.driver` contains additional functionality associated to files of this
//   type.
// - `f.content`, the content as a string for text files,
//   or an object with a property for each file, that links to the corresponding
//   <File> object, for directories.
//
function File (path) {
  this.path = path;
  this.count = 0;   // Number of users modifying the content.
  this.content = null;
  this.type = null;
  this.meta = {};   // Default: empty (may be overriden by what is on disk).

  this.writo = null;    // Regular write timeout.
  this.nbops = 0;       // Number of operations since last period.
}

// From (fake) paths to already loaded files.
var fileFromPath = Object.create(null);

function file(vpath, cb) {
  var path = driver.normalize(vpath);
  if (fileFromPath[path] !== undefined) {
    cb(null, fileFromPath[path]);
    return;
  }

  var that = fileFromPath[path] = new File(path);
  resetType(that, cb);
}

function resetType(file, cb) {
  cb = cb || function(){};
  driver.loadMeta(file.path, function (err, meta) {
    if (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      console.error('error', err, err.code, 'with metadata of', file.path);
      // The metadata will be written to disk because it doesn't have a type.
      file.meta = {};
    } else {
      file.meta = meta || {};
    }

    guessType(file, function (err, td) {  // td = type descriptor.
      if (err) {
        //console.error("While guessing type of", file.path, err.stack);
        delete fileFromPath[file.path];
        cb(err);
        return;
      }
      if (td == null) { td = type.fromName['binary']; }
      file.type = td;
      file.driver = type.driver(file.type);

      if (file.meta.type == null) {
        file.meta.type = type.nameFromType[file.type];
        file.writeMeta();
      }
      if (file.meta['Last-Modified'] === undefined) {
        file.touch();
        file.writeMeta();
      }
      cb(null, file);
    });
  });
}

// Guess the type of the file at load-time.
// Sets the file's `type` property (determines the driver).
// Assumes the file's metadata is loaded.
//
// If the metadata's "type" is set, use that.
// Else, use stat and extension information ("types").
// You get the MIME type.
// Then get the metadata's "drivers" information, and set
// the file's type to that.
function guessType(file, cb) {
  var findmeta = lookup(file, {});
  // Check the metadata's "type".
  if (file.meta.type != null) {
    driverFromMime(findmeta, file.meta.type, cb);
  } else {

    var npath = driver.normalize(file.path);
    nodefs.stat(driver.relative(npath), function (err, stats) {
      if (err) { cb(err); return; }
      if (stats.isDirectory()) {
        driverFromMime(findmeta, 'dir', cb);
      } else if (stats.isFile()) {
        // Pick the type from metadata.
        findmeta('types[' +
          JSON.stringify(nodepath.extname(npath).slice(1))
          + ']', function(mime) {
          file.meta.type = mime;
          driverFromMime(findmeta, mime, cb);
        });
      } else {
        cb(new Error("File is neither a directory, nor a file."));
      }
    });

  }
}

// MIME type → driver type.
function driverFromMime(findmeta, mime, cb) {
  findmeta('drivers[' + JSON.stringify(mime) + ']', function(driverType) {
    cb(null, type.fromName[driverType]);
  });
}


// Checks whether a `file` is of type `typename` (or falls back into it).
//
// `ts`: a string, case-perfect match of a defined Type (see lib/type.js).
//
// Warning: this is not *cycle-safe* just yet. This is only an issue if you
// have mistakenly created a loop in the type system.
// It can really screw everything up though.
File.prototype.isOfType = function (ts) {
  if (this.type === undefined) {
    console.error('fs:isoftype: file %s has no type.', this.path);
  }
  return type.isCompatible(this.type, type.fromName[ts]);
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

function fopen(vpath, cb) {
  file(vpath, function(err, f) {
    if (err != null) { return cb(err); }
    f.open(function(err) { cb(err, f); f.close(); });
  });
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
    console.error('fs:file: %s count is negative (%s). Keeping it at 0.',
        this.path, this.count);
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
    if (this.path !== '/') delete fileFromPath[this.path];
  }
};

File.prototype.write = function (cb) {
  if (this.content !== null && this.driver.write) {
    this.driver.write(this.path, this.content, this.meta, cb);
  } else cb(Error("Content not loaded or no write driver found."));
};

File.prototype.writeMeta = function (cb) {
  var file = this;
  driver.dumpMeta(this.path, this.meta, function() { resetType(file, cb); });
};

File.prototype.touch = function () {
  this.meta['Last-Modified'] = Date.now();
};


File.prototype.ot = function (io, cb) {
  var channel = io.of(this.path);
  var file = this;
  this.open(function (err) {
    if (err) {
      cb(err); file.close(); return;
    } else if (!channel.codeMirrorServer) {
      channel.codeMirrorServer = new EditorOTServer(
          file.content,
          [],
          file.path,
          function (socket, cb) { cb(!!socket.mayEdit); }
      );

      channel.on('connection', function (socket) {
        channel.codeMirrorServer.addClient(socket);
        socket.on('login', function (loginData) {
          pwdCheck(file, loginData.writekey, 'writekey', function(err) {
            if (err == null) {
              // Set to false if the user shouldn't be allowed to edit.
              socket.mayEdit = true;
              channel.codeMirrorServer.setName(socket, '' + (+new Date()));
              socket.emit('logged_in', {});
            }
          });
        });

        socket.on('disconnect', function () { file.close(); });

        socket.on('operation', function () {
          file.nbops++;
          file.content = channel.codeMirrorServer.document;
          file.touch();
          bench.latestFile = file.path;
        });
      });

      cb(null);
    } else {
      cb(null);
    }
  });
};


// Remove this file.
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
    delete fileFromPath[this.path];

    this.driver.rm(this.path, cb);
  } else {
    console.error("fs:file:rm: cannot rm file %s of driver %s.",
        this.path, util.inspect(this.driver));
  }
};


// The following functions are directory-only.

// Create a leaf to a directory.
File.prototype.create = function (name, type, cb) {
  if (!this.isOfType('dir')) {
    console.error("fs:file:create: tried to create %s from non-folder %s.",
        name, this.path);
    cb(new Error("You can only create a leaf on a directory."));
    return;
  }
  // We don't want name to have slashes (avoid attacks).
  if (name.indexOf('/') !== -1) {
    console.error("fs:file:create: cannot create leaf %s which has a /.", name);
    cb(new Error("You cannot create a leaf with a slash."));
  } else {
    var self = this;
    var path = nodepath.join(this.path, name);
    if (type === 'dir') {
      this.driver.mkdir(path, function (err) {
        if (!err) { self.touch(); }
        cb(err);
      });
    } else {
      this.driver.mkfile(path, function (err) {
        if (err) { return cb(err); }
        self.touch();
        file(path, function(err, f) {
          if (err) { return cb(err); }
          guessType(f, function(err, td) {
            if (err) { return cb(err); }
            if (!f.isOfType(type)) {
              f.meta.type = type;
            }
            f.writeMeta(cb);
          });
        });
      });
    }
  }
};

// Relocate data from tmpname into this directory.
File.prototype.import = function(tmpname, name, cb) {
  if (this.driver.import) {
    // We don't want name to have slashes (avoid attacks).
    if (name.indexOf('/') !== -1) {
      console.error("fs:file:import: cannot import file %s which has a /.", name);
    } else {
      var self = this;
      this.driver.import(tmpname, this.path + '/' + name, function (err) {
        if (!err) { self.touch(); }
        cb(err);
      });
    }
  } else {
    console.error("fs:file:import: tried to import file %s to non-folder %s.",
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
      file(nodepath.join(folder.path, item), function(err, f) {
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

// `Subfiles` gives all the leaves of the tree recursively, as relative paths.
//
// The callback `cb` is of the form `function(err, leaves) { … }`.
File.prototype.subfiles = function (cb, depth) {
  depth = depth !== undefined? depth: Infinity;

  // This function is meant to return [] if this is not a directory.
  if (!this.isOfType('dir')) { cb(null, []); return; }

  var folder = this,
      paths = [];

  folder.open(function(err) {
    async.forEach(folder.content, function(item, cb2) {
      file(nodepath.join(folder.path, item), function(err, f) {
        if (err) { cb2(err); return; }
        var isDir = f.isOfType('dir');
        paths.push(item + (isDir? '/': ''));

        if (depth > 0 && isDir) {
          // We need to go deeper! ☺
          f.subfiles(function(err, leaves) {
            for (var i = 0; i < leaves.length; i++) {
              leaves[i] = nodepath.join(item, leaves[i]);
            }
            paths = paths.concat(leaves);
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




// Exports.

exports.fileFromPath = fileFromPath;
exports.type = type;
exports.file = file;
exports.open = fopen;
exports.profile = profile;

