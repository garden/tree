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
    arbor = require ('./lib/fs'),
    sync = require ('./lib/sync'),
    prof = require ('./lib/profiler'),
    nodepath = require ('path');


sync.main();

prof.main();

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
      path[0] = '/404.html';
      camp.server.emit ('fsplugged', data);
      return;
    }
    if (file.isOfType('text/plain')) {
      path[0] = '/pencil.html';
      data.dirname = file.name;  // This will become the title.
      var mime = arbor.type.nameFromType(file.type);
      data.mime = mime;
      var util = require('util');
      camp.server.emit ('fsplugged', data);

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
      file.content (function (err, content) {
        if (err)  console.error(err);
        data.filenames = [];
        for (var file in content) {
          if (content[file].isOfType('dir'))  file += '/';
          data.filenames.push(file);
        }
        ///console.log('SERVER:ROOT: data sent from dir is', data);
        camp.server.emit('fsplugged', data);
      });
    }
  });

}, function fsplugged(data) {
  return data;
});


var root = arbor.root;

// Ajax FS API.

camp.addDiffer ('fs', function (query) {
  // `query` must have an `op` field, which is a String.
  // It must also have a `path` field, which is a String.
  var data = {};
  //console.log('SERVER:FS: got query', query);
  if (query.path) query.path = query.path.slice(ROOT_PREFIX.length);
  switch (query['op']) {
    case 'ls':
      ///console.log('SERVER:FS: doing some ls');
      arbor.getfile (query['path'], function (err, dir) {
        ///console.log('SERVER:FS: got ' + query.path + ' content');
        if (err) {
          data.err = err;
          ///console.log('SERVER:FS: data sent from dir is', data);
          camp.server.emit('fs', data); return;
        }
        if (query['depth'] && query['depth'] > 1) {
          dir.subfiles(function(err, subfiles) {
            data.leafs = subfiles;
            camp.server.emit('fs', data);
          }, query['depth']);
        } else {
          dir.content (function (err, content) {
            if (err) { data.err = err; camp.server.emit('fs', data); return; }
            data.files = [];
            for (var file in content) {
              var filedata = {
                name: file,
                type: arbor.type.fromName(content[file].type)
              };
              data.files.push(filedata);
            }
            ///console.log('SERVER:FS: data sent from dir is', data);
            camp.server.emit ('fs', data);
          });
        }
      });
      break;
    case 'cat':
      arbor.getfile (query['path'], function (err, file) {
        if (err) { data.err = err; camp.server.emit('fs', data); return; }
        data.type = file.type;  // eg, 'text/html'
        data.name = nodepath.basename(query.path);
        file.content (function (err, content) {
          if (err) { data.err = err; camp.server.emit('fs', data); return; }
          data.content = content;
          camp.server.emit ('fs', data);
        });
      });
      break;
    case 'create':
      console.log('TODO create',query['type'],query['path']);
      break;
    case 'rm':
      console.log('TODO delete',query['path']);
      break;
    case 'cp':
      console.log('TODO copy',query['path'],'to',query['to']);
      break;
    default:
      return;
  }
}, function(data) {
  return data || {};
});


// Chat
camp.add('talk', function(data) { camp.server.emit('chat', data); });
camp.addDiffer('chat', function() {}, function(data) { return data; });


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


