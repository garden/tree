// Convert a virtual path (given as a parameter) to the metafile (on disk).

var driver = require('../../lib/driver.js');
var sha3 = require('sha3');
var path = require('path');

var projectDir = path.join(__dirname, '..', '..');
var metaRoot = path.join(projectDir, 'meta');

var virtualPath = process.argv[2];
if (!virtualPath) {
  console.log('Usage: node ./tools/meta/path.js /foo/bar');
  process.exit();
}
console.log(driver.metafile(virtualPath));
