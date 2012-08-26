/* The file system API.
 * Copyright © 2012 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */


var fs = require('./fs'),
    nodepath = require('path');


/* read(1) - Read information about a file or folder, represented by a `path`.
 * If `depth` is non negative, read file content or folder subfiles
 * recursively.
 */
function read(path, depth, end) {
  var data = { files: [] }, depth = depth || 0;
  fs.file(path, function(err, file) {
    if (err) { data.err = err; end(data); return; }
    data.files.push({ path: file.path, date: +file.date, meta: file.meta });
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
          read(files[i].path, subdepth, function(d) {
            if (d.err) { data.err = d.err; }
            data.files.push.apply(data.files, d.files);
            counter--;
            if (counter <= 0) end(data);
}); } }); } }); };


/* apply(1) - Apply a set of operations to a file's content.
 * See Operational Transformation.
 */
function apply(path, operations, end) {
  // TODO implement if needed.
};


/* create(1) - Create a new file or folder, represented by a `path`.
 * If `type` is set to "dir", a folder will be created -- default is file.
 */
function create(path, type, end) {
  console.log('called create', arguments);
  var data = {}, parent = nodepath.dirname(path), name = nodepath.basename(path);;
  fs.file(parent, function (err, dir) {
    if (err) { data.err = err; end(data); return; }
    // file or folder?
    (type === "dir" ? dir.mkdir : dir.mkfile).call(dir, name, function (err) {
      if (err) { data.err = err; end(data); return; }
      data.path = path;
      end(data);
}); }); };


/* delete(1) - Delete a file or folder, represented by a `path`.
 */
function rm(path, end) {
  fs.file(path, function (err, file) {
    if (err) { end({err: err}); return; }
    file.rm(function (err) {
      if (err) { end({err: err}); return; }
      end({path: path});
}); }); };


exports.fs = function fsOperation(query, end) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  var data = {};
  switch (query.op) {
    case 'read': case 'cat': // case 'ls':
      read(query.path, query.depth || 0, end);
      return;
    case 'create': case 'new':
      create(query.path, query.type, end);
      return;
    case 'delete': case 'rm':
      rm(query.path, end);
      return;
    /** @deprecated FIXME */
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
    default:
      end({err: 'Unknown file system operation ' + query.op + '.'})
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
