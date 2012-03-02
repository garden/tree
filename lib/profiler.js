/* profiler.js: gather information about different elements in the system.
 * It is linked to the profiler.html template.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var camp = require('../camp/camp'),
    fs = require('./fs');

// Gather information.
//
// Each subsystem exports a .profile function, which returns an
// object which contains a list of
// {doc:'what this number means', data:123}.

var sources = {
  'Generic': function () {
    var mem = process.memoryUsage(),
        uptime = process.uptime(),
        loadAvg = require('os').loadavg();
    console.log('Will return!');
    return [
      {doc: "Node", data: process.version},
      {doc: "Platform", data: process.platform},
      {doc: "Architecture", data: process.arch},
      {doc: "Memory Heap (bytes)", data: mem.heapTotal},
      {doc: "Memory Heap Used", data: mem.heapUsed},
      {doc: "Memory Resident Set Size", data: mem.rss},
      {doc: "Uptime (seconds)", data: uptime},
      {doc: "Uptime (days)", data: uptime / (3600 * 24)},
      {doc: "Load Average (1, 5, 15 min.)", data: loadAvg},
    ];
  },
  'File system': fs.profile
};

var profiles = {};

function runProfiles () {
  for (var s in sources) {
    profiles[s] = sources[s]();  // `sources[s]` is a function.
  }
  return profiles;
}


// The template gets the result from the following function
function template (query, path) {
  console.log('PROFILER: templating the main page [', runProfiles(), ']');
  return { profiles:runProfiles() };
}

// We need to wire up the `profiler.html` template.

function main(selectprofiles) {
  camp.route(/^\/perf\/profiler.html$/, template);
}

exports.main = main;

