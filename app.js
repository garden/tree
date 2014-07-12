// Run this with node to start your file tree server.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.


// IMPORT MODULES
//

var Camp     = require('camp');
var nodepath = require('path');
var hun      = require('hun');
var driver   = require('./lib/driver');
var fsapi    = require('./lib/fsapi');
var irc      = require('./lib/irc');
var plug     = require('./lib/plug');
var profiler = require('./lib/profiler');


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
function templateScript(text) {
  return text.replace(/</g, '\\u003c');
}
function templatePath(text) {
  return encodeURIComponent(text).replace(/%2F/g, unescape);
}
function templateLookup(write, literal, params) {
  if (literal.lookup && literal.file) {
    literal.lookup(params[0], function(value, err) {
      write(value);
    });
  } else write('');
}
Camp.templateReader.parsers.script = hun.parsers.script = templateScript;
Camp.templateReader.parsers.path = hun.parsers.path = templatePath;
Camp.templateReader.macros.lookup = hun.macros.lookup = templateLookup;

// Init subroutines
plug.main(camp, hun);


// ROUTING
//

// Redirect all requests to a templated plug.
camp.route(/\/(.*)/, plug.resolve);

// Profiler API.
camp.ajax.on('profiler', function (query, end) { end(profiler.run(query)); });

// File System API.
camp.ajax.on('fs', fsapi.fs);

// File upload API.
camp.ajax.on('upload', fsapi.upload);

// Metadata API.
camp.ajax.on('meta-save', fsapi.meta);

// Shell API.
camp.ajax.on('shell', fsapi.shell);

// IRC API.
camp.ajax.on('join', irc.join);
camp.ajax.on('say', irc.say);

