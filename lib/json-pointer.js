// Convert a JSON Pointer to a list.
var listFromJsonPointer = function(pointer) {
  if (typeof pointer !== 'string') {
    throw new Error('listFromJsonPointer() only supports strings, ' +
      'something else was given')
  }

  var parts = pointer.split('/').slice(1)
  return parts.map(function(part) {
    if (!/~/.test(part)) { return part }
    // It is important to end with the ~ replacement,
    // to avoid converting `~01` to a `/`.
    return part.replace(/~1/g, '/').replace(/~0/g, '~')
  })
}

var jsonPointerFromList = function(path) {
  if (!(Object(path) instanceof Array)) {
    throw new Error('jsonPointerFromList() only supports arrays, ' +
      'something else was given')
  }

  return '/' + path.map(function(part) {
    // It is important to start with the ~ replacement,
    // to avoid converting `/` to `~01`.
    return part.replace(/~/g, '~0').replace(/\//g, '~1')
  }).join('/')
}

exports.listFromJsonPointer = listFromJsonPointer;
exports.jsonPointerFromList = jsonPointerFromList;
