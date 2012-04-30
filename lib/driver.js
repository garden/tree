/* driver.js: Primitives to deal with the way we store data on disk.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require('fs'),
    path = require('path'),
    child = require('child_process');

var cwd = process.cwd(),
    root = path.join(cwd, 'web');


// Switch between virtual and disk paths

function normalize(vpath) {
  // The following features several Windows hacks.
  var npath = path.normalize(('/' + vpath)
      .replace(/\\/g,'/').replace(/\/\//g,'/')).replace(/\\/g,'/');
  //console.log('NORMALIZED PATH OF',vpath,'IS',npath);
  return npath;
}

function absolute(vpath) {
  var apath = path.join(root, normalize(vpath));
  //console.log('ABSOLUTE PATH OF',vpath,'IS',apath);
  return apath;
};

function relative(vpath) {
  var rpath = path.join('web', normalize(vpath));
  //console.log('RELATIVE PATH OF',vpath,'IS',rpath);
  return rpath;
};

function virtual(dpath) {
  var vpath = normalize(path.relative(root, dpath));
  //console.log('VIRTUAL PATH OF',dpath,'IS',vpath);
  return vpath;
}


// Metadata saved to disk.

function dumpMeta (vpath, data, cb) {
  var file = path.join(cwd, 'meta', vpath);
  // First, we need to create all directories down to the meta file
  // (excluding the file, that is).
  child.spawn('mkdir', ['-p', path.dirname(file)]).on('exit', function (code) {
    if (code !== 0) {
      console.error('Error: dumping metadata ended with code ' + code);
      return;
    }

    // Then, we want to dump the metadata as JSON in that file.
    nodefs.writeFile(file, JSON.stringify(data), function (err) {
      if (err) console.error('While dumping metadata:', err.stack);
      if (typeof cb === 'function') cb(err);
    });
  });
}


// Driver primitives

var primitives = {};  // Map from mime types to I/O primitives.

primitives['dir'] = {
  read: function(vpath, cb) {nodefs.readdir(absolute(vpath), cb);},
  mkfile: function(vpath, cb) {nodefs.writeFile(absolute(vpath), '', cb);},
  mkdir: function(vpath, cb) {nodefs.mkdir(absolute(vpath), cb);},
  rm: function(vpath, cb) {nodefs.rmdir(absolute(vpath), cb);}
};

primitives['binary'] = {
  read: function(vpath, cb) {nodefs.readFile(absolute(vpath), cb);},
  write: function(vpath, content, metadata, cb) {
    nodefs.writeFile(absolute(vpath), content, cb);
    dumpMeta(vpath, metadata);
  },
  rm: function(vpath, cb) {nodefs.unlink(absolute(vpath), cb);}
};

primitives['text/plain'] = {
  read: function(vpath, cb) {nodefs.readFile(absolute(vpath), 'utf8', cb);},
  write: function(vpath, content, metadata, cb) {
    nodefs.writeFile(absolute(vpath), content, 'utf8', cb);
    dumpMeta(vpath, metadata);
  },
  rm: primitives['binary'].rm
};


// Exports

exports.primitives = primitives;
exports.normalize = normalize;
exports.absolute = absolute;
exports.relative = relative;
exports.virtual = virtual;

exports.dumpMeta = dumpMeta;
