/* fs.js: file system primitives
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require ('fs'),
    nodepath = require ('path');

var camp = require ('../camp/camp');

var type = require('./type');   // Type system.


// Here, we assume that the code runs in the lib/ directory.
var rootdir = '../root';  // directory that contains the root of the fs.



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



// Get the type associated to the extention of the file.
//
function mimeFromExtension (filename) {
  return camp.server.mime[nodepath.extname(filename).slice(1)] || 'text/plain';
};


/* `mimeType` is a String of an existing type.
 * `name` is a string.
 * `getcontent: function ( whengot: function(err, content) )`
 * is a function returning further information.
 *
 * - the content as a string for text files,
 * - an object with a property for each file, that links to the corresponding
 *   <File> object, for directories.
 *
 * This is the constructor for the File object.
 *
 *     var f = new File ( 'text/plain', 'myfile', function(whengot) {
 *       …
 *       var data = whatever ();
 *       whengot ( err, data );
 *     });
 *
 * - `f.path` is the path (as a String).
 * - `f.type` is the type of the file.
 * - `f.name` is the name of the file (supposedly doesn't contain `/`).
 * - `f.content` is the data associated to the file.
 *   Open the file before using it.
 * - `f.open` will count one more user editing that file.
 * - `f.close` will count one less user. (That doesn't really matter
 * for folders).
 * - `f.driver` contains additional functionality associated to files of this
 *   type.
 */
function File (path) {
  this.meta = {};
  nodefs.stat (path, function (err, stats) {
    if (err) {
      console.log('FS:File: cannot create file', path);
      return;
    }
    if (stats.isDirectory()) {
      this.meta.type = 'dir';
    } else if (stats.isFile()) {
      this.meta.type = type.fromName(mimeFromExtension(path));
    }
  });
  this.driver = type.driver(this.meta.type);
  this.path = path;
  this.count = 0;  // Number of users modifying the content.
  this.content = null;
};


File.prototype.content = function(doWithContent) {
  if (!this._gotcontent) {
    var that = this;
    getcontent(function(err, content) {
      // Give them the data.
      dowithcontent(err, content);
      if (!err) {
        that._content = content;
        that._gotcontent = true;
        bench.size += content.length;
      } else console.error('FS: getcontent had an error!');
    });
  } else {
    dowithcontent(null, this._content);
  }
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
  return type.isCompatible(this.type, type.fromName(mimeType));
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
  if (this.usercount <= 0) {
    console.log('FS:FILE: usercount is negative (%s). Keeping it at 0.',
        this.usercount);
    return;
  }
  this.usercount--;
  bench.openFiles--;
  if (this.usercount === 0 && this.driver.write) {
    this.driver.write(this.path, this.content, function(err) {
      if (err)  console.log('FS:WRITE:', err.message);
    });
  }
};


// `Subfiles` gives all the leafs of the tree recursively, as relative paths.
//
// The callback `cb` is of the form `function(err, leafs) { ... }`.
File.prototype.subfiles = function (cb, depth) {
  depth = depth !== undefined? depth: Infinity;

  // This function is meant to return [] if this is not a directory.
  if (!this.isOfType('dir')) { cb(undefined, []); return; }

  // The basic idea is that `processedfiles` will be incremented until it
  // reaches `totalfiles`, at which point we will be done, `paths` will be
  // complete.
  var paths = [], processedfiles = 0, totalfiles, that = this;

  var whengotsubfiles = function(filename) {
    return function(err, subfiles) {
      // Add all subfiles.
      for (var i = 0; i < subfiles.length; i++) {
        paths.push(nodepath.join(filename, subfiles[i]));
      }
      processedfiles++;
      if (processedfiles === totalfiles) {
        cb(undefined, paths);
      }
    };
  };

  this.content(function(err, content) {
    if (err) { cb(err); return; }

    totalfiles = Object.keys(content).length;
    for (var filename in content) {
      var file = content[filename];
      // Special case: what if `file` is not a leaf?
      if (file.isOfType('dir') && depth > 0) {
        // We need to recursively go deeper! ;)
        paths.push(file.name + '/');
        file.subfiles(whengotsubfiles(filename), depth - 1);
      } else {
        var trailingSlash = '';     // By default, no trailing slash.
        if (content[filename].isOfType('dir')) {
          trailingSlash = '/';
        }
        whengotsubfiles('')(undefined, [filename + trailingSlash]);
      }
    }
  });
};


// Read files from the hard drive.
//

// Return a fake path from the fake root (with no leading `/`).
function sanitizepath (path) {
  return nodepath.relative ('.', path).replace (/^(\.\.\/?)+/, '');
};

/* Convert a virtual path from the /root/ folder, to the filesystem path.
 * `path`: virtual path (in the form of a String).  
 * It needs to be sanitized with `sanitizepath`.
 */
function torealpath (path) {
  return nodepath.join (process.cwd(), nodepath.join (rootdir, path));
};

/* This hashmap registers all files ever asked for.
 * The keys are the *fake* paths of those files.
 */
var fsfiles = {};

/* Read the path, construct the file according to the filename.
 * `path`: String of "fake" path starting with a `/`.  
 * `callback`: function (err, <new File()>).  
 */
function getfile (path, callback) {
  var oldpath = path;
  path = sanitizepath(path);
  //console.log('FS:GETFILE: %s was sanitized to "%s"', oldpath, path);
  var realpath = torealpath (path);
  // If this file is already in memory, return that.
  if (fsfiles[path] !== undefined) {
    callback(undefined, fsfiles[path]);
    return;
  }

  nodefs.stat (realpath, function (err, stats) {
    if (!err) {

      //console.log('stats says that', realpath, (stats.isDirectory()? 'is a directory': 'is a file'));

      if (stats.isDirectory()) {
        // When creating a directory to memory, the getcontent
        // component is the following function.
        // It reads the files in the entry.
        var getcontent = function (whengotfile) {
          nodefs.readdir (realpath, function (err, files) {
            if (err)  { whengotfile(err); return; }
            //console.log('FS: directory files are', files);
            if (files.length === 0) {
              whengotfile (undefined, {});
            }
            var content = {};
            // We want to call back only when we've got all files.
            // We use a decrement to trace the progress.
            var fileslefttoprocess = files.length;
            for (var i = 0;  i < files.length;  i++) {
              getfile (
                nodepath.join (path, files[i]),
                function (err, file) {
                  fileslefttoprocess--;
                  if (err) { whengotfile (err); return; }
                  // We put each file in the content.
                  content[file.name] = file;
                  if (fileslefttoprocess === 0) {
                    whengotfile (undefined, content);
                  }
                }
              );
            }
          });
        };
        var newfile = new File (
            'dir',
            nodepath.basename (realpath),
            getcontent
        );

      } else if (stats.isFile()) {
        // When creating a file, the getcontent
        // seeks the content of the file.
        var getcontent = function (whengotfile) {
          // FIXME: right now, we assume utf8 text.
          nodefs.readFile (realpath, 'utf8', function (err, data) {
            if (err) { whengotfile (err, undefined); return; }
            whengotfile (undefined, data);
          });
        };
        var newfile = new File (
            mimeFromExtension(realpath),
            nodepath.basename (realpath),
            getcontent
        );
      }
      callback (undefined, newfile);
      fsfiles[path] = newfile;

    } else {
      callback (err);
    }
  });
};






// Initialization of the File System.
//
//   Yes, right here, right now. Impressive huh?
//

var rootfile;

getfile('/', function(err, root) {
  if (err) {
    console.log('FS: root file could not be loaded.');
    return;
  }
  rootfile = root;
});




// EXPORTS ARE HERE YOU BITCHES
//

exports.type = type;
exports.File = File;
exports.fsfiles = fsfiles;
exports.sanitizepath = sanitizepath;
exports.getfile = getfile;
exports.root = rootfile;

exports.profile = profile;

