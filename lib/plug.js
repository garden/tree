// Plug application system.
// Copyright © 2011-2015 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var fs = require('./fs');
var stream = require('stream');
var nodepath = require('path');
var driver = require('./driver');
var lookup = require('./lookup');
var pwdCheck = require('./pwd-check');
var publicFile = require('./public-file');


// We need Camp's socket.io object here. We get it at initialization.
var camp;

exports.main = function (server) { camp = server; };

// The plug system.

exports.resolve = function (query, path, endres, ask) {

  // Get the file/folder corresponding to the query.
  fs.open(ask.path, function openQueryFile(err, file) {
    // If there was an error, abort!
    if (err) {
      ask.res.statusCode = 404;
      end(err, '404.html', {error: err.message});
      return;
    }

    var filePath = file.path;
    var content = file.content;
    function sendraw(data) {
      console.log('send', filePath);
      // Set HTTP header Content-Type.
      if (file.meta.type !== undefined) {
        ask.res.setHeader('Content-Type', file.meta.type);
      }
      if (data && data.content) {
        ask.res.end(data.content);
      } else {
        // Bypass the template engine.
        endres(null, { template: streamFromData(content) });
      }
    }

    function end(err, plug, data) {
      if (err) {
        console.error(err);
        endres(null, { template: '/404.html' });
        return;
      }
      if (!plug || plug === 'none') {
        sendraw(data); return;
      } else {
        if (nodepath.extname(plug).length === 0) { plug += '.html'; }
        fs.file(plug, function(err, file) {
          if (err) { sendraw(); return; }
          console.log('plug', file.path, '<', filePath);
          endres(data || {}, { template: file.path });
        });
      }
    }

    // TODO If file requires a password and nothing matches, abort!
    pwdCheck(file, ask.password, 'readkey', function checkedPwd(err) {
      if (err != null) {
        ask.res.statusCode = 401;
        ask.res.setHeader('WWW-Authenticate', 'Basic')
        end(err, '404.html', {error: err.message});
        return;
      }

      // Set HTTP header Last-Modified.
      if (file.meta['Last-Modified']) {
        ask.res.setHeader('Last-Modified',
            (new Date(file.meta['Last-Modified'])).toGMTString());
      }

      // PLUG MECHANISM

      var data = {};

      // Environment variable lookup mechanism.
      data.lookup = lookup(file, query);

      // File info.
      data.file = publicFile(file);
      data.files = [];
      data.title = nodepath.basename(filePath) || 'The File Tree';
      data.extname = nodepath.extname(filePath).slice(1);

      // Navigation crumbs
      data.nav = [];
      var crumbs = filePath.split('/').filter(function(e) {
        return e.length > 0;
      });
      var subpath = '/';
      data.nav.push({name: '/', path: subpath});
      for (var i = 0; i < crumbs.length; i++) {
        crumbs[i] += (i < crumbs.length - 1 || file.isOfType('dir') ? '/' : '');
        subpath += crumbs[i];
        data.nav.push({name: crumbs[i], path: subpath});
      }

      findPlug(file, data, end);
    });
  });
};

// Find the correct plug.
//
// 1. Look for the non-inherited `plug` metadata.
// 2. Look for the inherited `plugs.<file type>` metadata.
function findPlug(file, data, end) {
  var plug = data.lookup('plug');

  if (file.isOfType('dir')) {

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

function objCopy(o) {
  var newObject = Object.create(null);
  for (var p in o) {
    try {
      newObject[p] = JSON.parse(JSON.stringify((o[p])));
    } catch(e) {}
  }
  return newObject;
}

function streamFromData(data) {
  var newStream = new stream.Readable();
  newStream._read = function() { newStream.push(data); newStream.push(null); };
  return newStream;
}
