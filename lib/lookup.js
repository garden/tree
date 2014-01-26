// Look metadata up.
// Copyright © 2011-2013 Thaddee Tyl. All rights reserved.
// The following code is covered by the AGPLv3 license.

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
        console.error('parseJSONQuery: invalid identifier for JSON query ' +
                      jsonquery + '.');
        return keys;
      }
    } else if (state === string) {
      for (var j = i;
           jsonquery[j] !== stringType && j < jsonquery.length;
           j++) {
        if (jsonquery[j] === '\\') {
          j++;  // This is an escape → skip one char.
        }
      }
      // JSON only allows "-delimited strings.
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
  var keys = parseJSONQuery(jsonquery);
  var value = obj;
  for (var i = 0; i < keys.length; i++) {
    value = value[keys[i]];
    if (value === undefined)  return undefined;
  }
  return value;
}

function recurseMeta(file, key, cb) {
  var got;
  if ((got = getMeta(file.meta, key)) !== undefined) {
    if (cb) {
      cb(got);
    } else return got;
  } else if (file.path.length === 1) {
    // We are at the root, cannot go further up.
    if (cb) {
      cb(null);
    } else return null;
  } else {
    if (cb) {
      fs.file(path.dirname(file.path), function (err, parent) {
        if (err) {
          console.error('lookup:recurseMeta:', err.stack);
          cb(null);
        } else recurseMeta(parent, key, cb);
      });
    } else return null;
  }
}

function makeLookup(file, query) {
  // From most specific (url?key=value) to most generic (inherited metadata)
  return function lookup(key, cb) {
    if (query[key]) {
      if (cb) {
        cb(query[key]);
      } else {
        return query[key];
      }
    } else {
      return recurseMeta(file, key, cb);
    }
  };
}

module.exports = makeLookup;
module.exports.parseJSONQuery = parseJSONQuery;
