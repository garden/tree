// Convert from the old metadata storage design (using .DS-Store for folder
// metadata) to a new design (using hashed paths /ab/cdefg…).

var driver = require('../../lib/driver.js');
var path = require('path');
var fs = require('fs');
var exec = require('child_process').execFileSync;

// Prepare the new meta directory.
var projectDir = path.join(__dirname, '..', '..');
var oldMeta = path.join(projectDir, 'meta');
var newMeta = path.join(projectDir, 'meta-new');
fs.mkdirSync(newMeta);

driver.setMetaRoot(newMeta);

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
  var target = driver.metafile(vpath);

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
