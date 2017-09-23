// The file system API.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.


var fs = require('./fs');
var log = require('./log');
var os = require('os');
var async = require('async');
var nodepath = require('path');
var pwdCheck = require('./pwd-check');
var publicFile = require('./public-file');
var sandboxShell = require('./sandbox-shell');


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
  log('creating', type, path);
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


function fsOperation(query, end, ask) {
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
  fs.file(target, function fsOpFileGot(err, file) {
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
    pwdCheck(file, query.readkey || ask.password, 'readkey', checkedPwd);
  });
}

function metaSave(query, end) {
  log('meta-save', query.path, query.meta);
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
        log('uploaded', p);
        cb(null, p);
      });
    }, function(err, files) {
      end({files: files});
    });
  });
}


// Return a list of files with readkeys as a callback,
// given a directory rooted at the file tree.
function readkeyFiles(directory, cb) {
  fs.file(directory, function(err, f) {
    if (err != null) { cb(err); return; }
    f.subfiles(function(err, leaves) {
      if (err != null) { cb(err); return; }

      // Sends true to the callback if the file f has a readkey.
      var hasReadkey = function(leaf, cb) {
        var fileName = nodepath.join(directory, leaf);
        fs.file(fileName, function(err, f) {
          if (err != null || !f || !f.meta) { cb(null, false); return; }
          cb(null, !!f.meta.readkey);
        });
      };

      // Filter only those leaves that have a readkey.
      async.filter(leaves, hasReadkey, cb);
    });
  });
}

function sendShellCommand(query, end, rmFiles) {
  var directory = query.dir;
  var cmd = query.cmd;
  // We need to translate input from the string representation to its
  // buffer representation.
  var stdinBuffer;
  if (query.stdin != null) {
    if (typeof query.stdin === 'string') {
      stdinBuffer = new Buffer(query.stdin, 'utf-8');
    } else {
      // It is an object. It has a type.
      if (query.stdin.type == null || query.stdin.value == null) {
        return end({err: new Error('Incorrect shell parameters')});
      }
      stdinBuffer = new Buffer(query.stdin, 'base64');
    }
  }

  var fileOutput = query.fileOutput;
  if (Object(fileOutput) instanceof String) {
    fileOutput = [fileOutput];
  }

  var stdoutBuffer = '', stderrBuffer = '';
  sandboxShell.runOnDirectory(directory, cmd, {
    stdin: stdinBuffer,
    stdout: function(data) { stdoutBuffer += ''+data; },
    stderr: function(data) { stderrBuffer += ''+data; },
    rmFiles: rmFiles,
    fileOutput: fileOutput,
  }, function(err) {
    return end({
      stdout: stdoutBuffer,
      stderr: stderrBuffer,
      err: err? (''+err): undefined
    });
  });
}

// Run data in the sandbox shell.
// Each I/O is either a string an object:
// - type: "base64"
// - value: the base64 string of the binary content.
// Ajax input:
// - stdin: textual data to provide to the shell.
// - dir: directory from which to run the shell command.
// - cmd: shell command to run.
// - fileOutput: list of files (potentially output from the shell) to
//   copy back to the file tree.
// Ajax output:
// - stdout: data returned from the shell.
// - stderr: error stream.
function shell(query, end, ask) {
  if (query.dir == null || query.cmd == null) {
    return end({err: new Error('Directory or command missing')});
  }
  // We should only copy files and directories that have no readkey.
  // Note that readkeys (should) require encryption, which means that
  // copying them doesn't give read access to them.
  // FIXME: check readkey and allow matching readkey files.
  readkeyFiles(query.dir, function(rmFiles){
    sendShellCommand(query, end, rmFiles);
  });
}

exports.read = read;
exports.apply = apply;
exports.create = create;
exports.rm = rm;
exports.fs = fsOperation;
exports.meta = metaSave;
exports.upload = upload;
exports.shell = shell;
