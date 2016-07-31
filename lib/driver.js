// Primitives to deal with the way we store data on disk.
// Copyright © 2011-2016 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');
var sha3 = require('sha3');

var cwd = process.cwd();
var rootDir = 'web';
var root = path.join(cwd, rootDir);
var metaRoot = path.join(cwd, 'meta');


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

// Convert a normalized path to a base64url hash.
function pathHash(npath) {
  var h = sha3.SHA3Hash(256);
  h.update('' + npath);
  var d = h.digest();
  var base64 = Buffer.from(d, 'binary').toString('base64');
  return base64.slice(0, -1)  // Remove the = at the end.
    .replace(/\+/g, '-').replace(/\//g, '_');
}


// Metadata saved to disk.

function metafile(vpath) {
  var hash = pathHash(normalize(vpath));
  var hashStart = hash.slice(0, 2);
  var hashEnd = hash.slice(2);
  return path.join(metaRoot, hashStart, hashEnd);
}

function loadMeta(vpath, cb) {
  var file = metafile(vpath);
  fs.readFile(file, {encoding:'utf8'}, function (err, data) {
    if (err) { cb(err); return; }
    else if (data == '') {
      // This should never happen, for more information see
      // https://github.com/joyent/node/issues/7807
      data = fs.readFileSync(file, {encoding:'utf8'});
      if (data == '') {
        cb(new Error('Metadata Read Error'));
        return;
      }
    }
    try {
      cb(null, JSON.parse(data));
    } catch (e) {
      cb(e);
    }
  });
}

function dumpMeta(vpath, data, cb) {
  cb = cb || function () {};
  var file = metafile(vpath);
  // First, we need to create all directories down to the meta file
  // (excluding the file, that is).
  var createDirs;
  try {
    createDirs = child.spawn('mkdir', ['-p', path.dirname(file)]);
    createDirs.on('exit', function (code) {
      if (code !== 0) {
        console.error('Error: dumping metadata ended with code ' + code +
                      ' with directory', path.dirname(file));
        return;
      }

      // Then, we want to dump the metadata as JSON in that file.
      try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } catch(e) {
        err = e;
        console.error('While dumping metadata:', err.stack);
      }
      cb(null);
    });
  } catch (e) {
    cb(e);
    return;
  }
}




// Driver primitives

var primitives = {};  // Map from mime types to I/O primitives.

primitives['dir'] = {
  read: function(vpath, cb) {fs.readdir(absolute(vpath), cb);},
  mkfile: function(vpath, cb) {cb(fs.writeFileSync(absolute(vpath), ''));},
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
    fs.unlink(metafile(vpath));
    fs.rmdir(absolute(vpath), cb);
  },
};

primitives['binary'] = {
  read: function(vpath, cb) {fs.readFile(absolute(vpath), cb);},
  write: function(vpath, content, metadata, cb) {
    dumpMeta(vpath, metadata);
    cb(fs.writeFileSync(absolute(vpath), content));
  },
  rm: function(vpath, cb) {
    fs.unlink(metafile(vpath));
    fs.unlink(absolute(vpath), cb);
  },
};

primitives['text'] = {
  read: function(vpath, cb) {fs.readFile(absolute(vpath), 'utf8', cb);},
  write: function(vpath, content, metadata, cb) {
    dumpMeta(vpath, metadata);
    cb(fs.writeFileSync(absolute(vpath), content, 'utf8'));
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
exports.metafile = metafile;

exports.dumpMeta = dumpMeta;
exports.loadMeta = loadMeta;
