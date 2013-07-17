// Primitives to deal with the way we store data on disk.
// Copyright © 2011-2013 Jan Keromnes, Thaddee Tyl. All rights reserved.
// The following code is covered by the AGPLv3 license.

var fs = require('fs'),
    os = require('os'),
    path = require('path'),
    child = require('child_process');

var cwd = process.cwd(),
    rootDir = 'web',
    root = path.join(cwd, rootDir),
    metaRoot = path.join(cwd, 'meta');

function changeRootDir(newDir) {
  rootDir = newDir;
}


// Switch between virtual and disk paths

function normalize(vpath) {
  // The following features several Windows hacks.
  var npath = path.normalize(('/' + vpath)
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
  var rpath = path.join('./' + rootDir, normalize(vpath));
  //console.log('RELATIVE PATH OF', vpath, 'IS', rpath);
  return rpath;
};

function virtual(dpath) {
  var vpath = normalize(path.relative(root, dpath));
  //console.log('VIRTUAL PATH OF', dpath, 'IS', vpath);
  return vpath;
}

function temporary(tmpfile) {
  var tpath = path.join(os.tmpdir(), path.basename(tmpfile));
  return tpath;
}


// Metadata saved to disk.

function metafile (vpath, cb) {
  var npath = normalize(vpath);     // Can you find an Apple troll?

  fs.stat(absolute(npath), function (err, stats) {
    if (err || !stats) {
      console.error("Error while getting the metadata of", npath);
      console.error(err.stack);
      cb(err);
    } else {
      cb(null, path.join(metaRoot, npath, stats.isDirectory()? '.DS-Store':''));
    }
  });
}

function loadMeta (vpath, cb) {
  metafile(vpath, function (err, file) {
    if (err) cb(err);
    else fs.readFile(file, 'utf8', function (err, data) {
      if (err) cb(err);
      else if (data == '') cb(new Error('Metadata Syntax Error'));
      else try {
        cb(null, JSON.parse(data));
      } catch (e) {
        cb(e);
      }
    });
  });
}

function dumpMeta (vpath, data, cb) {
  cb = cb || function () {};
  metafile(vpath, function (err, file) {
    if (err)  {
      cb(err);
      return;
    }

    // First, we need to create all directories down to the meta file
    // (excluding the file, that is).
    var createDirs;
    try {
      createDirs = child.spawn('mkdir', ['-p',path.dirname(file)]);
      createDirs.on('exit', function (code) {
        if (code !== 0) {
          console.error('Error: dumping metadata ended with code ' + code +
                        ' with directory', path.dirname(file));
          return;
        }

        // Then, we want to dump the metadata as JSON in that file.
        fs.writeFile(file, JSON.stringify(data), function (err) {
          if (err) console.error('While dumping metadata:', err.stack);
          cb(err);
        });
      });
    } catch (e) {
      cb(e);
      return;
    }
  });
}




// Driver primitives

var primitives = {};  // Map from mime types to I/O primitives.

primitives['dir'] = {
  read: function(vpath, cb) {fs.readdir(absolute(vpath), cb);},
  mkfile: function(vpath, cb) {fs.writeFile(absolute(vpath), '', cb);},
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
    metafile(normalize(vpath), function (err, fmeta) {
      if (err) {
        cb(err);
      } else {
        fs.unlink(fmeta);
        fs.rmdir(absolute(vpath), cb);
      }
    });
  },
};

primitives['binary'] = {
  read: function(vpath, cb) {fs.readFile(absolute(vpath), cb);},
  write: function(vpath, content, metadata, cb) {
    fs.writeFile(absolute(vpath), content, cb);
    dumpMeta(vpath, metadata);
  },
  rm: function(vpath, cb) {
    metafile(normalize(vpath), function (err, fmeta) {
      if (err) {
        cb(err);
      } else {
        fs.unlink(fmeta);
        fs.unlink(absolute(vpath), cb);
      }
    });
  },
};

primitives['text'] = {
  read: function(vpath, cb) {fs.readFile(absolute(vpath), 'utf8', cb);},
  write: function(vpath, content, metadata, cb) {
    fs.writeFile(absolute(vpath), content, 'utf8', cb);
    dumpMeta(vpath, metadata);
  },
  rm: primitives['binary'].rm
};


// Exports

exports.changeRootDir = changeRootDir;

exports.primitives = primitives;
exports.normalize = normalize;
exports.absolute = absolute;
exports.relative = relative;
exports.virtual = virtual;
exports.temporary = temporary;

exports.dumpMeta = dumpMeta;
exports.loadMeta = loadMeta;
