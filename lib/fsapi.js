// The file system API.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.


var fs = require('./fs');
var os = require('os');
var async = require('async');
var nodepath = require('path');
var pwdCheck = require('./pwd-check');
var publicFile = require('./public-file');


// FILE SYSTEM API
//

// read(1) - Read information about a file or folder, represented by a `path`.
// If `depth` is non-negative, read folder subfiles recursively.
// If it is zero, read file content.
// If non-positive or undefined, give information about the file.
//
// The `end` function gets either an object {files: []} which is a list of
// {path: …, meta: …}, or {err: 'message'}.
function read(file, depth, end) {
  var data = { files: [] }, depth = depth || 0;
  data.files.push({
    path: file.path,
    meta: publicFile.meta(file.meta)
  });
  // negative depth: return only file info, not content or subfiles
  if (depth < 0) { end(data); return; }
  if (file.meta.type !== 'dir') {
    // get the file's content
    file.open(function(err, content) {
      if (err) { data.err = err; end(data); return; }
      data.files[0].content = content;
      end(data);
    });
  } else {
    // get the folder's subfiles
    file.files(function (err, files) {
      if (err) { data.err = err; end(data); return; }
      var counter = files.length;
      if (counter <= 0) { end(data); return; }
      for (var i = 0; i < files.length; i++) {
        // only recurse on subfolders
        var subdepth = files[i].meta.type === 'dir' ? depth - 1 : -1;
        read(files[i], subdepth, function(d) {
          if (d.err) { data.err = d.err; }
          data.files.push.apply(data.files, d.files);
          counter--;
          if (counter <= 0) end(data);
        });
      }
    });
  }
}


// apply(1) - Apply a set of operations to a file's content.
// See Operational Transformation.
function apply(file, operations, end) {
  // TODO implement if needed.
}


// create(1) - Create a new file or folder, represented by a `path`.
// `type` is one of the types defined in lib/type.js.
// For instance, "dir", "file", or "binary".
function create(path, type, end) {
  console.log('creating', type, path);
  var data = {};
  var parent = nodepath.dirname(path);
  var name = nodepath.basename(path);
  fs.file(parent, function (err, dir) {
    if (err) {
      data.err = err;
      end(data);
      return;
    }
    dir.create(name, type, function (err) {
      if (err) { data.err = err; end(data); return; }
      data.path = path;
      end(data);
    });
  });
}


// delete(1) - Delete a file or folder, represented by a `path`.
function rm(file, writekey, end) {
  if (err) { end({err: err}); return; }
  pwdCheck(file, writekey, 'writekey', function checkedPwd(err) {
    if (err != null) {
      end({err: err});
      return;
    }
    file.rm(function (err) {
      if (err) { end({err: err}); return; }
      end({path: file.path});
    });
  });
}


function fsOperation(query, end) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  if (query.op == null) {
    end({err: 'An invalid request was sent to the file system.'});
    return;
  }
  if (query.path == null) {
    end({err: 'A request was sent to the file system, ' +
              'but did not specify the path.'});
    return;
  }
  var target = query.path;
  if (query.op === 'create') {
    target = nodepath.dirname(query.path);
  }
  fs.file(target, function(err, file) {
    if (err != null) { end({err:err}); return; }
    function checkedPwd(err) {
      if (err != null) {
        ask.res.statusCode = 401;
        ask.res.setHeader('WWW-Authenticate', 'Basic')
        end({err: err});
        return;
      }
      var data = {};
      switch (query.op) {
        case 'read': case 'cat': case 'ls':
          read(file, query.depth || 0, end);
          break;
        case 'create': case 'new':
          create(query.path, query.type, end);
          break;
        case 'delete': case 'rm':
          rm(file, query.writekey, end);
          break;
        default:
          end({err: 'Unknown file system operation ' + query.op + '.'});
          break;
      }
    }
    pwdCheck(file, query.readkey, 'readkey', checkedPwd);
  });
}

function metaSave(query, end) {
  console.log('meta-save', query.path, query.meta);
  if (query.meta == null) { end({err:new Error('No metadata to save.')}); }
  fs.file(query.path, function(err, file) {
    if (err) {
      return end({err:err});
    } else if (file) {
      // Password check.
      pwdCheck(file, query.metakey, 'metakey', function(err) {
        if (err == null) {
          // Check for change in password.
          if (query.meta.metakey && query.meta.metakey[0] === '[') {
            query.meta.metakey = ''+file.meta.metakey;
          }
          if (query.meta.writekey && query.meta.writekey[0] === '[') {
            query.meta.writekey = ''+file.meta.writekey;
          }
          if (query.meta.readkey && query.meta.readkey[0] === '[') {
            query.meta.readkey = ''+file.meta.readkey;
          }
          // Start writing.
          file.meta = query.meta;
          file.writeMeta(function(err) { end(!!err?{err:err}:{}); });
        } else {
          end({err:err});
        }
      });
    } else end({err:'File ' + query.path + ' is undefined.'});
  });
}

function upload(query, end, ask) {
  var form = ask.form;
  if (form.error) {
    end({err: form.error});
    return;
  }
  fs.file(query.path, function (err, parent) {
    if (err) {
      end({err: err});
      return;
    }
    async.map(form.openedFiles, function(file, cb) {
      parent.import(nodepath.basename(file.path), file.name, function () {
        var p = nodepath.join(query.path, file.name);
        console.log('uploaded', p);
        cb(null, p);
      });
    }, function(err, files) {
      end({files: files});
    });
  });
}

exports.read = read;
exports.apply = apply;
exports.create = create;
exports.rm = rm;
exports.fs = fsOperation;
exports.meta = metaSave;
exports.upload = upload;
