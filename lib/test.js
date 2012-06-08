/* Testing library elements of the File Tree server side.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    child = require('child_process');

var tests = [];

// fs.js
//

tests.push(function test1() {

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

});



// driver.js
//

tests.push(function test2() {

  var driver = require('./driver'),
      sample = '$foo/bar/baz.js',
      rpath = driver.absolute(sample);

  function doWithMetaFile() {
    // Check that the metadata was dumped.
    driver.loadMeta(sample, function (err, metadata) {
      if (err) assert.fail(null, null, err.stack);
      assert(metadata.hello === 'world',
             "Metadata was not serialized properly:\n" +
             "it serialized " + JSON.stringify(metadata) + "\n" +
             "while it should have serialized {\"hello\":\"world\"}.");

      // Remove the meta file (and the rest).
      child.spawn('rm', ['-r', 'meta/$foo']);
      child.spawn('rm', ['-r', 'web/$foo']);
      console.log('been there')
    });
  }

  child.spawn('mkdir', ['-p', path.dirname(rpath)]).on('exit', function (code) {
    fs.writeFile(rpath, "Whatever.", function onFileWritten(err) {
      if (err) console.error("Cannot create file", rpath);
      // Add a sample meta file.
      driver.dumpMeta(sample, {'hello':'world'}, doWithMetaFile);
    });
  });

});


// Run all tests sequentially.
async.series(tests);
