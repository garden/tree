/* driver.js: Primitives to deal with the way we store data on disk.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require('fs'),
    nodepath = require('path');


// Take care of the fake root.

// Here, we assume that the code runs in the lib/ directory.
var rootdir = '../root',  // Directory that contains the root of the fs.
    fakeRootPath = nodepath.join(process.cwd(), rootdir);

/* Convert a fake path, to the real filesystem path.
 * `path`: virtual path (in the form of a String).
 */
function fromFakeRoot (path) {
  return nodepath.join (fakeRootPath,
         // Return a fake path from the fake root (with no leading `/`).
         nodepath.relative ('.', path).replace (/^(\.\.\/?)+/, ''));
};

function fromRealRoot (path) {
  var left = path.slice(0, fakeRootPath.length),
      right = path.slice(fakeRootPath.length);
  // It must be in fakeRootPath.
  if (left !== fakeRootPath) return '';
  return right;
}


// Driver primitives.

var primitives = {};  // Map from mime types to I/O primitives.


primitives['dir'] = {
  read: function(path, cb) {
    nodefs.readdir(fromFakeRoot(path), cb);
  },

  mkfile: function(path, cb) {
    nodefs.writeFile(fromFakeRoot(path), '', cb);
  },

  mkdir: function(path, cb) {
    nodefs.mkdir(fromFakeRoot(path), cb);
  },

  rm: function(path, cb) {
    nodefs.rmdir(fromFakeRoot(path), cb);
  },
};


primitives['binary'] = {
  read: function(path, cb) {
    nodefs.readFile(fromFakeRoot(path), cb);
  },

  write: function(path, content, cb) {
    nodefs.writeFile(fromFakeRoot(path), content, cb);
  },

  rm: function(path, cb) {
    nodefs.unlink(fromFakeRoot(path), cb);
  },
};


primitives['text/plain'] = {
  read: function(path, cb) {
    nodefs.readFile(fromFakeRoot(path), 'utf8', cb);
  },

  write: function(path, content, cb) {
    nodefs.writeFile(fromFakeRoot(path), content, 'utf8', cb);
  },

  rm: primitives['binary'].rm,
};


exports.primitives = primitives;
exports.fromFakeRoot = fromFakeRoot;
exports.fromRealRoot = fromRealRoot;

