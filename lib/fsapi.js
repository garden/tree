/* Ajax hooks to the file system.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var fs = require('./fs'),
    path = require('path');

exports.fs = function fsOperation(query, end) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  var data = {};
  switch (query.op) {
    case 'ls':
      fs.file(query.path, function (err, dir) {
        if (err) {
          data.err = err;
          return end(data);
        }
        // ls -r
        if (query.depth && query.depth > 1) {
          dir.subfiles(function (err, subfiles) {
            data.leafs = subfiles;
            end(data);
          }, query.depth);
        // ls .
        } else {
          dir.files(function (err, files) {
            if (err) { data.err = err; end(data); return; }
            data.files = [];
            for (var i = 0; i < files.length; i++) {
              data.files.push({
                name: files[i],
                type: fs.type.nameFromType[files[i].type]
              });
            }
            end(data);
          });
        }
      });
      break;
    case 'cat':
      fs.file(query.path, function (err, file) {
        if (err) { data.err = err; end(data); return; }
        data.meta = file.meta;
        data.path = query.path;
        file.open (function (err, content) {
          if (err) { data.err = err; end(data); }
          data.content = file.content;
          end(data);
        });
      });
      break;
    case 'create':
      fs.file(query.path, function (err, file) {
        // file or folder?
        if (err !== null) {
          console.error('server: file %s asked for. %s', query.path, err);
          end({err:err});
          return;
        }
        (query.type === "folder"? file.mkdir: file.mkfile).bind(file)
          (query.name, function (err) {
            data.err = err;
            data.path = path.join(query.path, query.name);
            end(data);
        });
      });
      break;
    case 'rm':
      fs.file(query.path, function (err, file) {
        file.rm(function (err) {
          data.err = err;
          end(data);
        });
      });
      break;
    default:
      end({err: 'Unknown File System Operation.'})
      return;
  }
}

exports.meta = function metaSave(query, end) {
  console.log('meta-save', query.path, query.meta);
  fs.file(query.path, function(err, file) {
    if (err) {
      end({err:err});
    } else if (file) {
      file.meta = query.meta;
      file.writeMeta(function(err) { end({err:err}); });
    } else end({err:'File ' + query.path + ' is undefined.'});
  });
};
