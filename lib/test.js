/* Testing library elements of the File Tree server side.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var assert = require('assert'),
    fs = require('fs'),
    child = require('child_process');


// fs.js
//

(function() {

var tfs = require('./fs');

tfs.file("/", function (err, root) {
  // Add file "file".
  root.mkfile("file", function(err) {

    // Testing subfiles.
    root.subfiles(function(err, rootLeafs) {
      assert(
        rootLeafs.indexOf('file') !== -1,
        "Root leafs are wrong:\n" +
        rootLeafs
      );
    }, 2);

    // We don't want to leave junk, so we destroy everything.
    tfs.file("/file", function (err, f) {
      f.rm(function (err) {
        // Testing removal.
        root.subfiles(function(err, rootLeafs) {
          assert(
            rootLeafs.indexOf('file') === -1,
            "Removal of files doesn't work."
          );
        }, 3);
      });
    });

  });
});

})();



// driver.js
//

(function () {

var driver = require('./driver'),
    sample = '$foo/bar/baz.js';

// Add a sample meta file.
driver.dumpMeta(sample, {'hello':'world'}, function () {

  // Check that the metadata was dumped.
  fs.readFile('./meta/$foo/bar/baz.js', function (err, data) {
    if (err) assert.fail(null, null, err.stack);
    assert.equal('' + data, '{"hello":"world"}',
                 "Metadata was not serialized properly:\n" +
                 "it serialized " + data + "\n" +
                 "while it should have serialized {\"hello\":\"world\"}.");
  });
});

// Remove the meta file (and the rest).
child.spawn('rm', ['-r', '../meta/$foo']);


})();

