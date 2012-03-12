/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIG
//

// Location of the root. If this is "/root", the fake root
// will be at "http://example.com/root/".
var ROOT_PREFIX = '/root';

// Import modules
var camp = require ('./camp/camp'),
    ftree = require ('./lib/fs'),
    sync = require ('./lib/sync'),
    plug = require ('./lib/plug'),
    prof = require ('./lib/profiler'),
    nodepath = require ('path');

// Init subroutines
sync.main();
prof.main();


// ROUTING
//

// Redirection of `https://<DNS>/root/something`
// to look for `/root/something` in the File System.
camp.route (new RegExp(ROOT_PREFIX + '/(.*)'), function (query, path) {

  // FIXME HACK for Camp to set `text/html` mime type before this function returns
  path[0] = 'a.html';

  plug.plug (query, path, function (err, plugpath, data) {
    if (err) console.error(err);
    path[0] = plugpath;
    camp.emit ('fsplugged', data);
  });

}, function fsplugged(data) {
  ///console.log('$FSPLUGGED: sending data',data);
  return data;
});



// AJAX FS API

camp.addDefer ('fs', function (query) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  var data = {};
  if (query.path) query.path = query.path.slice(ROOT_PREFIX.length);
  switch (query['op']) {
    case 'ls':
      ftree.file (query.path, function (err, dir) {
        if (err) {
          data.err = err;
          camp.emit('fs', data); return;
        }
        // ls -r
        if (query.depth && query.depth > 1) {
          dir.subfiles(function(err, subfiles) {
            data.leafs = subfiles;
            camp.emit('fs', data);
          }, query.depth);
        // ls .
        } else {
          dir.files (function (err, files) {
            if (err) { data.err = err; camp.emit('fs', data); return; }
            data.files = [];
            for (var i = 0; i < files.length; i++) {
              data.files.push({
                name: files[i],
                type: ftree.type.nameFromType[files[i].type]
              });
            }
            camp.emit ('fs', data);
          });
        }
      });
      break;
    case 'cat':
      ftree.file (query.path, function (err, file) {
        if (err) { data.err = err; camp.emit('fs', data); return; }
        data.type = file.type;  // eg, 'text/html'
        data.name = nodepath.basename(query.path);
        file.open (function (err) {
          if (err) { data.err = err; camp.emit('fs', data); return; }
          data.content = content;
          camp.emit ('fs', data);
        });
      });
      break;
    case 'create':
      console.log('trying to create',query.type,'named',query.name,'in',query.path);
      ftree.file (query.path, function(err, file) {
        // file or folder?
        if (err !== null) {
          console.error('server: file %s asked for. %s', query.path, err);
          camp.emit('fs', {err:err});
          return;
        }
        (query.type === "folder"? file.mkdir: file.mkfile).bind(file)
          (query.name, function(err) {
            data.err = err;
            data.path = ROOT_PREFIX + nodepath.join(query.path, query.name);
            camp.emit('fs', data);
        });
      });
      break;
    case 'rm':
      ftree.file (query.path, function(err, file) {
        file.rm(function (err) {
          data.err = err;
          camp.emit('fs', data);
        });
      });
      break;
    default:
      return;
  }
}, function(data) {
  return data || {};
});


// A little chat demo
camp.add('talk', function(data) { camp.emit('chat', data); });
camp.addDefer('chat', function() {}, function(data) { return data; });


// Read options from `argv`
var options = {
  port: +process.argv[2],
  debug: +process.argv[4],
  secure: process.argv[3] === 'yes',
};

// Let's rock'n'roll!
camp.start (options);

console.log('tree is live! ' + ( options.secure === 'yes' ? 'https' : 'http' )
    + '://localhost' + ( options.port !== 80 ? ':' + options.port : '' ) + '/');


