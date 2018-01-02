// Primitives to deal with the way we store data on disk.
// Copyright © 2011-2016 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var fs = require('fs');
var os = require('os');
var fsos = require('fsos');
var path = require('path');
var child = require('child_process');

var cwd = process.cwd();
var rootDir = 'web';
var root = path.join(cwd, rootDir);
var metaRoot = path.join(cwd, 'meta');

function setMetaRoot(root) { metaRoot = root; }


// Switch between virtual and disk paths

function normalize(vpath) {
  // The following features several Windows hacks.
  if (/^[^\/]/.test(vpath)) {
    vpath = '/' + vpath;
  }
  var npath = path.normalize(vpath
      .replace(/\\/g,'/').replace(/\/\//g,'/')).replace(/\\/g,'/');
  //console.log('NORMALIZED PATH OF', vpath, 'IS', npath);
  return npath;
}

function absolute(vpath) {
  var apath = path.join(root, normalize(vpath));
  //console.log('ABSOLUTE PATH OF', vpath, 'IS', apath);
  return apath;
};

function relative(vpath) {
  var rpath = path.join(rootDir, normalize(vpath));
  //console.log('RELATIVE PATH OF', vpath, 'IS', rpath);
  return rpath;
};

function virtual(dpath) {
  var rpath = path.relative(root, dpath).replace(/^(\.\.\/?)+/, '');
  var vpath = normalize(rpath);
  //console.log('VIRTUAL PATH OF', dpath, 'IS', vpath);
  return vpath;
}

function temporary(tmpfile) {
  var tpath = path.join(os.tmpdir(), path.basename(tmpfile));
  return tpath;
}


// Driver primitives

var primitives = {};  // Map from mime types to I/O primitives.

primitives['dir'] = {
  read: function(vpath, cb) {fs.readdir(absolute(vpath), cb);},
  mkfile: function(vpath, cb) {
    fsos.set(absolute(vpath), '').then(cb).catch(cb);
  },
  mkdir: function(vpath, cb) {fs.mkdir(absolute(vpath), cb);},
  import: function(tmpfile, vpath, cb) {
    var source = temporary(tmpfile), destination = absolute(vpath);
    //console.log('importing', source, 'as', destination);
    fs.rename(source, destination, function(error) {
      // Might fail if `source` and `destination` are on different partitions.
      if (error) {
        var stream = fs.ReadStream(source);
        stream.on('end', function() { fs.unlink(source); cb(); });
        stream.pipe(fs.WriteStream(destination));
      } else cb();
    });
  },
  rm: function(vpath, cb) {
    fs.rmdir(absolute(vpath), cb);
  },
};

primitives['binary'] = {
  read: function(vpath, cb) {fs.readFile(absolute(vpath), cb);},
  write: function(vpath, content, metadata, cb) {
    dumpMeta(vpath, metadata);
    fsos.set(absolute(vpath), content).then(cb).catch(cb);
  },
  rm: function(vpath, cb) {
    fs.unlink(absolute(vpath), cb);
  },
};

primitives['text'] = {
  read: function(vpath, cb) {fs.readFile(absolute(vpath), 'utf8', cb);},
  write: function(vpath, content, metadata, cb) {
    dumpMeta(vpath, metadata);
    fsos.set(absolute(vpath), '' + content).then(cb).catch(cb);
  },
  rm: primitives['binary'].rm
};


// Exports

exports.primitives = primitives;
exports.normalize = normalize;
exports.absolute = absolute;
exports.relative = relative;
exports.virtual = virtual;
exports.temporary = temporary;
exports.setMetaRoot = setMetaRoot;
