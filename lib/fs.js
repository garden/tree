// File system primitives.
// The following code is covered by the AGPLv3 license.

var fs = require ('fs');
var nodepath = require ('path');
var util = require('util');
var EditorOTServer = require('ot').EditorSocketIOServer;
var async = require('async');

var driver = require('./driver');   // Driver.
var type = require('./type');       // Type system.
var lookup = require('./lookup');   // Metadata lookup.
var pwdCheck = require('./pwd-check');  // Password check.

// NEW CODE
var camp = require('camp');
var mimeTypes = camp.mime;
var stream = require('stream');
var Writable = stream.Writable;
var metadata = JSON.parse(fs.readFileSync('metadata.json'));

// Return a Promise<ReadableStream>.
// options:
// - depth: 0 to include subfile metadata, 1 to include their subfiles and
//  metadata, etc.
function getStream(path, options) {
  options = options || {};
  var realPath = realFromVirtual(path);
  // Stat it; if it is a directory, send a JSON list of subfiles; otherwise the
  // content.
  return new Promise(function(resolve, reject) {
    fs.stat(realPath, function(err, stats) {
      if (err != null) { reject(err); return; }
      if (stats.isFile()) {
        resolve(fs.createReadStream(realPath));
      } else if (stats.isDirectory()) {
        var subfiles = flatSubfiles(path, options.depth);
        resolve(streamFromData(Buffer.from(JSON.stringify(subfiles))));
      } else {
        reject(new Error('getStream: unknown file type on disk'));
      }
    });
  });
}

// Return the `files` field of a directory, without the subsubfiles.
// depth: if < 0, return just a list of file names.
//   If 0, a map from file names to {meta: …}.
//   If 1 or more, include subfiles recursively.
function flatSubfiles(path, depth) {
  var pointer = pathMetaPointer(path);
  pointer.push('files');
  var data = findPointer(pointer, metadata);
  if (depth < 0) { return Object.keys(data); }
  return listFiles(data, depth);
}

// files: map from file to {meta, files}
// depth: number
function listFiles(files, depth) {
  var result = {};
  for (var key in files) {
    result[key] = { meta: cloneValue(files[key].meta) };
    if (depth > 0) {
      result[key].files = listFiles(files[key].files, depth - 1);
    }
  }
  return result;
}

// Same as getStream(), but returns a Promise<Buffer>.
// options:
// - depth: 0 to include subfile metadata, 1 to include their subfiles and
//  metadata, etc.
function get(path, options) {
  return new Promise(function(resolve, reject) {
    var content = Buffer.alloc(0);
    var writer = new stream.Writable({
      write: function(chunk, encoding, callback) {
        content = Buffer.concat([content, chunk]);
        callback();
      },
    });
    writer.on('finish', function() { resolve(content); });
    writer.on('error', reject);
    getStream(path, options).then(function(stream) { stream.pipe(writer); });
  });
}

function pathMetaPointer(path) {
  var list = (path === '/') ? [] : path.slice(1).split('/');
  var pointer = [];
  for (var i = 0; i < list.length; i++) {
    pointer.push('files', list[i]);
  }
  return pointer;
}

// Return the metadata for path.
function meta(path) {
  var pointer = pathMetaPointer(path);
  pointer.push('meta');
  return Promise.resolve(findPointer(pointer, metadata));
}

// Get the element pointed to by pointer in the path's metadata.
// options:
// - meta: if set, assume that the path's metadata is this.
// - or: list of JSON pointers to use if the search yields nothing.
function metaGet(pointer, path, options) {
  options = options || {};
  var metadata = options.meta;
  if (typeof pointer === 'string') { pointer = listFromJsonPointer(pointer); }
  var pointers = [pointer];
  if (options.or !== undefined) {
    options.or = options.or.map(function(pointer) {
      if (typeof pointer === 'string') {
        return listFromJsonPointer(pointer);
      } else { return pointer; }
    });
    var pointers = pointers.concat(options.or);
  }
  return new Promise(function(resolve, reject) {
    if (metadata !== undefined) {
      resolve(findFirstPointer(pointers, metadata));
    } else {
      meta(path)
      .then(function(metadata) { resolve(findFirstPointer(pointers, metadata)); })
      .catch(reject);
    }
  });
}

// Get the element pointed to by pointer in the path's metadata
// or its ancestry's.
// options:
// - meta: if set, assume that the path's metadata is this.
// - or: list of JSON pointers to use if the search yields nothing.
function metaFind(pointer, path, options) {
  options = options || {};
  if (typeof pointer === 'string') { pointer = listFromJsonPointer(pointer); }
  return new Promise(function(resolve, reject) {
    metaGet(pointer, path, options)
    .then(function(found) {
      if (found !== undefined) { resolve(found); }
      else if (path === '/') { resolve(undefined); }
      else {
        metaFind(pointer, nodepath.dirname(path), {or: options.or})
        .then(resolve)
        .catch(reject);
      }
    })
    .catch(reject);
  });
}

// options:
// - type: defaults to guessing the type.
function create(path, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var realPath = realFromVirtual(path);
    var parent = nodepath.dirname(path);
    var parentInfo = findPointer(pathMetaPointer(parent), metadata);
    var filename = nodepath.basename(path);
    var now = new Date().toISOString();
    var newMetadata = { modified: now, updated: now };

    if (options.type === 'folder') {
      fs.mkdir(realPath, function(err) {
        if (err != null) { reject(err); return; }
        newMetadata.type = options.type;
        parentInfo.files = parentInfo.files || {};
        parentInfo.files[filename] = {meta: newMetadata, files: {}};
        resolve();
      });
    } else {
      ((options.type === undefined) ?
        guessType(path) :
        Promise.resolve(options.type)
      ).then(function(type) {
        // Creating a raw binary file makes no sense; those are only uploaded.
        if (type === 'binary') { type = 'text'; }
        fs.writeFile(realPath, '', {flag: 'ax'}, function(err) {
          if (err != null) { reject(err); return; }
          newMetadata.type = type;
          parentInfo.files = parentInfo.files || {};
          parentInfo.files[filename] = {meta: newMetadata};
          resolve();
        });
      }).catch(reject);
    }
  });
}

function remove(path) {
  return new Promise(function(resolve, reject) {
    var realPath = realFromVirtual(path);
    fs.stat(realPath, function(err, stats) {
      if (err != null) { reject(err); return; }

      var filename = nodepath.basename(path);
      var parent = nodepath.dirname(path);
      var parentInfo = findPointer(pathMetaPointer(parent), metadata);

      if (stats.isFile()) {
        fs.unlink(realPath, function(err) {
          if (err != null) { reject(err); return; }
          delete parentInfo.files[filename];
          resolve();
        });
      } else if (stats.isDirectory()) {
        fs.rmdir(realPath, function(err) {
          if (err != null) { reject(err); return; }
          delete parentInfo.files[filename];
          resolve();
        });
      } else {
        reject(new Error('delete: unknown file type on disk'));
      }
    });
  });
}

function realFromVirtual(path) {
  return driver.absolute(path);
}

// Return a plausible MIME type for the file, or 'binary', in a promise.
function guessType(path) {
  var ext = nodepath.extname(path).slice(1) || nodepath.basename(path);
  return new Promise(function(resolve, reject) {
    metaFind(['mime', ext], path)
    .then(function(mime) { resolve(mime || mimeTypes[ext] || 'binary'); })
    .catch(reject);
  });
};

// Return the first element found in json for a pointer.
function findFirstPointer(pointers, json) {
  for (var i = 0, len = pointers.length; i < len; i++) {
    var found = findPointer(pointers[i], json);
    if (found !== undefined) { return found; }
  }
}

// Return the element in json that is identified by pointer.
function findPointer(pointer, json) {
  pointer = pointer.slice();
  while (pointer.length > 0) {
    if (json === undefined) { return; }
    json = json[pointer.shift()];
  }
  return json;
};

// Convert a JSON Pointer to a list.
var listFromJsonPointer = function(pointer) {
  if (typeof pointer !== 'string') {
    throw new Error('listFromJsonPointer() only supports strings, ' +
      'something else was given')
  }

  var parts = pointer.split('/').slice(1)
  return parts.map(function(part) {
    if (!/~/.test(part)) { return part }
    // It is important to end with the ~ replacement,
    // to avoid converting `~01` to a `/`.
    return part.replace(/~1/g, '/').replace(/~0/g, '~')
  })
}

var jsonPointerFromList = function(path) {
  if (!(Object(path) instanceof Array)) {
    throw new Error('jsonPointerFromList() only supports arrays, ' +
      'something else was given')
  }

  return '/' + path.map(function(part) {
    // It is important to start with the ~ replacement,
    // to avoid converting `/` to `~01`.
    return part.replace(/~/g, '~0').replace(/\//g, '~1')
  }).join('/')
}

function cloneValue(v) {
  if (v == null || typeof v === 'boolean' || typeof v === 'number'
      || typeof v === 'string') {
    return v;
  } else if (Object(v) instanceof Array) {
    return v.slice().map(cloneValue);
  } else {
    return cloneObject(v);
  }
}

function cloneObject(obj) {
  var res = Object.create(null);
  for (var key in obj) {
    res[key] = cloneValue(obj[key]);
  }
  return res;
}

function streamFromData(data) {
  var newStream = new stream.Readable();
  newStream._read = function() { newStream.push(data); newStream.push(null); };
  return newStream;
}

exports.create = create;
exports.remove = remove;
exports.get = get;
exports.getStream = getStream;
exports.meta = meta;
exports.metaGet = metaGet;
exports.metaFind = metaFind;
exports.guessType = guessType;
exports.realFromVirtual = realFromVirtual;

// END OF NEW CODE



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

// This is the constructor for the File object.
//
//     file ( '/path/to/myfile', function(err, file) {
//       …
//     });
//
// It provides the file's JSON metadata instantly, and its type, which
// determines what JSON form its content will hold, and what driver operations
// are available. When read()-ing the file, the content is populated, and
// destroyed once the callback ends. To maintain the content, open() the file,
// and close() it when you are done. A reference counter is at work internally.
//
// - `f.path` is the virtual path to the file (as a String).
// - `f.meta` contains meta information, like the MIME `type`.
// - `f.type` holds a number. See lib/type.js. TODO: make it a string.
// - `f.isOfType` is a method that takes a mime type (as a String). Deprecate.
// - `f.open` will populate `f.content`.
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

function fopen(vpath, cb) {
  file(vpath, function(err, f) {
    if (err != null) { return cb(err); }
    f.open(function(err) { cb(err, f); });
  });
}

function resetType(file, cb) {
  cb = cb || function(){};
  driver.loadMeta(file.path, function (err, meta) {
    if (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      console.error('error', err, err.code, 'with metadata of', file.path);
      console.error('stack', err.stack);
      // The metadata will be written to disk because it doesn't have a type.
      file.meta = {};
    } else {
      file.meta = meta || {};
    }

    guessType(file, function guessedType(err, td) {  // td = type descriptor.
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
//function guessType(file, cb) {
//  var findmeta = lookup(file, {});
//  // Check the metadata's "type".
//  if (file.meta.type != null) {
//    driverFromMime(findmeta, file.meta.type, cb);
//  } else {
//
//    var npath = driver.normalize(file.path);
//    fs.stat(driver.relative(npath), function fileStats(err, stats) {
//      if (err) { cb(err); return; }
//      if (stats.isDirectory()) {
//        driverFromMime(findmeta, 'dir', cb);
//      } else if (stats.isFile()) {
//        // Pick the type from metadata.
//        findmeta('types[' +
//          JSON.stringify(nodepath.extname(npath).slice(1) ||
//            nodepath.basename(npath))
//          + ']', function(mime) {
//            file.meta.type = mime;
//            driverFromMime(findmeta, mime, cb);
//        });
//      } else {
//        cb(new Error("File is neither a directory, nor a file."));
//      }
//    });
//
//  }
//}

// MIME type → driver type.
function driverFromMime(findmeta, mime, cb) {
  findmeta('drivers[' + JSON.stringify(mime) + ']',
      function foundDriverTypeFromMime(driverType) {
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

// When you open a file, its content becomes synchronous, immediately available.
// Use it when you need to use readSync and writeSync.
File.prototype.open = function (cb) {
  //console.log('opening file', this.path);
  this.count++;
  bench.count[this.path]++;
  var self = this;
  // Decrease the counter upon calling cb.
  var callcb = function(err, data) {
    // content should be set.
    cb(err, data);
    self.count--;
    bench.count[self.path]--;
    if (self.count <= 0) {
      if (self.count < 0) {
        console.error('fs:open: refcount at ' + self.count +
            ' for file ' + self.path + '.');
      }
      self.count = 0;
      // Write file content to disk before closing.
      clearInterval(self.writo);
      bench.openFiles--;
      if (self.driver != null && self.driver.write != null) {
        self.write(function(err) {
          if (err) { console.error('fs:open: writing while closing', err.message); }
          self.content = null;  // Let it be garbage-collected.
        });
      } else { self.content = null; }
    }
  };
  // If this file had no user, populate the content.
  if (this.content == null) {
    if (this.driver == null) {
      callcb(new Error('Driverless file ' + self.path));
      return;
    }
    this.driver.read(this.path, function(err, data) {
      if (err !== null) {
        console.error('fs:open:' + self.path, err.message);
      } else {
        self.content = data;
        // Strings are UCS-2 (or UTF-16): characters are 2 bytes.
        if (data.length) { bench.size += self.content.length * 2; }

        // Counts.
        bench.openFiles++;
        bench.totalOpenFilesEver++;

        if (self.driver.write) {
          self.writo = setInterval(writeAtPeriod.bind(self), File.writePeriod);
        }
      }
      callcb(err, data);
    });
  } else {
    callcb(null);
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
      cb(err); return;
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

        socket.on('disconnect', function () { });

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
    });
  });
};




// Exports.

exports.fileFromPath = fileFromPath;
exports.type = type;
exports.file = file;
exports.open = fopen;
exports.profile = profile;

