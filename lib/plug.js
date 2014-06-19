// Plug application system.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var fs = require('./fs');
var stream = require('stream');
var nodepath = require('path');
var driver = require('./driver');
var lookup = require('./lookup');
var pwdCheck = require('./pwd-check');
var publicFile = require('./public-file');


// We need Camp's socket.io object here. We get it at initialization.
var camp, hun;

// huns = hun extended (with tree-specific parsers, etc.)
exports.main = function (server, huns) { camp = server; hun = huns };

// The plug system.

exports.resolve = function (query, path, endres, ask) {

  // Get the file/folder corresponding to the query.
  var queriedFileName = path[1];
  ///console.log('PLUG: what is %s?', queriedFileName);
  fs.open(queriedFileName, function (err, file) {

    var content = file.content;
    function sendraw(data) {
      console.log('send', queriedFileName);
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
          console.log('plug', plug, '<', queriedFileName);
          endres(data || {}, {
            template: plug,
            reader: file.meta.template !== 'fleau'? hun: null
          });
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
      data.title = nodepath.basename(file.path) || 'The File Tree';
      data.extname = nodepath.extname(file.path).slice(1);

      // Navigation crumbs
      data.nav = [];
      var crumbs = queriedFileName.split('/').filter(function(e) {
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
  });
};

// Find the correct plug.
//
// 1. Look for the non-inherited `plug` metadata.
// 2. Look for the inherited `plugs.<file type>` metadata.
function findPlug(file, path, data, end) {
  var plug = data.lookup('plug');
  var queriedFileName = path[1];

  if (file.isOfType('dir')) {

    // Handle missing final '/'.
    // FIXME consider redirecting user to queriedFileName + '/' instead.
    if (queriedFileName[queriedFileName.length-1] !== '/') {
      queriedFileName += '/';
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
