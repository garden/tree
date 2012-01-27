/* driver.js: Primitives to deal with the way we store data on disk.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodefs = require('fs');

var primitives = [];

// Create a new driver for a mime type.
//
// - mime :: String
// - funcs :: Object
//
// A minimum for funcs is:
//
//     {
//       read: function(path :: String, cb :: Function),
//       write: function(path :: String, content :: ?, cb :: Function)
//     }
function driver(mime, funcs) {
  this.mime = mime;
  this.funcs = funcs;
  primitives.push(this);
}



driver('dir', {
  read: function(path, cb) {
    nodefs.readdir (path, function (err, files) {
      if (err) {
        cb(err);
        return;
      }
      cb(files);
    });
  },
});

driver('text/plain', {
  read: function(path, cb) {
    nodefs.readFile(path, 'utf8', cb);
  },

  write: function(path, content, cb) {
    nodefs.writeFile(path, content, 'utf8', cb);
  },
});

driver('binary', {
  read: function(path, cb) {
    nodefs.readFile(path, cb);
  },

  write: function(path, content, cb) {
    nodefs.writeFile(path, content, cb);
  },
});


exports.primitives = primitives;

