/* driver.js: Primitives to deal with the way we store data on disk.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require('fs'),
    nodepath = require('path');

var root = nodepath.join(process.cwd(), 'root');


// Switch between virtual and disk paths

function normalize(vpath) {
  var npath = nodepath.normalize(('/'+vpath).replace(/\\/g,'/').replace(/\/\//g,'/')).replace(/\\/g,'/');
  //console.log('NORMALIZED PATH OF',vpath,'IS',npath);
  return npath;
}

function absolute(vpath) {
  var apath = nodepath.join(root, normalize(vpath));
  //console.log('ABSOLUTE PATH OF',vpath,'IS',apath);
  return apath;
};

function relative(vpath) {
  var rpath = nodepath.join('root', normalize(vpath));
  //console.log('RELATIVE PATH OF',vpath,'IS',rpath);
  return rpath;
};

function virtual(dpath) {
  var vpath = normalize(nodepath.relative(root, dpath));
  //console.log('VIRTUAL PATH OF',dpath,'IS',vpath);
  return vpath;
}


// Driver primitives

var primitives = {};  // Map from mime types to I/O primitives.

primitives['dir'] = {
  read: function(vpath,cb) {nodefs.readdir(absolute(vpath),cb);},
  mkfile: function(vpath,cb) {nodefs.writeFile(absolute(vpath),'',cb);},
  mkdir: function(vpath,cb) {nodefs.mkdir(absolute(vpath),cb);},
  rm: function(vpath,cb) {nodefs.rmdir(absolute(vpath),cb);}
};

primitives['binary'] = {
  read: function(vpath,cb) {nodefs.readFile(absolute(vpath),cb);},
  write: function(vpath,content,cb) {nodefs.writeFile(absolute(vpath),content,cb); },
  rm: function(vpath,cb) {nodefs.unlink(absolute(vpath),cb);}
};

primitives['text/plain'] = {
  read: function(vpath,cb) {nodefs.readFile(absolute(vpath),'utf8',cb);},
  write: function(vpath,content,cb) {nodefs.writeFile(absolute(vpath),content,'utf8',cb);},
  rm: primitives['binary'].rm
};


// Exports

exports.primitives = primitives;
exports.normalize = normalize;
exports.absolute = absolute;
exports.relative = relative;
exports.virtual = virtual;

