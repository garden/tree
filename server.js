/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIGURATION
//

// Location of the root. If this is "/root", the fake root
// will be at "http://example.com/root/".
var ROOT_PREFIX = '/root',
    profiles = {
      'File system': true
    };

// Import modules
var camp = require ('./camp/camp'),
    arbor = require ('./lib/fs'),
    sync = require ('./lib/sync'),
    prof = require ('./lib/profiler'),
    nodepath = require ('path');


sync.main();

if (profiles)  prof.main(profiles);

// FILE-SYSTEM ACCESS
//

// Redirection of `http://<DNS>.tld/root/something`
// to look for `/root/something`.
camp.handle (new RegExp(ROOT_PREFIX + '/(.*)'), function (query, path) {

  // Default plug
  path[0] = '/pencil.html';

  // Template data
  var data = {path:path[1]};

  // TODO: in the future, this will be the #plug system.
  // If they want a directory, load gateway.
  ///console.log('SERVER:ROOT: what is %s?', path[1]);
  arbor.getfile (path[1], function (err, file) {
    if (err) {
      console.error(err);
      data.error = err.message;
      camp.Server.emit ('fsplugged', data);
    }
    if (arbor.isoftype(file, 'text/plain')) {
      path[0] = '/pencil.html';
      var mime = arbor.typenamefromtype[file.type];
      data.mime = mime;
      var util = require('util');
      camp.Server.emit ('fsplugged', data);

    } else if (arbor.isoftype(file, 'dir')) {
      ///console.log('SERVER:ROOT: %s is a dir', file);
      path[0] = '/gateway.html';
      data.nav = path[1].split('/').filter(function(e){return e.length > 0;});
      file.content (function (err, content) {
        if (err) console.error(err);
        data.filenames = [];
        for (var file in content) {
          if (arbor.isoftype(content[file],'dir')) file += '/';
          data.filenames.push(file);
        }
        ///console.log('SERVER:ROOT: data sent from dir is', data);
        camp.Server.emit('fsplugged', data);
      });
    }
  });

}, function fsplugged(data) {
  return data;
});


var root;
arbor.getroot (function (err, fsroot) {
  root = fsroot;
});

// Ajax FS API.

camp.add ('fs', function (query) {
  var data = {};
  console.log('SERVER:FS: got query.path', query.path);
  if (query.path) query.path = query.path.slice(ROOT_PREFIX.length);
  switch (query['op']) {
    case 'ls':
      ///console.log('SERVER:FS: doing some ls');
      arbor.getfile (query['path'], function (err, dir) {
        ///console.log('SERVER:FS: got ' + query.path + ' content');
        if (err) { data.err = err;
          ///console.log('SERVER:FS: data sent from dir is', data);
          camp.Server.emit('fs', data); return; }
        dir.content (function (err, content) {
          if (err) { data.err = err; camp.Server.emit('fs', data); return; }
          data.files = [];
          for (var file in content) {
            var filedata = {name:file,
                type:arbor.typenamefromtype[content[file].type]};
            data.files.push(filedata);
          }
          ///console.log('SERVER:FS: data sent from dir is', data);
          camp.Server.emit ('fs', data);
        });
      });
      break;
    case 'cat':
      arbor.getfile (query['path'], function (err, file) {
        if (err) { data.err = err; camp.Server.emit('fs', data); return; }
        data.type = file.type;  // eg, 'text/html'
        data.name = nodepath.basename(query.path);
        file.content (function (err, content) {
          if (err) { data.err = err; camp.Server.emit('fs', data); return; }
          data.content = content;
          camp.Server.emit ('fs', data);
        });
      });
    case 'touch':
      //create file
    case 'rm':
      //delete file
    case 'cp':
      //copy file
    default:
      return {};
  }
}, function fs(data) {
  return data || {};
});


// Chat
camp.add('talk', function(data) { camp.Server.emit('incoming', data); });
camp.add('chat', function() {}, function incoming(data) { return data; });


// Options
var options = {
  port: +process.argv[2],
  secure: process.argv[3],
  debug: +process.argv[4]
}

// Let's rock'n'roll!
camp.start (options);

console.log('tree is live! ' + ( options.secure === 'yes' ? 'https' : 'http' )
    + '://localhost' + ( options.port !== 80 ? ':' + options.port : '' ) + '/');


