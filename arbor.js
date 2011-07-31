/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var Camp = require ('./lib/camp.js');

Camp.handle (/\/root\/(.*)/, function (query, path) {
  path[0] = '/pencil.html';
});
