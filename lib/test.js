// Testing library elements of the File Tree server side.
// Copyright © 2011-2013 Jan Keromnes, Thaddee Tyl. All rights reserved.
// The following code is covered by the AGPLv3 license.

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    child = require('child_process');

var tests = [];

// fs.js
//

// This test adds a `$test` folder.
tests.push(function testFs(end) {

  var tfs = require('./fs');

  tfs.file("/", function (err, root) {
    assert(!err, "fs.js: could not load root.");
    root.create("$test", "dir", function(err) {
      assert(!err, "fs.js: could not create $test.");
      tfs.file("/$test", function(err, testFile) {
        assert(!err, "fs.js: could not get $test.");
        // Add file "file".
        testFile.create("file", "text", function(err) {
          assert(!err, "fs.js: " + (err? err.stack: ''));

          // Testing subfiles.
          testFile.subfiles(function(err, rootLeafs) {
            assert(!err, "fs.js:" + (err? err.stack: ''));
            assert(
              rootLeafs.indexOf('file') !== -1,
              "Root leafs are wrong:\n" +
              rootLeafs
            );

            // We don't want to leave junk, so we destroy the file.
            testFile.rm(function (err) {
              // Testing removal.
              root.subfiles(function(err, rootLeafs) {
                assert(
                  rootLeafs.indexOf('file') === -1,
                  "Removal of files doesn't work."
                );
                end(null);
              }, 3);
            });
          }, 2);

        });
      });
    });
  });

});



// driver.js
//

tests.push(function testDriver(end) {

  var driver = require('./driver'),
      sample = '$foo/bar/baz.js',
      rpath = driver.absolute(sample);  // real path name.

  function doWithMetaFile() {
    // Check that the metadata was dumped.
    driver.loadMeta(sample, function (err, metadata) {
      assert(!err, (err? err.stack: ''));
      assert(metadata.hello === 'world',
             "Metadata was not serialized properly:\n" +
             "it serialized " + JSON.stringify(metadata) + "\n" +
             "while it should have serialized {\"hello\":\"world\"}.");

      // Remove the meta file (and the rest).
      child.spawn('rm', ['-r', 'meta/$foo']);
      child.spawn('rm', ['-r', 'web/$foo']);
      end(null);
    });
  }

  child.spawn('mkdir', ['-p', path.dirname(rpath)]).on('exit', function (code) {
    fs.writeFile(rpath, "Whatever.", function onFileWritten(err) {
      if (err)  console.error("Cannot create file", rpath);
      // Add a sample meta file.
      driver.dumpMeta(sample, {'hello':'world'}, doWithMetaFile);
    });
  });

});



// lookup.js
//

tests.push(function testLookup(end) {

  var makeLookup = require('./lookup');
  var tfs = require('./fs');

  // Test the JSON parser.
  var queryOutput = makeLookup.parseJSONQuery("foo.bar['b\\'a\\'z'].qu\\u0075x");
  assert.deepEqual(queryOutput, ['foo', 'bar', 'b\'a\'z', 'quux'],
    'JSON query parser failed with the following output: ' +
    JSON.stringify(queryOutput));
  queryOutput = makeLookup.parseJSONQuery("[\"Dalai Lama\"]['']");
  assert.deepEqual(queryOutput, ['Dalai Lama', ''],
    'JSON query parser starting with brackets and consecutive brackets, ' +
    'gave the following invalid output: ' + JSON.stringify(queryOutput));

  // We want to create a file `file`.
  tfs.file('$test', function(err, folder) {
    assert(!err, 'Lookup: Cannot get folder $test');
    // We want the folder to have {foo: {bar: "baz"}}.
    folder.meta.foo = {bar: "baz"};
    folder.create('file', 'text', function(err) {
      assert(!err, 'Lookup: Cannot create file');
      tfs.file('$test/file', function(err, file) {
        assert(!err, 'Lookup: Cannot get file');
        // We want the file to have {foo: {quux: "baz"}}.
        file.meta.foo = {quux: "baz"};
        testLookup(file);
      });
    });
  });

  function testLookup(file) {
    var lookup = makeLookup(file, {});
    async.parallel([function(done) {
      lookup('foo', function(data) {
        assert(data != null, 'Lookup of direct metadata succeeds');
        assert(data.quux === "baz", 'Lookup of direct metadata');
        done();
      });
    }, function(done) {
      lookup('foo.bar', function(data) {
        assert(data === "baz", 'Lookup of indirect metadata');
        done();
      });
    }], function whenDone() {
      file.rm(function(err) {
        assert(!err, 'Lookup: Cannot remove file');
        end(null);
      });
    });
  }

});


// Run all tests sequentially.
async.series(tests, function end() {
  // Remove the meta file (and the rest).
  child.spawn('rm', ['-r', 'meta/$test']);
  child.spawn('rm', ['-r', 'web/$test']);
});
