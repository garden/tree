// Plug application system.
// Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
// The following code is covered by the GPLv2 license.

var fs = require('./fs');
var driver = require('./driver');
var nodepath = require('path');
var lookup = require('./lookup');


// We need Camp's socket.io object here. We get it at initialization.
var camp;

exports.main = function (server) { camp = server; };

// The plug system.

exports.resolve = function (query, path, endres, ask) {

  // Get the file/folder corresponding to the query.
  ///console.log('PLUG: what is %s?', path[1]);
  path[1] = path[1];
  fs.file (path[1], function (err, file) {

    function sendraw(data) {
      console.log('send', path[1]);
      if (data && data.content) {
        ask.res.end(data.content);
      } else {
        path[0] = path[1];
        // Save to disk to provide the up-to-date content.
        // Then, bypass the template engine.
        // FIXME: allow sc's router to read from any stream.
        file.write(function(err) { endres(); });
      }
    }

    function end(err, plug, data) {
      if (err) {
        console.error(err);
        path[0] = '/404.html';
        endres();
        return;
      }
      if (!plug || plug === 'none')
        sendraw(data);
      else {
        if (nodepath.extname(plug).length === 0) plug += '.html';
        fs.file(plug, function(err, file) {
          // TODO template with file.content instead of giving plug path.
          if (err) sendraw();
          else {
            console.log('plug', plug, '<', path[1]);
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
    if (file.meta['Last-Modified']) {
      ask.res.setHeader('Last-Modified',
          (new Date(file.meta['Last-Modified'])).toGMTString());
    }

    // PLUG MECHANISM

    var data = {};

    // Environment variable lookup mechanism.
    data.lookup = lookup(file, query);

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
    for (var i = 0; i < crumbs.length; i++) {
      crumbs[i] += (i < crumbs.length - 1 || file.isOfType('dir') ? '/' : '');
      subpath += crumbs[i];
      data.nav.push({name: crumbs[i], path: subpath});
    }

    findPlug(file, path, data, end);
  });
};

// Find the correct plug.
//
// 1. Look for the non-inherited `plug` metadata.
// 2. Look for the inherited `plugs.<file type>` metadata.
function findPlug(file, path, data, end) {
  var plug = data.lookup('plug');

  if (file.isOfType('dir')) {

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
        data.files.push({name: nodepath.basename(filepath),
                         path: filepath,
                         time: files[i].meta['Last-Modified'],
                         type: files[i].meta.type});
      }
      ///console.log('server:root: data sent from dir is', data);

      if (plug === 'none') {
        // We must send a newline-separated list of subfile names.
        var nameFromFile = function(f) {
          return nodepath.basename(f.path) +
            // Add a trailing slash for directories
            (f.isOfType('dir')? '/': '');
        };
        var subfileNames = files.map(nameFromFile).join('\n');
        end(err, null, {content: subfileNames});
      } else if (plug == null) {
        data.lookup('plugs.dir', function(plug) {
          end(err, plug || 'gateway.html', data);
        });
      } else {
        end(err, plug, data);
      }
    });

  } else if (plug === 'none') {
    end(); // no plug
    return;

  } else if (file.isOfType('text')) {

    file.ot(camp.io, function(err) {
      if (plug == null) {
        data.lookup('plugs.text', function(plug) {
          end(err, plug || 'pencil.html', data);
        });
      } else {
        end(err, plug, data);
      }
    });

  } else if (file.isOfType('binary')) {

    if (plug == null) {
      data.lookup('plugs.binary', function(plug) {
        end(null, plug || 'none', data);
      });
    } else {
      end(null, plug, data);
    }
  }
}
