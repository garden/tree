/* Plug application system.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */


var ftree = require('./fs'),
    nodepath = require ('path');

// FIXME This should go away soon
var ROOT_PREFIX = '/root';

// * LE WILD PLUG APPEARS
//

exports.plug = function (query, path, cb) { 

  // Default values
  var plug = '/pencil.html',
      data = {path: path[1]};

  // Get the file/folder corresponding to the query
  ///console.log('SERVER:ROOT: what is %s?', path[1]);
  ftree.file (path[1], function (err, file) {

    // Template value lookup mechanism
    // from most specific (url?key=value) to most generic (inherited metadata)
    data.lookup = function(key) {
      if (query[key]) return query[key];
      if (file.meta[key]) return file.meta[key];
      return null;
    };

    // If there was an error, abort!
    if (err) {
      data.error = err.message;
      // TODO change HTTP return code to 404 instead of 200
      cb(err, '/404.html', data);
    }

    // TODO Check password, if there is a problem, abort!

    // TODO If specifically asked for, send the untemplated raw file

    // It's a text file
    else if (file.isOfType('text/plain')) {
      plug = '/pencil.html';
      data.mime = ftree.type.nameFromType[file.meta.type];
      // The file name will become the title.
      data.filename = nodepath.basename(file.path);
      // TODO benchmark if following line really optimizes display speed
      data.content = file.content;
      cb(null, plug, data);
    }
    
    // It's a folder
    else if (file.isOfType('dir')) {
      plug = '/gateway.html';
      if ( path[1][path[1].length-1] !== '/' ) {
        // FIXME consider redirecting user to path[1] + '/' instead
        path[1] += '/'; data.path += '/';
      }
      data.nav = [];
      var crumbs = path[1].split('/').filter(function(e) { 
        return e.length > 0;
      });
      var subpath = ROOT_PREFIX + '/';
      for ( var i = 0; i < crumbs.length; i++ ) {
        subpath += crumbs[i] + '/';
        data.nav.push({name: crumbs[i], path: subpath});
      }
      data.dirname = nodepath.basename(file.path) || 'The File Tree';
      file.files (function (err, files) {
        if (err)  console.error(err);
        data.files = [];
        for (var i = 0; i < files.length; i++) {
          var filepath = ROOT_PREFIX + files[i].path + (files[i].isOfType('dir') ? '/' : '');
          data.files.push({name: nodepath.basename(filepath), path: filepath});
        }
        ///console.log('server:root: data sent from dir is', data);
        cb(null, plug, data);
      });
    }

    // It's a binary file
    else if (file.isOfType('binary')) {
      cb('BINARY FILE', plug, data);
    }

    // It's an alien from outer space
    else {
      cb('INVADE EARTH', plug, data);
    }

  });

};
