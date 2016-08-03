// Types of files.
// Copyright © 2011-2016 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var driver = require('./driver');

// Types are internally represented by integers.
//
// We go from _type_ world to _int_ world and back
// with `fromName` and `nameFromType`.

var fromName = {};      // Links the type to a unique integer.
var nbTypes = 0;        // Number of different types.
var fallbacks = [];     // Array of parent types (all being integers).
var nameFromType = [];  // Array of types (Strings).

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

// Each type corresponds directly to a driver of the same name.
// FIXME: we no longer use fallback types, a lot of code here can be simplified.

addType('dir');
addType('binary');
addType('text');


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
// - fromName: Map from types (String) to type number
// - nameFromType: Array of all types in order
// - isCompatible(type :: Number, ancestor :: Number)
// - driver(type :: Number)

exports.addType = addType;
exports.fromName = fromName;
exports.nameFromType = nameFromType;
exports.isCompatible = isCompatible;
exports.driver = findDriver;

