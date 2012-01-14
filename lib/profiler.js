/* profiler.js: gather information about different elements in the system.
 * It is linked to the profiler.html template.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var camp = require('../camp/camp'),
    fs = require('./fs');

// Gather information.
//
// Each subsystem exports a .profile object, which contains a list of
// {doc:'what this number means', data:123}.

var sources = {
  'File system': fs.profile
};

// { "File System": function(){ return {"doc":"...", data:...}; }, ... }
var profiles = {};

function runProfiles () {
  for (var s in sources) {
    profiles[s] = sources[s]();  // `sources[s]` is a function.
  }
  return profiles;
}


// The template gets the result from the following function
function template (query, path) {
  console.log('PROFILER: templating the main page [', profiles, ']');
  return { profiles:runProfiles() };
}

// We need to wire up the `profiler.html` template.

function main(selectprofiles) {
  camp.handle(/^\/perf\/profiler.html$/, template);
}

exports.main = main;

