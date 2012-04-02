/* driver.js: Primitives to deal with the way we store data on disk.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require('fs'),
    nodepath = require('path');

var root = nodepath.join(process.cwd(), 'root');


// Switch between virtual and disk paths

function absolutepath(vpath) {
  return root + nodepath.normalize('/' + vpath);
};

function relativepath(vpath) {
  return 'root' + nodepath.normalize('/' + vpath);
};

function virtualpath(dpath) {
  return '/' + nodepath.relative(root, dpath);
}


// Driver primitives

var primitives = {};  // Map from mime types to I/O primitives.

primitives['dir'] = {
  read: function(vpath,cb) {nodefs.readdir(absolutepath(vpath),cb);},
  mkfile: function(vpath,cb) {nodefs.writeFile(absolutepath(vpath),'',cb);},
  mkdir: function(vpath,cb) {nodefs.mkdir(absolutepath(vpath),cb);},
  rm: function(vpath,cb) {nodefs.rmdir(absolutepath(vpath),cb);}
};

primitives['binary'] = {
  read: function(vpath,cb) {nodefs.readFile(absolutepath(vpath),cb);},
  write: function(vpath,content,cb) {nodefs.writeFile(absolutepath(vpath),content,cb); },
  rm: function(vpath,cb) {nodefs.unlink(absolutepath(vpath),cb);}
};

primitives['text/plain'] = {
  read: function(vpath,cb) {nodefs.readFile(absolutepath(vpath),'utf8',cb);},
  write: function(vpath,content,cb) {nodefs.writeFile(absolutepath(vpath),content,'utf8',cb);},
  rm: primitives['binary'].rm
};


// Exports

exports.primitives = primitives;
exports.absolutepath = absolutepath;
exports.relativepath = relativepath;
exports.virtualpath = virtualpath;

