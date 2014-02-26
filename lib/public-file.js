// Public-facing metadata.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

function publicMeta(meta) {
  return JSON.parse(JSON.stringify(meta, function(key, val) {
    // Withhold the keys.
    return (key === 'metakey' || key === 'writekey' || key === 'readkey')?
      '[withheld]': val; }));
}

function publicFile(file) {
  var newFile = objCopy(file);
  newFile.meta = publicMeta(newFile.meta);
  newFile.mime = file.meta.type;
  return newFile;
}

function objCopy(o) {
  var newObject = Object.create(null);
  for (var p in o) {
    try {
      newObject[p] = JSON.parse(JSON.stringify((o[p])));
    } catch(e) {}
  }
  return newObject;
}

module.exports = publicFile;
module.exports.meta = publicMeta;
