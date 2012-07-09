/* Run this with node to start your tree server.
 * Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIG
//

// Import modules
var Camp = require('camp'),
    camp = Camp.start({
      port: +process.argv[2],
      secure: process.argv[3] === 'yes',
      debug: +process.argv[4],
      key: 'https.key',
      cert: 'https.crt',
      ca: ['https.ca'],
    }),
    driver = require('./lib/driver'),
    fshooks = require('./lib/fshooks'),
    irc = require('./lib/irc'),
    plug = require('./lib/plug'),
    profiler = require('./lib/profiler'),
    nodepath = require('path');

// Socket.io: silence will fall!
camp.io.configure('development', function () {
  camp.io.set('log level', 0);
  camp.io.set('browser client minification', true);
//  camp.io.set('browser client gzip', true); // FIXME broken since v0.8.0
});

Camp.Plate.parsers['script'] = function (text) {
  return text.replace(/</g, '\\u003c');
};

// Init subroutines
plug.main(camp);


// ROUTING
//

camp.route(/\/(.*)/, plug.resolve);  // Redirect all URLs to corresponding plug.

// Profiler API.
camp.ajax.on('profiler', function (query, end) { end(profiler.run(query)); });


// File System API.
camp.ajax.on('fs', fshooks.fs);


// Metadata API.
camp.ajax.on('meta-save', fshooks.meta);


// IRC API.
camp.ajax.on('join', irc.join);
camp.ajax.on('say', irc.say);

