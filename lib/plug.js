/* Plug application system.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */


var ftree = require('./fs'),
    nodepath = require ('path');

var ROOT_PREFIX = '/root'; // FIXME this should go away soon...


// * LE WILD PLUG APPEARS
//
exports.plug = function (query, path, cb) { 

  // Get the file/folder corresponding to the query
  ///console.log('SERVER:ROOT: what is %s?', path[1]);
  ftree.file (path[1], function (err, file) {

    // If there was an error, abort!
    if (err) {
      // TODO change HTTP return code to 404 instead of 200
      cb(err, '/404.html', {error: err.message});
      return;
    }

    // TODO If file requires a password and nothing matches, abort!

    // TODO If specifically asked for, send the untemplated raw file


    // PLUG MECHANISM

    var data = {}, delayed = false;

    // Environment variable lookup mechanism
    data.lookup = function(key) {
      // from most specific (url?key=value) to most generic (inherited metadata)
      if (query[key]) return query[key];
      if (file.meta[key]) return file.meta[key];
      return null;
    };

    // File info
    data.file = file;
    data.file.mime = ftree.type.nameFromType[file.meta.type];
    data.files = [];
    data.title = nodepath.basename(file.path) || 'The File Tree';

    // Navigation crumbs
    data.nav = [];
    var crumbs = path[1].split('/').filter(function(e) { 
      return e.length > 0;
    });
    var subpath = ROOT_PREFIX + '/';
    for ( var i = 0; i < crumbs.length; i++ ) {
      subpath += crumbs[i] + '/';
      data.nav.push({name: crumbs[i], path: subpath});
    }

    // Find a plug to use
    var plug = data.lookup('plug');
    
    if (file.isOfType('dir')) {

      // FIXME check for default FOLDER plug instead
      plug = plug || '/gateway.html';

      // Handle missing final '/'
      // FIXME consider redirecting user to path[1] + '/' instead
      if ( path[1][path[1].length-1] !== '/' ) {
        path[1] += '/'; data.path += '/';
      }

      // Delay callback, wait for subfiles
      delayed = true;

      // Get subfiles
      file.files (function (err, files) {
        if (err)  console.error(err);
        for (var i = 0; i < files.length; i++) {
          var filepath = ROOT_PREFIX + files[i].path + (files[i].isOfType('dir') ? '/' : '');
          data.files.push({name: nodepath.basename(filepath), path: filepath});
        }
        ///console.log('server:root: data sent from dir is', data);
        cb(null, plug, data);
      });

    } else if (file.isOfType('text/plain')) {

      // TODO check for default TEXT plug instead

    } else if (file.isOfType('binary')) {

      // TODO check for default BINARY plug instead

    }

    if (!delayed) {
      if (!plug) plug = '/pencil.html'; // FIXME no plug found, send raw
      console.log('PLUG:',plug);
      cb(null, plug, data);
    }

  });

};

