/* fs.js: file system primitives
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var Camp = require ('./lib/camp.js');

Camp.handle (/\/(.*)/, function (query, path) {
  path[0] = '/pencil.html';
});
