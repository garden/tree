// Look metadata up.
// Copyright © 2012 Thaddee Tyl. All rights reserved.
// The following code is covered by the GPLv2 license.

var path = require('path');
var fs = require('./fs');

// States for the JSON query parser.
var identifier = 0;
var identifierEscape = 1;
var string = 2;

// parseJSONQuery("foo.bar['baz'].quux")
// returns ["foo", "bar", "baz", "quux"].
function parseJSONQuery(jsonquery) {
  var keys = [];
  var key = '';
  var state = identifier;
  var stringType;  // Either " or '.
  for (var i = 0; i < jsonquery.length; i++) {
    if (state === identifier) {
      if (jsonquery[i] === '.') {
        keys.push(key);
        key = '';
      } else if (jsonquery[i] === '[') {
        state = string;
        if (key.length > 0) { keys.push(key); key = ''; }
        i++;  // Skip the string type.
        stringType = jsonquery[i];
      } else if (jsonquery[i] === '\\') {
        state = identifierEscape;
      } else {
        key += jsonquery[i];
      }
    } else if (state === identifierEscape) {
      if (jsonquery[i] === 'u') {
        key += JSON.parse('"\\u' + jsonquery.slice(i + 1, i + 5) + '"');
        i += 4;  // Jump u and the four hex digits.
        state = identifier;
      } else {
        throw new Error('parseJSONQuery: invalid identifier for JSON query ' +
                        jsonquery + '.');
      }
    } else if (state === string) {
      for (var j = i;
           jsonquery[j] !== stringType && j < jsonquery.length;
           j++) {
        if (jsonquery[j] === '\\') {
          j++;  // This is an escape → skip one char.
        }
      }
      key = JSON.parse('"' + jsonquery.slice(i, j)
          .replace(/\\'/g, "'").replace(/"/g, '\\"') + '"');
      i = j + 1;  // Position ourself after the closing bracket.
      state = identifier;
    } else {
      throw new Error('parseJSONQuery: invalid state for JSON query ' +
                      jsonquery + '.');
    }
  }
  keys.push(key);
  return keys;
}

function getMeta(obj, jsonquery) {
  // Read the key from the query.
  var ikey = jsonquery.indexOf('/'),
      key;
  if (ikey > 0) {
    key = jsonquery.slice(0, ikey);
  } else {
    key = jsonquery;
  }
  if (obj instanceof Object && obj[key]) {
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
module.exports.parseJSONQuery = parseJSONQuery;
