// Convert from the old metadata storage design (using .DS-Store for folder
// metadata) to a new design (using hashed paths /ab/cdefg…).

var sha3 = require('sha3');
var path = require('path');
var fs = require('fs');
var exec = require('child_process').execFileSync;

// Prepare the new meta directory.
var projectDir = path.join(__dirname, '..', '..');
var oldMeta = path.join(projectDir, 'meta');
var newMeta = path.join(projectDir, 'meta-new');
fs.mkdirSync(newMeta);

// The functions normalize(), pathHash() and metafile() are from lib/driver.js.

var metaRoot = newMeta;

function normalize(vpath) {
  // The following features several Windows hacks.
  if (/^[^\/]/.test(vpath)) {
    vpath = '/' + vpath;
  }
  var npath = path.normalize(vpath
      .replace(/\\/g,'/').replace(/\/\//g,'/')).replace(/\\/g,'/');
  return npath;
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

function metafile(vpath) {
  var hash = pathHash(normalize(vpath));
  var hashStart = hash.slice(0, 2);
  var hashEnd = hash.slice(2);
  return path.join(metaRoot, hashStart, hashEnd);
}

var files = ('' + exec('find', [oldMeta]))
  .slice(0, -1)  // There is an empty newline at the end.
  .split('\n');

// Determine whether a file is a directory.
function isDir(apath) {
  return fs.statSync(apath).isDirectory();
}

// Get a virtual path from an absolute path.
function virtualize(apath) {
  return apath.slice(apath.indexOf('/meta') + '/meta'.length) || '/';
}

function copyToNewLocation(apath) {
  if (isDir(apath)) {
    var source = path.join(apath, '.DS-Store');
  } else {
    var source = apath;
  }
  var vpath = virtualize(apath);
  var target = metafile(vpath);

  // Remove the newline at the end.
  var dirname = '' + exec('dirname', [target]).slice(0, -1);
  exec('mkdir', ['-p', dirname]);
  try {
    exec('cp', [source, target]);
  } catch(e) {
    console.error(e.stack);
    fs.writeFileSync(target, '{}');
  }
}

files.forEach(copyToNewLocation);
