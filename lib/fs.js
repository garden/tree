// File system primitives.
// The following code is covered by the AGPLv3 license.

var fs = require('fs');
var pathLib = require('path');

var log = require('./log');
var jsonPointer = require('./json-pointer');
var listFromJsonPointer = jsonPointer.listFromJsonPointer;
var jsonPointerFromList = jsonPointer.jsonPointerFromList;

var camp = require('camp');
var mimeTypes = camp.mime;
var stream = require('stream');
var Writable = stream.Writable;

var metadataFile = 'metadata.json';
var metadataSavingInterval = 5000;  // milliseconds.
// When modifying the metadata, reset dirtyMetadata.
var metadata = JSON.parse(fs.readFileSync(metadataFile));
var dirtyMetadata = false;  // Are there changes to commit to disk?

function saveMetadata() {
  return new Promise(function(resolve, reject) {
    log('Saving metadata to disk.')
    try {
      var content = JSON.stringify(metadata);
    } catch(e) {
      var errmsg = "Metadata is no longer JSON-serializable!";
      log.error(errmsg);
      reject(new Error(errmsg));
      return;
    }
    fs.writeFile(metadataFile, content, function(err) {
      if (err != null) { reject(err); return; }
      resolve();
    });
  });
}

function initAutosave() {
  setInterval(function saveMetadataIfNeeded() {
    if (dirtyMetadata) {
      saveMetadata();
      dirtyMetadata = false;
    }
  }, metadataSavingInterval);
}

// Return a Promise<ReadableStream>.
// options:
// - depth: 0 to include subfile metadata, 1 to include their subfiles and
//  metadata, etc.
// - user: name, to check for permission
function getStream(path, options) {
  options = options || {};
  var realPath = realFromVirtual(path);
  // Stat it; if it is a directory, send a JSON list of subfiles; otherwise the
  // content.
  return new Promise(function(resolve, reject) {
    fs.stat(realPath, function(err, stats) {
      if (err != null) { reject(err); return; }
      if (stats.isFile()) {
        resolve(fs.createReadStream(realPath));
      } else if (stats.isDirectory()) {
        var subfiles = flatSubfiles(path, options.depth, options.user);
        resolve(streamFromData(Buffer.from(JSON.stringify(subfiles))));
      } else {
        reject(new Error('getStream: unknown file type on disk'));
      }
    });
  });
}

// Return the `files` field of a directory, without the subsubfiles.
// depth: if < 0, return just a list of file names.
//   If 0, a map from file names to {meta: {type, updated}, files}.
//   If 1 or more, include subfiles recursively.
// user: name, to check for permission
function flatSubfiles(path, depth, user) {
  var pointer = fileNodePointer(path);
  pointer.push('files');
  var data = findPointer(pointer, metadata);
  var perms = filePerms(path, user);
  if (depth < 0) {
    if (permFromPerms(perms) === '-') { return []; }
    return Object.keys(data).filter(function(filename) {
      var childPerms = permsFromParent(data[filename].meta, user, perms);
      return permFromPerms(childPerms) !== '-';
    });
  } else {
    if (permFromPerms(perms) === '-') { return {}; }
    return listFiles(data, depth, user, perms);
  }
}

// files: map from file to {meta: {type, updated}, files}
// depth: number
// user: name, to check for permission
// perms: [user perm, others perm]
function listFiles(files, depth, user, perms) {
  var result = {};
  for (var key in files) {
    var meta = files[key].meta;
    var childPerms = permsFromParent(meta, user, perms);
    if (permFromPerms(childPerms) === '-') { continue; }
    result[key] = {meta: {type: meta.type, updated: meta.updated}};
    if (depth > 0) {
      result[key].files = listFiles(files[key].files,
        depth - 1, user, childPerms);
    }
  }
  return result;
}

function filePerms(path, user) {
  var parts = path.split('/');
  parts[0] = '/';
  return permsFromParts([], parts, user, [undefined, undefined]);
}

// Same as above, with promises as future-proofing for external use.
function permission(path, user) {
  return Promise.resolve(permFromPerms(filePerms(path, user)));
}

// prefixParts: eg. ['/', 'foo'] for /foo/bar
// parts: eg. ['bar'] for /foo/bar
// perms: [user perm, others perm]
function permsFromParts(prefixParts, parts, user, perms) {
  var part = parts.shift();
  if (part === undefined) { return perms; }
  prefixParts.push(part);
  var path = pathLib.join.apply(pathLib, prefixParts);
  var pathPerms = permsFromParent(fileMeta(path), user, perms);
  return permsFromParts(prefixParts, parts, user, pathPerms);
}

// meta: a file's metadata object.
// perms: [user perm, others perm] for the parent folder of the file.
// Returns a list [permission for user, permission for others].
function permsFromParent(meta, user, perms) {
  if (!meta.acl) { return perms;
  } else if (user === undefined) { return [undefined, meta.acl['*'] || perms[1]];
  } else if (meta.acl[user]) { return [meta.acl[user], perms[1]];
  } else { return [perms[0], meta.acl['*'] || perms[1]]; }
}

// Return a permission from [user perm, others perm].
function permFromPerms(perms) { return perms[0] || perms[1] || '-'; }

// Same as getStream(), but returns a Promise<Buffer>.
// options:
// - depth: 0 to include subfile metadata, 1 to include their subfiles and
//  metadata {type, updated}, etc.
function get(path, options) {
  return new Promise(function(resolve, reject) {
    var content = Buffer.alloc(0);
    var writer = new stream.Writable({
      write: function(chunk, encoding, callback) {
        content = Buffer.concat([content, chunk]);
        callback();
      },
    });
    writer.on('finish', function() { resolve(content); });
    writer.on('error', reject);
    getStream(path, options).then(function(stream) { stream.pipe(writer); })
    .catch(reject);
  });
}

// path: string, data: String or Buffer or Uint8Array.
// options:
//  - metadata: object containing metadata fields to set.
// Save the data. Return a Promise.
function put(path, data, options) {
  options = options || {};
  var metadataToSet = options.metadata || {};
  var realPath = realFromVirtual(path);
  return new Promise(function(resolve, reject) {
    fs.writeFile(realPath, data, function(err) {
      if (err) { reject(err); return; }
      meta(path)
      .then(function(metadata) {
        var now = new Date().toISOString();
        metadata.modified = now;
        for (var key in metadataToSet) {
          metadata[key] = metadataToSet[key];
        }
        updateMeta(path, metadata)
        .then(resolve)
        .catch(function(err) { resolve(); });  // Ignore the issue.
      })
      .catch(reject);
    })
  });
}

// JSON pointer to the {meta, files} object corresponding to path.
function fileNodePointer(path) {
  var list = (path === '/') ? [] : path.slice(1).split('/');
  var pointer = [];
  for (var i = 0; i < list.length; i++) {
    pointer.push('files', list[i]);
  }
  return pointer;
}

// Return the metadata for path.
function fileMeta(path) {
  var pointer = fileNodePointer(path);
  pointer.push('meta');
  return findPointer(pointer, metadata);
}

// Same as above, with promises as future-proofing for external use.
function meta(path) {
  return Promise.resolve(fileMeta(path));
}

// meta: JSON-serializable object.
function updateMeta(path, meta) {
  return new Promise(function(resolve, reject) {
    try {
      // We must simply ensure that it remains JSON-serializable.
      JSON.stringify(meta);
      var info = findPointer(fileNodePointer(path), metadata);
      var now = new Date().toISOString();
      meta.updated = now;
      // Atomic change, so that the metadata reads stay consistent.
      info.meta = meta;
      dirtyMetadata = true;
    } catch(e) { reject(e); }
    resolve();
  });
}

// Get the element pointed to by pointer in the path's metadata.
// options:
// - meta: if set, assume that the path's metadata is this.
// - or: list of JSON pointers to use if the search yields nothing.
function metaGet(pointer, path, options) {
  options = options || {};
  var metadata = options.meta;
  if (typeof pointer === 'string') { pointer = listFromJsonPointer(pointer); }
  var pointers = [pointer];
  if (options.or !== undefined) {
    options.or = options.or.map(function(pointer) {
      if (typeof pointer === 'string') {
        return listFromJsonPointer(pointer);
      } else { return pointer; }
    });
    var pointers = pointers.concat(options.or);
  }
  return new Promise(function(resolve, reject) {
    if (metadata !== undefined) {
      resolve(findFirstPointer(pointers, metadata));
    } else {
      meta(path)
      .then(function(metadata) { resolve(findFirstPointer(pointers, metadata)); })
      .catch(reject);
    }
  });
}

// Get the element pointed to by pointer in the path's metadata
// or its ancestry's.
// options:
// - meta: if set, assume that the path's metadata is this.
// - or: list of JSON pointers to use if the search yields nothing.
function metaFind(pointer, path, options) {
  options = options || {};
  if (typeof pointer === 'string') { pointer = listFromJsonPointer(pointer); }
  return new Promise(function(resolve, reject) {
    metaGet(pointer, path, options)
    .then(function(found) {
      if (found !== undefined) { resolve(found); }
      else if (path === '/') { resolve(undefined); }
      else {
        metaFind(pointer, pathLib.dirname(path), {or: options.or})
        .then(resolve)
        .catch(reject);
      }
    })
    .catch(reject);
  });
}

// options:
// - type: defaults to guessing the type.
// - content: data.
function create(path, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var realPath = realFromVirtual(path);
    if (options.type === 'folder') {
      fs.mkdir(realPath, function(err) {
        if (err != null) { reject(err); return; }
        appendToFolder(path, options.type).then(resolve).catch(reject);
      });
    } else {
      ((options.type === undefined) ?
        guessType(path) :
        Promise.resolve(options.type)
      ).then(function(type) {
        // Creating a raw binary file makes no sense; those are only uploaded.
        if (type === 'binary') { type = 'text'; }
        fs.writeFile(realPath, options.content || '', {flag: 'ax'},
        function(err) {
          if (err != null) { reject(err); return; }
          appendToFolder(path, type).then(resolve).catch(reject);
        });
      }).catch(reject);
    }
  });
}

function appendToFolder(path, type) {
  return new Promise(function(resolve, reject) {
    var parent = pathLib.dirname(path);
    var parentInfo = findPointer(fileNodePointer(parent), metadata);
    var filename = pathLib.basename(path);
    var now = new Date().toISOString();
    var newMetadata = { modified: now, updated: now };
    ((type === undefined) ? guessType(path) : Promise.resolve(type)
    ).then(function(type) {
      newMetadata.type = type;
      parentInfo.files = parentInfo.files || {};
      parentInfo.files[filename] = {meta: newMetadata};
      if (type === 'folder') {
        parentInfo.files[filename].files = {};
      }
      dirtyMetadata = true;
      resolve();
    }).catch(reject);
  });
}

function moveToFolder(sourceRealPath, path) {
  return new Promise(function(resolve, reject) {
    var realPath = realFromVirtual(path);
    fs.rename(sourceRealPath, realPath, function(err) {
      if (err != null) {
        var stream = fs.ReadStream(sourceRealPath);
        stream.on('end', function() {
          appendToFolder(path).then(resolve).catch(reject);
          fs.unlink(sourceRealPath, function(){});
        });
        stream.on('error', reject);
        stream.pipe(fs.WriteStream(realPath));
      } else {
        appendToFolder(path).then(resolve).catch(reject);
      }
    });
  });
}

function removeMeta(path) {
  return new Promise(function(resolve, reject) {
    var filename = pathLib.basename(path);
    var parent = pathLib.dirname(path);
    var parentInfo = findPointer(fileNodePointer(parent), metadata);
    if (parentInfo == null) {
      reject(new Error(`removeMeta: file ${path} not found`));
      return;
    }
    delete parentInfo.files[filename];
    dirtyMetadata = true;
    resolve();
  });
}

function remove(path) {
  return new Promise(function(resolve, reject) {
    var realPath = realFromVirtual(path);
    fs.stat(realPath, function(err, stats) {
      if (err != null) { reject(err); return; }

      var filename = pathLib.basename(path);
      var parent = pathLib.dirname(path);
      var parentInfo = findPointer(fileNodePointer(parent), metadata);

      if (stats.isFile()) {
        fs.unlink(realPath, function(err) {
          if (err != null) { reject(err); return; }
          delete parentInfo.files[filename];
          dirtyMetadata = true;
          resolve();
        });
      } else if (stats.isDirectory()) {
        fs.rmdir(realPath, function(err) {
          if (err != null) { reject(err); return; }
          delete parentInfo.files[filename];
          dirtyMetadata = true;
          resolve();
        });
      } else {
        reject(new Error('delete: unknown file type on disk'));
      }
    });
  });
}

var cwd = process.cwd();
var rootPath = pathLib.join(cwd, 'web');
function realFromVirtual(path) {
  // The following features several Windows hacks.
  if (/^[^\/]/.test(path)) { path = '/' + path; }
  var npath = pathLib.normalize(path
      .replace(/\\/g,'/').replace(/\/\//g,'/')).replace(/\\/g,'/');
  return pathLib.join(rootPath, npath);
}

// Return a plausible MIME type for the file, or 'binary', in a promise.
function guessType(path) {
  var ext = pathLib.extname(path).slice(1) || pathLib.basename(path);
  return new Promise(function(resolve, reject) {
    metaFind(['mime', ext], path)
    .then(function(mime) { resolve(mime || mimeTypes[ext] || 'binary'); })
    .catch(reject);
  });
};

// Return the first element found in json for a pointer.
function findFirstPointer(pointers, json) {
  for (var i = 0, len = pointers.length; i < len; i++) {
    var found = findPointer(pointers[i], json);
    if (found !== undefined) { return found; }
  }
}

// Return the element in json that is identified by pointer.
function findPointer(pointer, json) {
  pointer = pointer.slice();
  while (pointer.length > 0) {
    if (json === undefined) { return; }
    json = json[pointer.shift()];
  }
  return json;
};

// Return {meta, files}
function fileNode(path) {
  var pointer = fileNodePointer(path);
  return findPointer(pointer, metadata);
}

function cloneValue(v) {
  if (v == null || typeof v === 'boolean' || typeof v === 'number'
      || typeof v === 'string') {
    return v;
  } else if (Object(v) instanceof Array) {
    return v.slice().map(cloneValue);
  } else {
    return cloneObject(v);
  }
}

function cloneObject(obj) {
  var res = Object.create(null);
  for (var key in obj) {
    res[key] = cloneValue(obj[key]);
  }
  return res;
}

function streamFromData(data) {
  var newStream = new stream.Readable();
  newStream._read = function() { newStream.push(data); newStream.push(null); };
  return newStream;
}

exports.create = create;
exports.remove = remove;
exports.get = get;
exports.getStream = getStream;
exports.put = put;
exports.moveToFolder = moveToFolder;
exports.meta = meta;
exports.updateMeta = updateMeta;
exports.removeMeta = removeMeta;
exports.metaGet = metaGet;
exports.metaFind = metaFind;
exports.fileNodePointer = fileNodePointer;
exports.findPointer = findPointer;
exports.permission = permission;
exports.guessType = guessType;
exports.realFromVirtual = realFromVirtual;
exports.initAutosave = initAutosave;
