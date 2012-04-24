/* Plug application system.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var fs = require('./fs'),
    driver = require('./driver'),
    profiler = require('./profiler'),
    nodepath = require('path'),
    CodeMirrorServer = require('operational-transformation').CodeMirrorServer;


// We need Camp's socket.io object here. We get it at initialization.
var camp;

exports.main = function (server) { camp = server; };

// The plug system.

exports.resolve = function (query, path, endres, ask) {

  // Get the file/folder corresponding to the query
  ///console.log('PLUG:PLUG: what is %s?', path[1]);
  fs.file (path[1], function (err, file) {

    function end(err, plug, data) {
      if (err) console.error(err);
      if (!plug || plug === 'none') {
        path[0] = path[1];
        endres(data || {});
      } else {
        if (nodepath.extname(plug).length === 0) plug += '.html';
        path[0] = plug;
        endres(data || {});
      }
    }

    // If there was an error, abort!
    if (err) {
      ask.res.statusCode = 404;
      end(err, '404.html', {error: err.message});
      return;
    }

    // TODO If file requires a password and nothing matches, abort!


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
    data.file.mime = fs.type.nameFromType[file.meta.type];
    data.files = [];
    data.title = nodepath.basename(file.path) || 'The File Tree';

    // Profiler information.
    data.prof = profiler.data;

    // Navigation crumbs
    data.nav = [];
    var crumbs = path[1].split('/').filter(function(e) { 
      return e.length > 0;
    });
    var subpath = '/';
    data.nav.push({name: '', path: subpath});
    for ( var i = 0; i < crumbs.length; i++ ) {
      subpath += crumbs[i] + '/';
      data.nav.push({name: crumbs[i], path: subpath});
    }

    // Find a plug to use
    var plug = data.lookup('plug');

    if (plug === 'none') {
      end(); // no plug
      return;
    }

    if (file.isOfType('dir')) {

      // Delay callback, wait for subfiles
      delayed = true;

      // FIXME check for default "dir" plug instead
      plug = plug || 'gateway.html';

      // Handle missing final '/'
      // FIXME consider redirecting user to path[1] + '/' instead
      if ( path[1][path[1].length-1] !== '/' ) {
        path[1] += '/';
      }

      // Get subfiles
      file.files (function (err, files) {
        if (err)  console.error(err);
        for (var i = 0; i < files.length; i++) {
          var filepath = driver.normalize(files[i].path + (files[i].isOfType('dir') ? '/' : ''));
          data.files.push({name: nodepath.basename(filepath), path: filepath});
        }
        ///console.log('server:root: data sent from dir is', data);
        end(err, plug, data);
      });

    } else if (file.isOfType('text/plain')) {

      // Delay callback, wait for file content
      delayed = true;

      // TODO check for default "text/plain" plug instead
      plug = plug || 'pencil.html';

      // TODO open file to load content
      var channel = camp.io.of(file.path);
      file.open(function (err) {
        if (!channel.codeMirrorServer) {
          channel.on('connection', function (socket) {
            // Call this function after the server send the user information to
            // the new client, such that the user doesn't receive his own information
            process.nextTick(function () {
              channel.codeMirrorServer.setName(socket, +new Date());
            });
            socket.on('disconnect', function () {
              file.content = channel.codeMirrorServer.str;
              file.close(); // TODO close file when socket is killed.
            });
          });
          channel.codeMirrorServer = new CodeMirrorServer(
              file.content,
              channel,
              [],
              function (socket, cb) { cb(true); }
          );

          end(err, plug, data);
        } else {
          end(err, plug, data);
        }
      });

    } else if (file.isOfType('binary')) {

      // TODO check for default "binary" plug instead
      plug = plug || 'none';

    }

    if (!delayed) {
      //console.error('WAS NOT DELAYED');
      end(err, plug, data);
      return;
    }
  });
};

