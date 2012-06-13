/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIG
//

// Import modules
var Camp = require('camp'),
    camp = Camp.start({
      port: +process.argv[2],
      secure: process.argv[3] === 'yes',
      debug: +process.argv[4],
      key: 'https.key',
      cert: 'https.crt',
      ca: ['https.ca']
    }),
    driver = require('./lib/driver'),
    fs = require('./lib/fs'),
    irc = require('./lib/irc'),
    plug = require('./lib/plug'),
    profiler = require('./lib/profiler'),
    nodepath = require('path');

// Socket.io: silence will fall!
camp.io.configure('development', function () {
  camp.io.set('log level', 0);
  camp.io.set('browser client minification', true);
  camp.io.set('browser client gzip', true);
});

Camp.Plate.parsers['script'] = function (text) {
  return text.replace(/</g, '\\u003c');
};

// Init subroutines
plug.main(camp);


// ROUTING
//

camp.route(/\/(.*)/, plug.resolve);  // Redirect all URLs to corresponding plug.

// Profiler API.

camp.ajax.on('profiler', function (query, end) { end(profiler.run(query)); });


// File System API.

camp.ajax.on('fs', function (query, end) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  var data = {};
  switch (query['op']) {
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
            if (err) { data.err = err; return end(data); }
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
        if (err) { data.err = err; return end(data); }
        data.meta = file.meta;
        data.path = query.path;
        file.open (function (err, content) {
          if (err) { data.err = err; end(data); }
          data.content = (content == null ? file.content : content);
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
            data.path = nodepath.join(query.path, query.name);
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
      return;
  }
});


// Metadata API.

camp.ajax.on('meta-save', function (query, end) {
  console.log('meta-save', query.path, query.meta);
  fs.file(query.path, function (err, file) {
    if (err) {
      end({err:err});
    } else if (file) {
      file.meta = query.meta;
      file.writeMeta(function (err) { end({err:err}); });
    } else end({err:'File ' + query.path + ' is undefined.'});
  });
});


// IRC API.

camp.ajax.on('join', irc.join);
camp.ajax.on('say', irc.say);

