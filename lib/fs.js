/* fs.js: file system primitives
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var camp = require ('../camp/camp');

// All data currently available in memory will be stored here.
//

var nodefs = require ('fs'),
    nodepath = require ('path');

var rootdir = '../root';  // directory that contains the root of the fs.

// Type system.
//

var types = [];        // contains lists of parent types (all being integers).
var typenamefromtype = [];
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
      types.push (parents || []);
      mime[newtype] = nbtypes;
      typenamefromtype.push (newtype);
      return nbtypes++;
    }
  };
})();

// Defining current types (and their compatibility table).
type ('notfound');
type ('dir');            // contains a JSON string of files.
type ('binary');
type ('text/plain');
type ('text/html', [type('text/plain')]);
type ('text/xml', [type('text/plain')]);
type ('text/css', [type('text/plain')]);
type ('text/dtd', [type('text/plain')]);

type ('text/javascript', [type('text/plain')]);
type ('application/json', [type('text/plain')]);
type ('text/csv', [type('text/plain')]);
type ('text/x-csrc', [type('text/plain')]);
type ('text/x-c++src', [type('text/plain')]);
type ('text/x-java', [type('text/plain')]);
type ('text/x-groovy', [type('text/plain')]);
type ('text/x-clojure', [type('text/plain')]);
type ('text/x-coffeescript', [type('text/plain')]);
type ('text/x-diff', [type('text/plain')]);
type ('text/x-haskell', [type('text/plain')]);
type ('text/x-lua', [type('text/plain')]);
type ('text/x-markdown', [type('text/plain')]);
type ('text/n-triples', [type('text/plain')]);
type ('text/x-pascal', [type('text/plain')]);
type ('text/x-perl', [type('text/plain')]);
type ('text/x-php', [type('text/plain')]);
type ('text/x-plsql', [type('text/plain')]);
type ('text/x-plsql', [type('text/plain')]);
type ('text/x-python', [type('text/plain')]);
type ('text/x-rsrc', [type('text/plain')]);
type ('text/x-rst', [type('text/plain')]);
type ('text/x-ruby', [type('text/plain')]);
type ('text/x-rustsrc', [type('text/plain')]);
type ('text/x-scheme', [type('text/plain')]);
type ('text/x-scheme', [type('text/plain')]);
type ('text/x-scheme', [type('text/plain')]);
type ('text/x-stsrc', [type('text/plain')]);
type ('text/x-sparql-query', [type('text/plain')]);
type ('text/x-stex', [type('text/plain')]);
type ('text/x-stex', [type('text/plain')]);
type ('text/velocity', [type('text/plain')]);
type ('text/x-yaml', [type('text/plain')]);

type ('application/ps', [type('binary')]);
type ('application/pdf', [type('binary'), type('application/ps')]);

type ('image/jpeg', [type('binary')]);
type ('image/tiff', [type('binary')]);
type ('image/gif', [type('binary')]);
type ('image/vnd.microsoft.icon', [type('binary')]);
type ('image/png', [type('binary')]);
type ('image/svg', [type('text/plain')]);


// Here is the main interface to this whole type system.

// Checks whether a `file` is of type `typename` (or falls back into it).
//
// `file`: a File.  
// `typename`: a string, case-perfect match of a defined type.  
//
// Warning: this is not *cycle-safe* just yet. This is only an issue if you
// have mistakenly created a loop. It can really screw everything up though.
function isoftype (file, typename) {
  if (file === undefined) {
    console.log('FS: isoftype caught undefined file.');
    return;
  }
  return iscompatibletype(file.type, type(typename));
};
function iscompatibletype (typenum, ancestor) {
  if (typenum === ancestor)
    return true;
  for (var i = 0;  i < types[typenum].length;  i++)
    if (iscompatibletype(types[typenum][i], ancestor))
      return true;
  return false;
};



// Directory primitives.


/* `typename` is a string taken from the `types` enumeration.  
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
function File (typename, name, getcontent) {
  this.type = type(typename) || type('text/plain');
  this.name = name;
  this._gotcontent = false;
  this._content;
  this.usercount = 0;
  this.content = function memoizer(dowithcontent) {
    console.log('FS: file.content has just been called.');
    if (!this._gotcontent) {
      var that = this;
      getcontent(function(err, content) {
        console.log('FS: We just got file.content:', content);
        // Give them the data.
        dowithcontent(err, content);
        if (!err) {
          that._content = content;
          that._gotcontent = true;
        } else console.error('FS: getcontent had an error!');
      });
    } else {
      console.log('FS: We just got file.content [cached]:', this._content);
      dowithcontent(undefined, this._content);
    }
  };
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
  console.log('FS: getfile was called for %s', path);
  path = sanitizepath(path);
  console.log('FS: sanitized path is "%s"', path);
  var realpath = torealpath (path);
  // If this file is already in memory, return that.
  if (fsfiles[path] !== undefined) {
    callback(undefined, fsfiles[path]);
    return;
  }

  nodefs.stat (realpath, function (err, stats) {
    if (!err) {

      console.log('stats says that', realpath, (stats.isDirectory()? 'is a directory': 'is a file'));

      if (stats.isDirectory()) {
        // When creating a directory to memory, the getcontent
        // component is the following function.
        // It reads the files in the entry.
        var getcontent = function (whengotfile) {
          console.log('FS: getting content');
          nodefs.readdir (realpath, function (err, files) {
            if (!err) {
              var content = {};
              for (var i = 0; i < files.length; i++) {
                // We want to call back only when we've got all files.
                // We use a decrement to trace the progress.
                var fileslefttoprocess = files.length;
                getfile (
                  nodepath.join (path, files[i]),
                  function (err, file) {
                    console.log('FS: got directory content, %s', fileslefttoprocess);
                    fileslefttoprocess--;
                    if (err) { whengotfile (err); return; }
                    // We put each file in the content.
                    content[file.name] = file;
                    if (fileslefttoprocess === 0) {
                      console.log('FS: got dir content, before callback');
                      whengotfile (undefined, content);
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
        fsfiles[path] = newfile;

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
            typefromextention(realpath),
            nodepath.basename (realpath),
            getcontent
        );
        callback (undefined, newfile);
        fsfiles[path] = newfile;
      }

    } else {
      callback (err);
    }
  });
};


// Get the type associated to the extention of the file.
//
function typefromextention (filename) {
  console.log('FS: typefromextention is', camp.Server.mime[nodepath.extname(filename)]);
  return camp.Server.mime[nodepath.extname(filename).slice(1)] || 'text/plain';
};



// Create new files as requested.
//

/* `file` is a File (easily constructed with `new File()`).
 * `directory` is a File of type `dir`.
 */
function addfiletodir (file, directory) {
  // First, we need to know what the directory contains.
  //var files = directory.getcontent ();

  // TODO nodejs apis to write to disk.
  // nodefs.writeFile(filename, data, encoding='utf8',[callback])
  // nodefs.mkdir(path, mode, [callback]) // unix permissions mode (eg. 0777)
};


// Initialization of the File System.
//
//   Yes, right here, right now. Impressive huh?
//

// Choice to make here. Do we read the whole thing on startup?
//   + Faster boot time.
//   - Too much info to deal with; could take all memory.
//
// `getroot` yields a file of type `dir`, which is here initialized to the
// contents of the `/root/` folder (named `/` in here).
function getroot (gotroot) {
  getfile('/', function(err, root) { gotroot(err, root); });
};



// EXPORTS ARE HERE YOU BITCHES
//

exports.typenamefromtype = typenamefromtype;
exports.isoftype = isoftype;
exports.File = File;
exports.fsfiles = fsfiles;
exports.sanitizepath = sanitizepath;
exports.getfile = getfile;
exports.getroot = getroot;

