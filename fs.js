/* fs.js: file system primitives
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var Camp = require ('./lib/camp.js');

// All data currently available in memory will be stored here.
//

exports.fs = undefined;

var nodefs = require ('fs'),
    nodepath = require ('path');

var rootdir = '../root';  // directory that contains the root of the fs.

// Type system.
//

var types = [];        // contains lists of parent types (all being integers).
var type = (function () {
  var mime = {};       // contains link between mime type and integer.
  var nbtypes = 0;     // number of different types.

  // `newtype` is a string of the mime type.
  // `parents` is a list of integers containing the parent types.
  // You get the number corresponding to the type.
  return function (newtype, parents) {
    if (mime[newtype] !== undefined) {
      return mime[newtype];
    } else {
      types.push (parents);
      mime[newtype] = nbtypes;
      return nbtypes++;
    }
  };
})();

// Defining current types (and their compatibility table).
type ('notfound');
type ('dir');            // contains a JSON string of files.
type ('binary');
type ('text/plain');
type ('text/html', [types['text/plain']]);
type ('text/xml', [types['text/plain']]);
type ('text/css', [types['text/plain']]);
type ('text/dtd', [types['text/plain']]);

type ('application/javascript', [types['text/plain']]);
type ('application/json', [types['text/plain']]);
type ('text/csv', [types['text/plain']]);

type ('application/ps', [types['binary']]);
type ('application/pdf', [types['binary'], types['application/ps']]);

type ('image/jpeg', [types['binary']]);
type ('image/tiff', [types['binary']]);
type ('image/gif', [types['binary']]);
type ('image/vnd.microsoft.icon', [types['binary']]);
type ('image/png', [types['binary']]);
type ('image/svg', [types['text/plain']]);




// Directory primitives.


/* `type` is a string taken from the `types` enumeration.  
 * `name` is a string.  
 * `getcontent: function ( whengot: function(err, content) )`
 * is a function returning further information.  
 * It is the constructor for the File object.
 *
 *     var f = new File ( 'text/plain', 'myfile', function(whengot) {
 *       …
 *       var data = whatever ();
 *       whengot ( err, data );
 *     });
 *
 * File::type is the type of the file.  
 * File::name is the name of the file (supposedly doesn't contain `/`)  
 * File::content is a function which you feed `function(err, content) {…}`.
 */
var File = function (type, name, getcontent) {
  this.type = types[type] || types['text/plain'];
  this.name = name;
  this._gotcontent = false;
  this._content;
  this.content = function memoizer(dowithcontent) {
    if (!this._gotcontent) {
      var that = this;
      getcontent(function(err, content) {
        // Give them the data.
        dowithcontent(err, content);
        if (!err) {
          that._content = content;
          that._gotcontent = true;
        }
      });
    } else {
      dowithcontent(undefined, this._content);
    }
  };
};


// Read files from the hard drive.
//

/* Convert a virtual path from the /root/ folder, to the filesystem path.
 * `path`: virtual path (in the form of a String).  
 */
var torealpath = function (path) {
  path = nodepath.relative ('.', path).replace (/^(\.\.\/?)+/, '');
  return nodepath.join (process.cwd(), rootdir, path);
};

/* This hashmap registers all files ever asked for.
 * The keys are the *real* paths of those files.
 */
var fsfiles = {};

/* Read the path, construct the file according to the filename.
 * `path`: String of "fake" path starting with a `/`.  
 * `callback`: function (err, <new File()>).  
 */
var getfile = exports.getfile = function (path, callback) {
  var realpath = torealpath (path);
  // If this file is already in memory, return that.
  if (fsfiles[realpath] !== undefined) {
    callback(undefined, fsfiles[realpath]);
    return;
  }

  nodefs.stat (realpath, function (err, stats) {
    if (!err) {

      if (stats.isDirectory()) {
        // When creating a directory to memory, the getcontent
        // component is the following function.
        // It reads the files in the entry.
        var getcontent = function (whengotfile) {
          nodefs.readdir (realpath, function (err, files) {
            if (!err) {
              var content = {};
              for (var i = 0; i < files.length; i++) {
                // We now wish to get all files before giving the result.
                // We use a decrement to trace this.
                var fileslefttoprocess = files.length;
                getfile (
                  nodepath.join (path, files[i]),
                  function (err, file) {
                    fileslefttoprocess--;
                    if (!err) {
                      // We put each file in the content.
                      content[file.name] = file;
                      if (fileslefttoprocess === 0) {
                        whengotfile (undefined, content);
                      }
                    }
                  }
                );
              }
            } else {
              whengotfile (err);
            }
          });
        };
        var newfile = new File (
            'dir',
            nodepath.basename (realpath),
            getcontent
        );
        callback (undefined, newfile);
        fsfiles[realpath] = newfile;

      } else if (stats.isFile()) {
        // When creating a file, the getcontent
        // seeks the content of the file.
        var getcontent = function (whengotfile) {
          // FIXME: right now, we assume plain utf8 text.
          nodefs.readFile (realpath, 'utf8', function (err, data) {
            whengotfile (undefined, data);
          });
        };
        var newfile = new File (
            'text/plain',
            nodepath.basename (realpath),
            getcontent
        );
        callback (undefined, newfile);
        fsfiles[realpath] = newfile;
      }

    } else {
      callback (err);
    }
  });
};



// Create new files as requested.
//

/* `file` is a File (easily constructed with `new File()`).
 * `directory` is a File of type `dir`.
 */
var addfiletodir = function (file, directory) {
  // First, we need to know what the directory contains.
  //var files = directory.getcontent ();

  // TODO nodejs apis to write to disk.
};


// Initialization of the File System.
//
//   Yes, right here, right now. Impressive huh?
//

// Choice to make here. Do we read the whole thing on startup?
//   + Faster boot time.
//   - Too much info to deal with; could take all memory.
//
// `exports.root` is a file of type `dir`, which is here initialized to the
// contents of the `/root/` folder (named `/` in here).
exports.getroot = function (gotroot) {
  getfile('/', function(err, root) {
    gotroot(err, root);
  });
};
