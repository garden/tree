/* profiler.js: gather information about different elements in the system.
 * It is linked to the profiler.html template.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var fs = require('./fs');

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
    return [
      {doc: "Node", data: process.version},
      {doc: "Platform", data: process.platform},
      {doc: "Architecture", data: process.arch},
      {doc: "Memory Heap", data: mem.heapTotal, unit: "bytes"},
      {doc: "Memory Heap Used", data: mem.heapUsed, unit: "bytes"},
      {doc: "Memory Resident Set Size", data: mem.rss, unit: "bytes"},
      {doc: "Uptime", data: uptime, unit: "seconds"},
      {doc: "Uptime", data: uptime / (3600 * 24), unit: "days"},
      {doc: "Load Average (1, 5, 15 min.)", data: loadAvg, unit: "# of proc."},
    ];
  },
  'File system': fs.profile
};

var profiles = {};

function runProfiles (param) {
  for (var s in sources) {
    profiles[s] = sources[s](param[s]);  // `sources[s]` is a function.
  }
  return profiles;
}


exports.run = runProfiles;

