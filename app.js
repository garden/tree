/* Run this with node to start your file tree server.
 * Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
 * The following code is covered by the GPLv2 license. */


// IMPORT MODULES
//

var Camp     = require('camp'),
    nodepath = require('path'),
    driver   = require('./lib/driver'),
    fsapi    = require('./lib/fsapi'),
    irc      = require('./lib/irc'),
    plug     = require('./lib/plug'),
    profiler = require('./lib/profiler');


// SERVER SETUP
//

// Start the server with command line options
var camp = Camp.start({
  port: +process.argv[2],
  secure: process.argv[3] === 'yes',
  debug: +process.argv[4],
  key: 'https.key',
  cert: 'https.crt',
  ca: ['https.ca'],
});

// Socket.io: silence will fall!
camp.io.configure('development', function () {
  camp.io.set('log level', 0);
  camp.io.set('browser client minification', true);
//camp.io.set('browser client gzip', true); // FIXME broken in Socket.io
});

// Custom templating filter
Camp.templateReader.parsers.script = function (text) {
  return text.replace(/</g, '\\u003c');
};
Camp.templateReader.parsers.path = function (text) {
  return encodeURIComponent(text).replace(/%2F/g, unescape);
};
Camp.templateReader.macros.lookup = function (write, literal, params) {
  if (literal.lookup && literal.file) {
    literal.lookup(params[0], function(value, err) {
      write(value);
    });
  } else write('');
};

// Init subroutines
plug.main(camp);


// ROUTING
//

// Redirect all requests to a templated plug.
camp.route(/\/(.*)/, plug.resolve);

// Profiler API.
camp.ajax.on('profiler', function (query, end) { end(profiler.run(query)); });

// File System API.
camp.ajax.on('fs', fsapi.fs);

// Metadata API.
camp.ajax.on('meta-save', fsapi.meta);

// IRC API.
camp.ajax.on('join', irc.join);
camp.ajax.on('say', irc.say);

