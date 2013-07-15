// Types of files.
// Copyright © 2011-2013 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.

var nodepath = require('path');
var nodefs = require('fs');
var driver = require('./driver');
var mime = require('camp').mime;

// Types are internally represented by integers.
//
// We go from _mime type_ world to _int_ world and back
// with `fromName` and `nameFromType`.

var fromName = {};      // Links the mime type to a unique integer.
var nbTypes = 0;        // Number of different types.
var fallbacks = [];     // Array of parent types (all being integers).
var nameFromType = [];  // Array of mime types (Strings).

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
addType('text', [fromName['binary']]);

addType('application/pdf', [fromName['binary']]);
addType('application/ps', [fromName['application/pdf'], fromName['binary']]);
addType('image/jpeg', [fromName['binary']]);
addType('image/jpg', [fromName['binary']]);
addType('image/tiff', [fromName['binary']]);
addType('image/gif', [fromName['binary']]);
addType('image/vnd.microsoft.icon', [fromName['binary']]);
addType('image/png', [fromName['binary']]);
addType('application/ogg', [fromName['binary']]);
addType('audio/mpeg', [fromName['binary']]);

addType('application/json', [fromName['text']]);
addType('application/x-aspx', [fromName['text']]);
addType('application/x-ejs', [fromName['text']]);
addType('application/x-httpd-php', [fromName['text']]);
addType('application/x-httpd-php-open', [fromName['text']]);
addType('application/x-jsp', [fromName['text']]);
addType('application/x-sparql-query', [fromName['text']]);
addType('application/xml', [fromName['text']]);
addType('application/xquery', [fromName['text']]);
addType('text/css', [fromName['text']]);
addType('text/html', [fromName['text']]);
addType('text/javascript', [fromName['text']]);
addType('text/n-triples', [fromName['text']]);
addType('text/tiki', [fromName['text']]);
addType('text/vbscript', [fromName['text']]);
addType('text/velocity', [fromName['text']]);
addType('text/x-c++src', [fromName['text']]);
addType('text/x-clojure', [fromName['text']]);
addType('text/x-coffeescript', [fromName['text']]);
addType('text/x-csharp', [fromName['text']]);
addType('text/x-csrc', [fromName['text']]);
addType('text/x-diff', [fromName['text']]);
addType('text/x-ecl', [fromName['text']]);
addType('text/x-erlang', [fromName['text']]);
addType('text/x-go', [fromName['text']]);
addType('text/x-groovy', [fromName['text']]);
addType('text/x-haskell', [fromName['text']]);
addType('text/x-ini', [fromName['text']]);
addType('text/x-java', [fromName['text']]);
addType('text/x-less', [fromName['text']]);
addType('text/x-lua', [fromName['text']]);
addType('text/x-markdown', [fromName['text']]);
addType('text/x-mysql', [fromName['text']]);
addType('text/x-pascal', [fromName['text']]);
addType('text/x-perl', [fromName['text']]);
addType('text/x-php', [fromName['text']]);
addType('text/x-pig', [fromName['text']]);
addType('text/x-plsql', [fromName['text']]);
addType('text/x-properties', [fromName['text']]);
addType('text/x-python', [fromName['text']]);
addType('text/x-rpm-changes', [fromName['text']]);
addType('text/x-rpm-spec', [fromName['text']]);
addType('text/x-rsrc', [fromName['text']]);
addType('text/x-rst', [fromName['text']]);
addType('text/x-ruby', [fromName['text']]);
addType('text/x-rustsrc', [fromName['text']]);
addType('text/x-scheme', [fromName['text']]);
addType('text/x-sh', [fromName['text']]);
addType('text/x-smarty', [fromName['text']]);
addType('text/x-stex', [fromName['text']]);
addType('text/x-stsrc', [fromName['text']]);
addType('text/x-tiddlywiki', [fromName['text']]);
addType('text/x-verilog', [fromName['text']]);
addType('text/x-yaml', [fromName['text']]);



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
// - driver(type :: Number)

exports.addType = addType;
exports.fromName = fromName;
exports.nameFromType = nameFromType;
exports.isCompatible = isCompatible;
exports.driver = findDriver;

