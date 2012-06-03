/* type.js: Types of files.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var nodepath = require('path'),
    nodefs = require('fs'),
    driver = require('./driver'),
    mime = require('camp').mime;

// Types are internally represented by integers.
//
// We go from _mime type_ world to _int_ world and back
// with `fromName` and `nameFromType`.

var fromName = {},     // Links the mime type to a unique integer.
    nbTypes = 0,   // Number of different types.
    fallbacks = [],    // Array of parent types (all being integers).
    nameFromType = [];  // Array of mime types (Strings).

function addType(mimeType, parents) {
  fallbacks.push(parents || []);
  nameFromType.push(mimeType);
  fromName[mimeType] = nbTypes;
  nbTypes++;
}


// The following algorithm is not cyclic-aware.
// Please do not create cycles in the type system.
function isCompatible(type, ancestor) {
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

addType('application/pdf', [fromName['binary']]);
addType('application/ps', [fromName['application/pdf'], fromName['binary']]);

addType('image/jpeg', [fromName['binary']]);
addType('image/jpg', [fromName['binary']]);
addType('image/tiff', [fromName['binary']]);
addType('image/gif', [fromName['binary']]);
addType('image/vnd.microsoft.icon', [fromName['binary']]);
addType('image/png', [fromName['binary']]);



// Get the type associated to the extention of the file.
//
function guessType (vpath, cb) {
  var npath = driver.normalize(vpath);
  nodefs.stat(driver.relative(npath), function (err, stats) {
    if (err) {
      cb(err);
      return;
    }
    if (stats.isDirectory()) {
      cb(null, fromName['dir']);
    } else if (stats.isFile()) {
      cb(null, fromName[
          mime[nodepath.extname(npath).slice(1)] || 'text/plain'
      ]);
    } else {
      cb(new Error("File is neither a directory, nor a file."));
    }
  });
};



// Driver access.

var drivers = [];  // Sparse array from types to I/O primitives.

for (var prims in driver.primitives) {
  drivers[fromName[prims]] = driver.primitives[prims];
}


// This is not cycle-aware.
// Do not create loops in the type system.
function findDriver(type) {
  var driver;
  if (driver = drivers[type]) {
    return driver;  // There is a driver for this type.
  } else if (fallbacks[type]) {
    for (var i = 0; i < fallbacks[type].length; i++) {
      if (driver = findDriver(fallbacks[type][i])) {
        return driver;
      }
    }
  }
  console.error("Type:findDriver: cannot find driver of type %s.",
      nameFromType[type]);
  return null;
}


// We export the following:
//
// - addType(mimeType :: String, parents :: Array)
// - fromName: Map from mime types (String) to type number
// - nameFromType: Array of all types in order
// - isCompatible(type :: Number, ancestor :: Number)
// - guessType(vpath :: String, cb :: Function)
// - driver(type :: Number)

exports.addType = addType;
exports.fromName = fromName;
exports.nameFromType = nameFromType;
exports.isCompatible = isCompatible;
exports.guessType = guessType;
exports.driver = findDriver;

