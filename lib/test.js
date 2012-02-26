/* Testing library elements of the File Tree server side.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var assert = require('assert'),
    fs = require('./fs');


fs.file("/", function (err, root) {
  // Add file "file".
  root.mkfile("file", function(err) {

    // Testing subfiles.
    root.subfiles(function(err, rootLeafs) {
      //console.log(rootLeafs);
      assert(
        rootLeafs.indexOf('file') !== -1,
        "Root leafs are wrong."
      );
    }, 2);

    // We don't want to leave junk, so we destroy everything.
    fs.file("/file", function (err, f) {
      f.rm(function (err) {
        // Testing removal.
        root.subfiles(function(err, rootLeafs) {
          console.log(rootLeafs);
          assert(
            rootLeafs.indexOf('file') === -1,
            "Removal of files doesn't work."
          );
        }, 3);
      });
    });

  });
});
