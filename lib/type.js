/* type.js: Types of files.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodepath = require('path'),
    nodefs = require('fs'),
    driver = require('./driver'),
    camp = require('../camp/camp');

// Types are internally represented by integers.
//
// We go from _mime type_ world to _int_ world and back
// with `fromName` and `nameFromType`.

var fromName = {},     // Links the mime type to a unique integer.
    nbTypes = 0,   // Number of different types.
    fallbacks = [],    // Array of parent types (all being integers).
    nameFromType = [];  // Array of mime types (Strings).

function addType (mimeType, parents) {
  fallbacks.push(parents || []);
  nameFromType.push(mimeType);
  fromName[mimeType] = nbTypes;
  nbTypes++;
}


// The following algorithm is not cyclic-aware.
// Please do not create cycles in the type system.
function isCompatible (type, ancestor) {
  if (type === ancestor)  return true;
  if (!fallbacks[type]) {
    console.error('TYPE:isCompatible: type %s (%s) does not have fallbacks',
        nameFromType[type], type);
    return false;
  }
  for (var i = 0;  i < fallbacks[type].length;  i++) {
    if (isCompatible(fallbacks[type][i], ancestor))  return true;
  }
  return false;
}

// Defining current types (and their compatibility table).

addType('dir');            // contains a JSON string of files.
addType('binary');
addType('text/plain', [fromName['binary']]);
addType('text/html', [fromName['text/plain']]);
addType('text/xml', [fromName['text/plain']]);
addType('text/css', [fromName['text/plain']]);
addType('text/dtd', [fromName['text/plain']]);

addType('text/javascript', [fromName['text/plain']]);
addType('application/json', [fromName['text/plain']]);
addType('text/csv', [fromName['text/plain']]);
addType('text/x-csrc', [fromName['text/plain']]);
addType('text/x-c++src', [fromName['text/plain']]);
addType('text/x-csharp', [fromName['text/plain']]);
addType('text/x-java', [fromName['text/plain']]);
addType('text/x-groovy', [fromName['text/plain']]);
addType('text/x-clojure', [fromName['text/plain']]);
addType('text/x-coffeescript', [fromName['text/plain']]);
addType('text/x-diff', [fromName['text/plain']]);
addType('text/x-haskell', [fromName['text/plain']]);
addType('text/less', [fromName['text/plain']]);
addType('text/x-lua', [fromName['text/plain']]);
addType('text/x-markdown', [fromName['text/plain']]);
addType('text/x-mysql', [fromName['text/plain']]);
addType('text/n-triples', [fromName['text/plain']]);
addType('text/x-pascal', [fromName['text/plain']]);
addType('text/x-perl', [fromName['text/plain']]);
addType('text/x-php', [fromName['text/plain']]);
addType('text/x-plsql', [fromName['text/plain']]);
addType('text/x-python', [fromName['text/plain']]);
addType('text/x-rpm-spec', [fromName['text/plain']]);
addType('text/x-rpm-changes', [fromName['text/plain']]);
addType('text/x-rsrc', [fromName['text/plain']]);
addType('text/x-rst', [fromName['text/plain']]);
addType('text/x-ruby', [fromName['text/plain']]);
addType('text/x-rustsrc', [fromName['text/plain']]);
addType('text/x-scheme', [fromName['text/plain']]);
addType('text/x-scheme', [fromName['text/plain']]);
addType('text/x-scheme', [fromName['text/plain']]);
addType('text/x-stsrc', [fromName['text/plain']]);
addType('text/x-sparql-query', [fromName['text/plain']]);
addType('text/x-stex', [fromName['text/plain']]);
addType('text/x-stex', [fromName['text/plain']]);
addType('text/velocity', [fromName['text/plain']]);
addType('text/x-yaml', [fromName['text/plain']]);

addType('application/ps', [fromName['application/pdf'], fromName['binary']]);
addType('application/pdf', [fromName['binary']]);

addType('image/jpeg', [fromName['binary']]);
addType('image/jpg', [fromName['binary']]);
addType('image/tiff', [fromName['binary']]);
addType('image/gif', [fromName['binary']]);
addType('image/vnd.microsoft.icon', [fromName['binary']]);
addType('image/png', [fromName['binary']]);
addType('image/svg+xml', [fromName['text/plain']]);



// Get the type associated to the extention of the file.
//
function guessType (path, cb) {
  nodefs.stat (driver.fromFakeRoot(path), function (err, stats) {
    if (err) {
      console.error('TYPE:guessType: did not guess type of', path);
      cb(err);
      return;
    }

    if (stats.isDirectory()) {
      cb(null, fromName['dir']);
    } else if (stats.isFile()) {
      cb(null, fromName[
          camp.server.mime[nodepath.extname(path).slice(1)] || 'text/plain'
      ]);
    } else {
      cb(new Error("File is neither a directory, nor a file."));
    }
  });
};



// Driver access.

var drivers = [];  // Sparse array from types to I/O primitives.

// Reminder: driver.primitives contains a list
for (var i = 0; i < driver.primitives.length; i++) {
  var prim = driver.primitives[i];
  drivers[fromName[prim.mime]] = prim.funcs;
  delete prim.mime;     // We don't need to clutter our memory.
}

// We don't need primitives anymore.
delete driver.primitives;

// This is not cycle-aware.
// Do not create loops in the type system.
function findDriver(type) {
  var driver;
  if (driver = drivers[type]) {
    return driver;  // There is a driver for this type.
  } else {
    for (var i = 0; i < fallbacks[type].length; i++) {
      if (driver = findDriver(fallbacks[type][i])) {
        return driver;
      }
    }
  }
  return null;
}


// We export the following:
//
// - addType(mimeType :: String, parents :: Array)
// - fromName: Map from mime types (String) to type number
// - nameFromType: Array of all types in order
// - isCompatible(type :: Number, ancestor :: Number)
// - guessType(path :: String, cb :: Function)
// - driver(type :: Number)

exports.addType = addType;
exports.fromName = fromName;
exports.nameFromType = nameFromType;
exports.isCompatible = isCompatible;
exports.guessType = guessType;
exports.driver = findDriver;

