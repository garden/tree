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
  if (err) assert.fail(null, null, "fs.js: could not load root.");
  // Add file "file".
  root.mkfile("file", function(err) {
    if (err) assert.fail(null, null, "fs.js:", err.stack);

    // Testing subfiles.
    root.subfiles(function(err, rootLeafs) {
      if (err) assert.fail(null, null, "fs.js:", err.stack);
      assert(
        rootLeafs.indexOf('file') !== -1,
        "Root leafs are wrong:\n" +
        rootLeafs
      );

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
    }, 2);

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
  driver.loadMeta(sample, function (err, metadata) {
    if (err) assert.fail(null, null, err.stack);
    assert(metadata.hello === 'world',
           "Metadata was not serialized properly:\n" +
           "it serialized " + JSON.stringify(metadata) + "\n" +
           "while it should have serialized {\"hello\":\"world\"}.");

    // Remove the meta file (and the rest).
    child.spawn('rm', ['-r', 'meta/$foo']);
  });
});



})();

