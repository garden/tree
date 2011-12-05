/* profiler.js: gather information about different elements in the system.
 * It is linked to the profiler.html template.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var camp = require('../camp/camp'),
    fs = require('./fs');

// Switch: this switch turns all profiling on, at the expense of CPU cycles.
var profon = true;

// Gather information.
// 
// Each subsystem exports a .profile object, which contains a list of
// {doc:'what this number means', data:123}.

var profiles = {
  'File system': fs.profile || {}
};


// The template gets the result from the following function
function template (query, path) {
  console.log('PROFILER: templating the main page [', profiles, ']');
  return {
    profiles:profiles
  };
}

// We need to wire up the `profiler.html` template.

camp.handle(/^\/perf\/profiler.html$/, template);

