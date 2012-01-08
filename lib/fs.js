/* fs.js: file system primitives
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var camp = require ('../camp/camp');

// All data currently available in memory will be stored here.
//

var nodefs = require ('fs'),
    nodepath = require ('path');

// Here, we assume that the code runs in the lib/ directory.
var rootdir = '../root';  // directory that contains the root of the fs.




// Type system.
//

var types = [];        // contains lists of parent types (all being integers).
var typenamefromtype = [];
var Type = (function () {
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
Type ('notfound');
Type ('dir');            // contains a JSON string of files.
Type ('binary');
Type ('text/plain');
Type ('text/html', [Type('text/plain')]);
Type ('text/xml', [Type('text/plain')]);
Type ('text/css', [Type('text/plain')]);
Type ('text/dtd', [Type('text/plain')]);

Type ('text/javascript', [Type('text/plain')]);
Type ('application/json', [Type('text/plain')]);
Type ('text/csv', [Type('text/plain')]);
Type ('text/x-csrc', [Type('text/plain')]);
Type ('text/x-c++src', [Type('text/plain')]);
Type ('text/x-csharp', [Type('text/plain')]);
Type ('text/x-java', [Type('text/plain')]);
Type ('text/x-groovy', [Type('text/plain')]);
Type ('text/x-clojure', [Type('text/plain')]);
Type ('text/x-coffeescript', [Type('text/plain')]);
Type ('text/x-diff', [Type('text/plain')]);
Type ('text/x-haskell', [Type('text/plain')]);
Type ('text/less', [Type('text/plain')]);
Type ('text/x-lua', [Type('text/plain')]);
Type ('text/x-markdown', [Type('text/plain')]);
Type ('text/x-mysql', [Type('text/plain')]);
Type ('text/n-triples', [Type('text/plain')]);
Type ('text/x-pascal', [Type('text/plain')]);
Type ('text/x-perl', [Type('text/plain')]);
Type ('text/x-php', [Type('text/plain')]);
Type ('text/x-plsql', [Type('text/plain')]);
Type ('text/x-python', [Type('text/plain')]);
Type ('text/x-rpm-spec', [Type('text/plain')]);
Type ('text/x-rpm-changes', [Type('text/plain')]);
Type ('text/x-rsrc', [Type('text/plain')]);
Type ('text/x-rst', [Type('text/plain')]);
Type ('text/x-ruby', [Type('text/plain')]);
Type ('text/x-rustsrc', [Type('text/plain')]);
Type ('text/x-scheme', [Type('text/plain')]);
Type ('text/x-scheme', [Type('text/plain')]);
Type ('text/x-scheme', [Type('text/plain')]);
Type ('text/x-stsrc', [Type('text/plain')]);
Type ('text/x-sparql-query', [Type('text/plain')]);
Type ('text/x-stex', [Type('text/plain')]);
Type ('text/x-stex', [Type('text/plain')]);
Type ('text/velocity', [Type('text/plain')]);
Type ('text/x-verilog', [Type('text/plain')]);
Type ('text/x-yaml', [Type('text/plain')]);

Type ('application/ps', [Type('binary')]);
Type ('application/pdf', [Type('binary'), Type('application/ps')]);

Type ('image/jpeg', [Type('binary')]);
Type ('image/jpg', [Type('binary')]);
Type ('image/tiff', [Type('binary')]);
Type ('image/gif', [Type('binary')]);
Type ('image/vnd.microsoft.icon', [Type('binary')]);
Type ('image/png', [Type('binary')]);
Type ('image/svg+xml', [Type('text/plain')]);


// Here is the main interface to this whole type system.

// Checks whether a `file` is of type `typename` (or falls back into it).
//
// `file`: a File.  
// `typename`: a string, case-perfect match of a defined Type.  
//
// Warning: this is not *cycle-safe* just yet. This is only an issue if you
// have mistakenly created a loop. It can really screw everything up though.
function isoftype (file, typename) {
  if (file === undefined) {
    console.log('FS: isoftype caught undefined file.');
    return;
  }
  return iscompatibletype(file.type, Type(typename));
};
function iscompatibletype (typenum, ancestor) {
  if (typenum === ancestor)
    return true;
  for (var i = 0;  i < types[typenum].length;  i++)
    if (iscompatibletype(types[typenum][i], ancestor))
      return true;
  return false;
};





// Gather information.
//
// Numbers are to computer science what a telescope is to an astrophysicist.

var profile = [
  {doc:'FS running', data:true}
];





// Directory primitives.


/* `typename` is a string taken from the `types` enumeration.  
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
 * - File::type is the type of the file.  
 * - File::name is the name of the file (supposedly doesn't contain `/`). 
 * - File::content is a function which you feed `function(err, content) {…}`.
 * - File::open will count one more user editing that file.
 * - File::close will count one less user. (That doesn't really matter
 * for folders).
 */
function File (typename, name, getcontent) {
  this.type = Type(typename) || Type('text/plain');
  this.name = name;
  this._gotcontent = false;
  this._content;
  this.content = function memoizer(dowithcontent) {
    console.log('FS: file.content has just been called.');
    if (!this._gotcontent) {
      var that = this;
      getcontent(function(err, content) {
        ///console.log('FS: We just got file.content:', content);
        // Give them the data.
        dowithcontent(err, content);
        if (!err) {
          that._content = content;
          that._gotcontent = true;
        } else console.error('FS: getcontent had an error!');
      });
    } else {
      ///console.log('FS: We just got file.content [cached]:', this._content);
      dowithcontent(undefined, this._content);
    }
  };
  this.usercount = 0;
};

File.prototype.open = function () {
  this.usercount++;
};

File.prototype.close = function () {
  if (this.usercount < 0) {
	console.log('FS:FILE: usercount is negative (%s). Keeping it at 0.',
		this.usercount);
  } else {
	this.usercount--;
  }
};

// "Alias" of the raw isoftype.
File.prototype.isoftype = function (nametype) {
  return isoftype(this, nametype);
};

// `Subfiles` gives all the leafs of the tree recursively, as relative paths.
//
// The callback `cb` is of the form `function(err, leafs) { ... }`.
File.prototype.subfiles = function (cb, depth) {
  depth = depth !== undefined? depth: Infinity;

  // This function is meant to return [] if this is not a directory.
  if (!this.isoftype('dir')) { cb(undefined, []); return; }

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
      if (file.isoftype('dir') && depth > 0) {
        // We need to recursively go deeper! ;)
        paths.push(file.name + '/');
        file.subfiles(whengotsubfiles(filename), depth - 1);
      } else {
        var trailingSlash = '';     // By default, no trailing slash.
        if (content[filename].isoftype('dir')) {
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
  console.log('FS:GETFILE: %s was sanitized to "%s"', oldpath, path);
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
            if (!err) {
			  console.log('FS: directory files are', files);
			  if (files.length === 0) {
				whengotfile (undefined, {});
			  }
              var content = {};
              for (var i = 0; i < files.length; i++) {
                // We want to call back only when we've got all files.
                // We use a decrement to trace the progress.
                var fileslefttoprocess = files.length;
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
  //console.log('FS:TYPEFROMEXTENTION:', filename, '-',
      //camp.server.mime[nodepath.extname(filename).slice(1)]);
  return camp.server.mime[nodepath.extname(filename).slice(1)] || 'text/plain';
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


// Remove a file.
// TODO
function rmfilefromdir (file, directory) {
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

exports.profile = profile;

