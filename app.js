// Run this with node to start your file tree server.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.


// IMPORT MODULES
//

var Camp     = require('camp');
var nodepath = require('path');
var driver   = require('./lib/driver');
var fsapi    = require('./lib/fsapi');
var irc      = require('./lib/irc');
var app      = require('./lib/app');
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

// Custom templating filter
function templateScript(text) {
  return text.replace(/</g, '\\u003c');
}
function templatePath(text) {
  return encodeURIComponent(text).replace(/%2F/g, unescape);
}
function templateLookup(params) {
  return [
    'if ($_scope.lookup && $_scope.file) {',
    '  $_scope.lookup(' + JSON.stringify(params[0]) + ', function(value, err) {',
    '    $_write(value);',
    '  });',
    '} else { $_write(""); }'
  ].join('\n');
}
Camp.templateReader.parsers.script = templateScript;
Camp.templateReader.parsers.path = templatePath;
Camp.templateReader.macros.lookup = templateLookup;

// Init subroutines
app.main(camp);


// ROUTING
//

// Redirect all requests to a templated app.
camp.path('*', app.resolve);

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

