// Look metadata up.
// Copyright © 2012 Thaddee Tyl. All rights reserved.
// The following code is covered by the GPLv2 license.

var path = require('path');
var fs = require('./fs');

function getMeta(obj, jsonquery) {
  // Read the key from the query.
  var ikey = jsonquery.indexOf('/'),
      key;
  if (ikey > 0) {
    key = jsonquery.slice(0, ikey);
  } else {
    key = jsonquery;
  }
  if (typeof obj === 'object' && obj[key]) {
    if (ikey > 0) {
      return getMeta(obj[key], key.slice(ikey + 1));
    } else {
      return obj[key];
    }
  }
}

function recurseMeta(file, key) {
  var got;
  if (got = getMeta(file.meta, key)) {
    return got;
  } else if (file.path.length === 1) {
    // We are at the root, cannot go further up.
    return null;
  } else {
    fs.file(path.dirname(file.path), function (err, parent) {
      if (err) {
        console.error(err.stack);
      } else return recurseMeta(parent, key);
    });
  }
}

function makeLookup(file, query) {
  // From most specific (url?key=value) to most generic (inherited metadata)
  return function lookup(key) {
    if (query[key])  return query[key];
    else {
      var found = recurseMeta(file, key);
      return found === undefined? null: found;
    }
  };
}

module.exports = makeLookup;
