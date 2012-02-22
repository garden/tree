/* File system primitives.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require ('fs'),
    nodepath = require ('path'),
    util = require('util'),
    async = require('async');

var type = require('./type');   // Type system.



// Gather information for the profiler.
//
// Numbers are to computer science what a telescope is to an astrophysicist.

var bench = {
  openFiles: 0,
  totalOpenFilesEver: 0,
  size: 0,
};

function profile () {
  return [
    {doc:'Number of open files', data:bench.openFiles},
    {doc:'Total opened files', data:bench.totalOpenFilesEver},
    {doc:'Core Size (warning -- overstating) (bytes)', data:bench.size},
  ];
};




// Directory primitives.

// `path` is a String identifying a unique path to the file.
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
function File (path, cb, meta) {
  this.meta = {};
  var that = this;
  type.guessType(path, function (err, td) {
    if (err) { cb(err); return; }
    that.meta.type = td;    // `td`: type descriptor (Number).
    that.driver = type.driver(td);
    cb(null, that);
  });
  this.path = path;
  this.count = 0;  // Number of users modifying the content.
  this.content = null;
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
    console.log('fs:isoftype: file %s has no type.', this.path)
  }
  return type.isCompatible(this.meta.type, type.fromName[mimeType]);
};


// When you open a file, its content becomes synchronous, immediately available.
// Use it when you need to use readSync and writeSync.
File.prototype.open = function (cb) {
  // If this file had no user, populate the content.
  if (this.count === 0) {
    var that = this;
    this.driver.read(this.path, function(err, data) {
      if (err !== null) {
        console.log('FS:OPEN:', err.message);
      } else {
        that.content = data;
        // Strings are UCS-2 (or UTF-16): characters are 2 bytes.
        if (data.length)  bench.size += that.content.length * 2;
      }
      cb(err);
    });
  }

  // Counts.
  this.count++;
  bench.openFiles++;
  bench.totalOpenFilesEver++;
};

File.prototype.close = function () {
  if (this.count <= 0) {
    console.log('FS:FILE: count is negative (%s). Keeping it at 0.',
        this.count);
    return;
  }

  this.count--;
  bench.openFiles--;
  if (this.count === 0) {
    if (this.driver.write) {
      var that = this;
      this.driver.write(this.path, this.content, function(err) {
        if (err) { console.log('FS:WRITE:', err.message); return; }
        that.content = null;    // Let it be garbage-collected.
      });
    } else this.content = null;
    delete fileFromPath[this.path];
  }
};


File.prototype.rm = function (cb) {
  if (this.count > 0) {
    // Someone is still editing the file, we can't close it!
    console.error("FS:file:rm: file %s has a positive count %s.",
        this.path, this.count);
  }

  if (this.driver.rm) {
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
      this.driver.mkdir(nodepath.join(this.path, name), cb);
    }
  } else {
    console.error("FS:file:mkdir: tried to make folder %s from non-folder %s.",
        name, this.path);
  }
};

File.prototype.mkfile = function (name, cb) {
  if (this.isOfType('dir')) {
    // We don't want name to have slashes (avoid attacks).
    if (name.indexOf('/') !== -1) {
      console.error("FS:file:mkdir: made folder %s which has a /.", name);
    } else {
      this.driver.mkfile(nodepath.join(this.path, name), cb);
    }
  } else {
    console.error("FS:file:mkfile: tried to make file %s from non-folder %s.",
        name, this.path);
  }
};


// `Subfiles` gives all the leafs of the tree recursively, as relative paths.
//
// The callback `cb` is of the form `function(err, leafs) { ... }`.
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
        paths.push(f.path + (isDir? '/': ''));

        if (depth > 0 && isDir) {
          // We need to go deeper! ☺
          f.subfiles(function(err, leafs) {
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
 * - `path`: String of "fake" path starting with a `/`.
 * - `cb`: function (err, <new File()>).
 */
function file (path, cb) {
  // Sanitize the path.
  path = nodepath.relative ('.', path).replace (/^(\.\.\/?)+/, '');

  var mem = fileFromPath[path];
  if (mem !== undefined) {
    cb(null, mem);
    return;
  }

  new File(path, function(err, file) {
    cb(err, file);
    fileFromPath[path] = file;
  });
}








// EXPORTS ARE HERE YOU BITCHES
//

exports.type = type;
exports.File = File;
exports.file = file;

exports.profile = profile;

