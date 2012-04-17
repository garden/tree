/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIG
//

// Import modules
var camp = require('camp').start({
      port: +process.argv[2],
      secure: process.argv[3] === 'yes',
      debug: +process.argv[4],
      key: 'https.key',
      cert: 'https.crt',
      ca: ['https.ca']
    }),
    ftree = require('./lib/fs'),
    sync = require('./lib/sync'),
    plug = require('./lib/plug'),
    prof = require('./lib/profiler'),
    driver = require('./lib/driver'),
    nodepath = require('path');


// Init subroutines
sync.main(camp);
prof.main(camp);
plug.main(camp);


// ROUTING
//

camp.route(/\/(.*)/, plug.resolve);  // Redirect all URLs to corresponding plug.



// AJAX FS API

camp.ajax.on ('fs', function (query, end) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  var data = {};
  switch (query['op']) {
    case 'ls':
      ftree.file (query.path, function (err, dir) {
        if (err) {
          data.err = err;
          return end(data);
        }
        // ls -r
        if (query.depth && query.depth > 1) {
          dir.subfiles(function(err, subfiles) {
            data.leafs = subfiles;
            end(data);
          }, query.depth);
        // ls .
        } else {
          dir.files (function (err, files) {
            if (err) { data.err = err; return end(data); }
            data.files = [];
            for (var i = 0; i < files.length; i++) {
              data.files.push({
                name: files[i],
                type: ftree.type.nameFromType[files[i].type]
              });
            }
            end(data);
          });
        }
      });
      break;
    case 'cat':
      ftree.file (query.path, function (err, file) {
        if (err) { data.err = err; end(data); }
        data.type = file.type;  // eg, 'text/html'
        data.name = nodepath.basename(query.path);
        file.open (function (err) {
          if (err) { data.err = err; end(data); }
          data.content = content;
          end(data);
        });
      });
      break;
    case 'create':
      ftree.file (query.path, function(err, file) {
        // file or folder?
        if (err !== null) {
          console.error('server: file %s asked for. %s', query.path, err);
          end({err:err});
          return;
        }
        (query.type === "folder"? file.mkdir: file.mkfile).bind(file)
          (query.name, function(err) {
            data.err = err;
            data.path = nodepath.join(query.path, query.name);
            end(data);
        });
      });
      break;
    case 'rm':
      ftree.file (query.path, function(err, file) {
        file.rm(function (err) {
          data.err = err;
          end(data);
        });
      });
      break;
    default:
      return;
  }
});




