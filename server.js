/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIGURATION
//

// Location of the root. If this is "/root", the fake root
// will be at "http://example.com/root/".
var ROOT_PREFIX = '/root';

// Import modules
var camp = require ('./camp/camp'),
    ftree = require ('./lib/fs'),
    sync = require ('./lib/sync'),
    prof = require ('./lib/profiler'),
    nodepath = require ('path');


sync.main();

prof.main();

// FILE-SYSTEM ACCESS
//

// Redirection of `http://<DNS>.tld/root/something`
// to look for `/root/something`.
camp.route (new RegExp(ROOT_PREFIX + '/(.*)'), function (query, path) {

  // Default plug
  path[0] = '/pencil.html';

  // Template data
  var data = {path:path[1]};

  // TODO: in the future, this will be the #plug system.
  // If they want a directory, load gateway.
  ///console.log('SERVER:ROOT: what is %s?', path[1]);
  ftree.file (path[1], function (err, file) {
    if (err) {
      console.error(err);
      data.error = err.message;
      // TODO change HTTP return code to 404 instead of 200
      path[0] = '/404.html';
      camp.emit ('fsplugged', data);
      return;
    }
    if (file.isOfType('text/plain')) {
      path[0] = '/pencil.html';
      data.mime = ftree.type.nameFromType[file.meta.type];
      // The dirname will become the title.
      data.dirname = nodepath.basename(file.path);
      camp.emit ('fsplugged', data);

    } else if (file.isOfType('dir')) {
      path[0] = '/gateway.html';
      // FIXME when viewing https://thefiletree.com/dir1/dir2, links go from
      //       dir1 instead of dir2 (because of the missing /)
      if ( path[1][path[1].length-1] !== '/' ) {
        path[1] += '/';
        data.path += '/';
      }
      data.nav = path[1].split('/').filter(function(e){return e.length > 0;});
      data.dirname = file.name || 'The File Tree';
      file.files (function (err, files) {
        if (err)  console.error(err);
        data.filenames = [];
        for (var i = 0; i < files.length; i++) {
          data.filenames.push(nodepath.basename(files[i].path) +
            (files[i].isOfType('dir')? '/': ''));
        }
        ///console.log('server:root: data sent from dir is', data);
        camp.emit('fsplugged', data);
      });
    }
  });

}, function fsplugged(data) {
  ///console.log('$FSPLUGGED: sending data',data);
  return data;
});



// Ajax FS API.

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


// Chat
camp.add('talk', function(data) { camp.emit('chat', data); });
camp.addDefer('chat', function() {}, function(data) { return data; });


// Options
var options = {
  port: +process.argv[2],
  debug: +process.argv[4],
  secure: process.argv[3] === 'yes',
};

// Let's rock'n'roll!
camp.start (options);

console.log('tree is live! ' + ( options.secure === 'yes' ? 'https' : 'http' )
    + '://localhost' + ( options.port !== 80 ? ':' + options.port : '' ) + '/');


