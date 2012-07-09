/* Plug application system.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var fs = require('./fs'),
    driver = require('./driver'),
    nodepath = require('path');


// We need Camp's socket.io object here. We get it at initialization.
var camp;

exports.main = function (server) { camp = server; };

// The plug system.

exports.resolve = function (query, path, endres, ask) {

  // Get the file/folder corresponding to the query.
  ///console.log('PLUG: what is %s?', path[1]);
  fs.file (path[1], function (err, file) {

    function sendraw() {
      path[0] = path[1];
      endres(); // bypass template engine
      console.log('ending', path[0]);
    }

    function end(err, plug, data) {
      if (err) {
        console.error(err);
        path[0] = '/404.html';
        endres();
        return;
      }
      if (!plug || plug === 'none')
        sendraw();
      else {
        if (nodepath.extname(plug).length === 0) plug += '.html';
        fs.file(plug, function(err, file) {
          // TODO template with file.content instead of giving plug path.
          if (err) sendraw();
          else {
            path[0] = plug;
            endres(data || {});
          }
        });
      }
    }

    // If there was an error, abort!
    if (err) {
      ask.res.statusCode = 404;
      end(err, '404.html', {error: err.message});
      return;
    }

    // TODO If file requires a password and nothing matches, abort!

    // set HTTP header Last-Modified
    if (file.date)
      ask.res.setHeader('Last-Modified', file.date.toGMTString());

    // PLUG MECHANISM

    var data = {}, delayed = false;

    // Environment variable lookup mechanism.

    function getMeta(obj, jsonquery) {
      // Read the key from the query.
      var ikey = jsonquery.indexOf('/'),
          key;
      if (ikey > 0) {
        key = jsonquery.slice(0, ikey);
      } else {
        key = jsonquery;
      }
      if (typeof obj === 'object' && obj[key]) {
        if (ikey > 0) {
          return getMeta(obj[key], key.slice(ikey + 1));
        } else {
          return obj[key];
        }
      }
    }

    function recurseMeta(file, key) {
      var got;
      if (got = getMeta(file.meta, key)) {
        return got;
      } else if (file.path.length === 1) {
        // We are at the root, cannot go further up.
        return null;
      } else {
        fs.file(nodepath.dirname(file.path), function (err, parent) {
          if (err) {
            console.error(err.stack);
          } else return recurseMeta(parent, key);
        });
      }
    }

    data.lookup = function(key) {
      // From most specific (url?key=value) to most generic (inherited metadata)
      if (query[key]) return query[key];
      else {
        var found = recurseMeta(file, key);
        return found === undefined? null: found;
      }
    };

    // File info.
    data.file = file;
    data.file.mime = file.meta.type;
    data.files = [];
    data.title = nodepath.basename(file.path) || 'The File Tree';
    data.extname = nodepath.extname(file.path).slice(1);

    // Navigation crumbs
    data.nav = [];
    var crumbs = path[1].split('/').filter(function(e) {
      return e.length > 0;
    });
    var subpath = '/';
    data.nav.push({name: '/', path: subpath});
    for ( var i = 0; i < crumbs.length; i++ ) {
      crumbs[i] += (i < crumbs.length - 1 || file.isOfType('dir') ? '/' : '');
      subpath += crumbs[i];
      data.nav.push({name: crumbs[i], path: subpath});
    }

    // Find a plug to use.
    var plug = data.lookup('plug');

    if (plug === 'none') {
      end(); // no plug
      return;
    }

    if (file.isOfType('dir')) {

      // Delay callback, wait for subfiles.
      delayed = true;

      // FIXME check for default "dir" plug instead.
      plug = plug || 'gateway.html';

      // Handle missing final '/'.
      // FIXME consider redirecting user to path[1] + '/' instead.
      if (path[1][path[1].length-1] !== '/') {
        path[1] += '/';
      }

      // Get subfiles.
      file.files (function (err, files) {
        if (err)  console.error(err);
        for (var i = 0; i < files.length; i++) {
          var filepath = driver.normalize(
            files[i].path + (files[i].isOfType('dir') ? '/' : ''));
          data.files.push({name: nodepath.basename(filepath), path: filepath});
        }
        ///console.log('server:root: data sent from dir is', data);
        end(err, plug, data);
      });

    } else if (file.isOfType('text/plain')) {

      // Delay callback, wait for file content.
      delayed = true;

      // TODO check for default "text/plain" plug instead.
      plug = plug || 'pencil.html';

      file.ot(camp.io, function(err) { end(err, plug, data); });

    } else if (file.isOfType('binary')) {

      // TODO check for default "binary" plug instead.
      plug = plug || 'none';
    }

    if (!delayed) {
      end(err, plug, data);
      return;
    }
  });
};

