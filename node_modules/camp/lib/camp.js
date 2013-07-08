// Server-side Ajax handler that wraps around node.js.
// Copyright © Thaddee Tyl, Jan Keromnes. All rights reserved.
// Code covered by the LGPL license.

"use strict";

var templateReader = require('hun');
var formidable = require('formidable');

var EventEmitter = require ('events').EventEmitter;
var inherits = require('util').inherits;
var http = require('http');
var https = require('https');
var p = require('path');
var fs = require('fs');
var url = require('url');
var zlib = require('zlib');




var mime = require('./mime.json'),
    binaries = [
      'pdf', 'ps', 'odt', 'ods', 'odp', 'xls', 'doc', 'ppt', 'dvi', 'ttf',
      'swf', 'rar', 'zip', 'tar', 'gz', 'ogg', 'mp3', 'mpeg', 'wav', 'wma',
      'gif', 'jpg', 'jpeg', 'png', 'svg', 'tiff', 'ico', 'mp4', 'ogv', 'mov',
      'webm', 'wmv'
];


// Ask is a model of the client's request / response environment.
function Ask (server, req, res) {
  this.server = server;
  this.req = req;
  this.res = res;
  this.uri = url.parse(req.url, true);
  // The form is used for multipart data.
  // FIXME: can we avoid all this allocation?
  // Idea: keeping the same. Would that cause issues?
  this.form = new formidable.IncomingForm();
  this.path = unescape(this.uri.pathname);
  this.query = this.uri.query;
}

// Set the mime type of the response.
Ask.prototype.mime = function (type) {
  this.res.setHeader('Content-Type', type);
}

function addToQuery(ask, obj) {
  for (var item in obj) {
    ask.query[item] = obj[item];
  }
}

// We'll need to parse the query (either POST or GET) as a literal.
// Ask objects already have ask.query set after the URL query part.
// This function updates ask.query with:
// - application/x-www-form-urlencoded
// - multipart/form-data
function getQueries(ask, end) {
  if (ask.req.method === 'GET') {
    end(null);  // It's already parsed in ask.query.
  } else if (ask.req.method === 'POST') {
    var urlencoded = 'application/x-www-form-urlencoded';
    var multipart = 'multipart/form-data';
    var contentType = ask.req.headers['content-type'];

    if (contentType.slice(0, multipart.length) === multipart) {
      // Multipart data.
      ask.form.parse(ask.req, function(err, fields, files) {
        if (err === null) {
          addToQuery(ask, fields);
          addToQuery(ask, files);
        }
        end(err);
      });

    } else if (contentType.slice(0, urlencoded.length) === urlencoded) {
      // URL encoded data.
      var chunks;
      var gotrequest = function (chunk) {
        if (chunk !== undefined) {
          if (chunks === undefined) {
            chunks = chunk;
          } else {
            chunks = Buffer.concat([chunks, chunk]);
          }
        }
      };
      ask.req.on('data', gotrequest);
      ask.req.on('end', function(err) {
        var strquery = chunks.toString();

        // Decoding the query string from the chunks.
        // We can't use the querystring library
        // because we must decode it as JSON.
        var items = strquery.split('&');
        for (var item in items) {
          // Each element of key=value is then again split along `=`.
          var elems = items[item].split('=');
          try {
            ask.query[decodeURIComponent(elems[0])] =
              JSON.parse(decodeURIComponent(elems[1]));
          } catch (e) {
            try {
              ask.query[decodeURIComponent(elems[0])] =
                decodeURIComponent(elems[1]);
            } catch (e) {
              console.error('Error while parsing query ', items[item]);
              console.error('(' + e.toString() + ')');
              console.error('Subsequently returning', JSON.stringify(query));
              end(e);
              return;
            }
          }
        }

        end(null);
      });
    }
  }
}




// Camp class is classy.
//
// Camp has a router function that returns the stack of functions to call, one
// after the other, in order to process the request.

function Camp(opts) {
  http.Server.call(this);
  this.templateReader = opts.templateReader || templateReader;
  this.documentRoot = opts.documentRoot || process.cwd() + '/web';
  this.stack = [];
  for (var i = 0; i < defaultRoute.length; i++)
    this.stack.push(defaultRoute[i](this));
  this.on('request', listener.bind(this));
}
inherits(Camp, http.Server);

function SecureCamp(opts) {
  https.Server.call(this, opts);
  this.templateReader = opts.templateReader || templateReader;
  this.documentRoot = opts.documentRoot || process.cwd() + '/web';
  this.stack = [];
  for (var i = 0; i < defaultRoute.length; i++)
    this.stack.push(defaultRoute[i](this));
  this.on('request', listener.bind(this));
}
inherits(SecureCamp, https.Server);



// Insert a listener after a listener named `listn`.

Camp.prototype.insertListener = SecureCamp.prototype.insertListener =
function addListenerBefore(listn, type, listener) {

  // this._events is a map from event types to a list of functions.

  if (this._events && this._events[type] && Array.isArray(this._events[type])) {
    var index = 0;
    for (var i = 0; i < this._events[type].length; i++) {
      if (this._events[type][i].name === listn) {
        index = i;
        break;
      }
    }

    // Insertion algorithm from <http://jsperf.com/insert-to-an-array>.
    var l = this._events[type],
        a = l.slice(0, index);
    a.push(listener);
    this._events[type] = a.concat(l.slice(index));

  } else {
    this.on(type, listener);
  }
  return this;
}

// On-demand loading of socket.io.
Camp.prototype.socketIo = SecureCamp.prototype.socketIo
                        = null;
var socketIoProperty = {
  get: function() {
    if (this.socketIo === null) {
      this.socketIo = require('socket.io').listen(this);
      // Add socketUnit only once.
      this.stack.unshift(socketUnit(this));
    }
    return this.socketIo;
  },
};
Object.defineProperty(Camp.prototype,       'io', socketIoProperty);
Object.defineProperty(SecureCamp.prototype, 'io', socketIoProperty);

// Default request listener.

function listener (req, res) {
  var ask = new Ask(this, req, res);
  bubble(ask, 0);
}

// The bubble goes through each layer of the stack until it reaches the surface.
// The surface is a Server Error, btw.
function bubble (ask, layer) {
  ask.server.stack[layer](ask, function next() {
    if (ask.server.stack.length > layer + 1) bubble(ask, layer + 1);
    else {
      ask.res.statusCode = 500;
      ask.res.end('500\n');
    }
  });
}



// The default routing function:
//
// - if the request is of the form /$socket.io, it runs the socket.io unit.
//   (By default, that is not in. Using `server.io` loads the library.)
// - if the request is of the form /$..., it runs the ajax / eventSource unit.
// - if the request is a registered template, it runs the template unit.
// - if the request isn't a registered route, it runs the static unit.
// - else, it runs the notfound unit.

var defaultRoute = [ajaxUnit, eventSourceUnit,
                    routeUnit, staticUnit, notfoundUnit];

// Socket.io unit.
function socketUnit (server) {
  var io = server.io;
  // Client-side: <script src="/$socket.io/socket.io.js"></script>
  function ioConf() { io.set('resource', '/$socket.io'); }
  io.configure('development', ioConf);
  io.configure('production', ioConf);

  return function socketLayer (ask, next) {
    // Socket.io doesn't care about anything but /$socket.io now.
    if (ask.path.slice(1, 11) !== '$socket.io') next();
  };
}

// Ajax unit.
function ajaxUnit (server) {
  var ajax = server.ajax = new EventEmitter();
  // Register events to be fired before loading the ajax data.
  var ajaxReq = server.ajaxReq = new EventEmitter();

  return function ajaxLayer (ask, next) {
    if (ask.path[1] !== '$') return next();
    var action = ask.path.slice(2),
        res = ask.res;

    if (ajax.listeners(action).length <= 0) return next();

    res.setHeader('Content-Type', mime.json);

    ajaxReq.emit(action, ask);
    // Get all data requests.
    getQueries(ask, function(err) {
      if (err === null) {
        ajax.emit(action, ask.query, function ajaxEnd(data) {
          res.end(JSON.stringify(data || {}));
        }, ask);
      } else {
        console.error('While parsing', ask.req.url + ':');
        console.error(err);
        return next();
      }
    });
  };
}


// EventSource unit.
//
// Note: great inspiration was taken from Remy Sharp's code.
function eventSourceUnit (server) {
  var sources = {};

  function Source () {
    this.conn = [];
    this.history = [];
    this.lastMsgId = 0;
  }

  Source.prototype.removeConn = function(res) {
    var i = this.conn.indexOf(res);
    if (i !== -1) {
      this.conn.splice(i, 1);
    }
  };

  Source.prototype.sendSSE = function (res, id, event, message) {
    var data = '';
    if (event !== null) {
      data += 'event:' + event + '\n';
    }

    // Blank id resets the id counter.
    if (id !== null) {
      data += 'id:' + id + '\n';
    } else {
      data += 'id\n';
    }

    if (message) {
      data += 'data:' + message.split('\n').join('\ndata') + '\n';
    }
    data += '\n';

    res.write(data);

    if (res.hasOwnProperty('xhr')) {
      clearTimeout(res.xhr);
      var self = this;
      res.xhr = setTimeout(function () {
        res.end();
        self.removeConn(res);
      }, 250);
    }
  };

  Source.prototype.emit = function (event, msg) {
    this.lastMsgId++;
    this.history.push({
      id: this.lastMsgId,
      event: event,
      msg: msg
    });

    for (var i = 0; i < this.conn.length; i++) {
      this.sendSSE(this.conn[i], this.lastMsgId, event, msg);
    }
  }

  Source.prototype.send = function (msg) {
    this.emit(null, JSON.stringify(msg));
  }

  function eventSource (channel) {
    return sources[channel] = new Source();
  }

  server.eventSource = eventSource;


  return function eventSourceLayer (ask, next) {
    if (ask.path[1] !== '$') return next();
    var action = ask.path.slice(2),
        res = ask.res,
        source = sources[action];
    if (!source || ask.req.headers.accept !== 'text/event-stream')
      return next();    // Don't bother if the client cannot handle it.

    // Remy Sharp's Polyfill support.
    if (ask.req.headers['x-requested-with'] == 'XMLHttpRequest') {
      res.xhr = null;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    if (ask.req.headers['last-event-id']) {
      var id = parseInt(ask.req.headers['last-event-id']);
      for (var i = 0; i < source.history.length; i++)
        if (source.history[i].id > id)
          source.sendSSE(res, source.history[i].id,
              source.history[i].event, source.history[i].msg);
    } else res.write('id\n\n');      // Reset id.

    source.conn.push(res);

    // Every 15s, send a comment (avoids proxy dropping HTTP connection).
    var to = setInterval(function () {res.write(':\n');}, 15000);

    // This can only end in blood.
    ask.req.on('close', function () {
      source.removeConn(res);
      clearInterval(to);
    });
  };
}

// Static unit.
function staticUnit (server) {
  var documentRoot = server.documentRoot;

  return function staticLayer (ask, next) {
    // We use `documentRoot` as the root wherein we seek files.
    var realpath = p.join(documentRoot, ask.path);
    fs.stat(realpath, function(err, stats) {
      if (err) return next();
      ask.mime(mime[p.extname(ask.path).slice(1)] || 'text/plain');

      if (stats.isDirectory()) {
        realpath = p.join(realpath, 'index.html');
        ask.mime(mime['html']);
      }

      // Connect the output of the file to the network!
      var enc = ask.req.headers['accept-encoding'] || '',
          raw = fs.createReadStream(realpath);
      raw.on('error', function(err) {
        console.error(err.stack);
        ask.res.end('404\n');
      });

      // Compress when possible
      if (enc.match(/\bgzip\b/)) {
        ask.res.setHeader('content-encoding', 'gzip');
        raw.pipe(zlib.createGzip()).pipe(ask.res);
      } else if (enc.match(/\bdeflate\b/)) {
        ask.res.setHeader('content-encoding', 'deflate');
        raw.pipe(zlib.createDeflate()).pipe(ask.res);
      } else {
        raw.pipe(ask.res);
      }
    });
  };
}

// Template unit.
function routeUnit (server) {
  var templates = [];

  function route (paths, literalCall) {
    templates.push([RegExp(paths).source, literalCall]);
  }

  server.route = route;


  return function routeLayer (ask, next) {
    var platepaths;
    if ((platepaths = templates.filter (function(key) {
          return RegExp(key[0]).test (ask.path);
        })).length > 0) {
      catchpath(ask, platepaths, server.templateReader);
    } else {
      next();
    }
  };
}

// Not Fount unit — in fact, mostly a copy&paste of the route unit.
function notfoundUnit (server) {
  var notfoundTemplates = [];

  function notfound (paths, literalCall) {
    notfoundTemplates.push([RegExp(paths).source, literalCall]);
  }

  server.notfound = notfound;


  return function notfoundLayer (ask) {
    var platepaths;
    ask.res.statusCode = 404;
    if ((platepaths = notfoundTemplates.filter (function(key) {
          return RegExp(key[0]).test (ask.path);
        })).length > 0) {
      catchpath(ask, platepaths, server.templateReader);
    } else {
      ask.res.end('404\n');
    }
  };
}

// Route *and* not found units — see what I did there?

function catchpath (ask, platepaths, templateReader) {
  var res = ask.res;

  if (platepaths.length > 1) {
    console.error ('More than one template path match', ask.path + ':');
    platepaths.forEach (function (path) {console.error ('-', path[0]);});
  }
  var pathmatch = ask.path.match (RegExp (platepaths[0][0]));

  getQueries(ask, function gotQueries(err) {
    if (err !== null) {
      console.error('While getting queries for ' + ask.uri + ":");
      console.error(err);
    } else {
      // params: template parameters (JSON-serializable).
      platepaths[0][1](ask.query, pathmatch, function end (params, options) {
        options = options || {};
        options.template = options.template || pathmatch[0];
        options.reader = options.reader || templateReader;
        if (!ask.res.getHeader('Content-Type'))   // Allow overriding.
          ask.mime(mime[p.extname(options.template).slice(1)] || 'text/plain');

        if (typeof options.template === 'string') {
          var templatePath = p.join(ask.server.documentRoot, options.template);
          var reader = fs.createReadStream(templatePath);
        } else {
          // Either options.template is a string or a stream.
          var reader = options.template;
        }
        reader.on('error', function(err) {
          console.error(err.stack);
          ask.res.end('404\n');
        });

        if (!(params && Object.keys(params).length)) {
          // No data was given. Same behaviour as static.
          var enc = ask.req.headers['accept-encoding'] || '';

          // Compress when possible
          if (enc.match(/\bgzip\b/)) {
            ask.res.setHeader('content-encoding', 'gzip');
            reader.pipe(zlib.createGzip()).pipe(ask.res);
          } else if (enc.match(/\bdeflate\b/)) {
            ask.res.setHeader('content-encoding', 'deflate');
            reader.pipe(zlib.createDeflate()).pipe(ask.res);
          } else {
            reader.pipe(ask.res);
          }
        } else {
          var enc = ask.req.headers['accept-encoding'] || '';
          var res = ask.res;

          // Compress when possible
          if (enc.match(/\bgzip\b/)) {
            res = zlib.createGzip();
            ask.res.setHeader('content-encoding', 'gzip');
            res.pipe(ask.res);
          } else if (enc.match(/\bdeflate\b/)) {
            res = zlib.createDeflate();
            ask.res.setHeader('content-encoding', 'deflate');
            res.pipe(ask.res);
          }

          options.reader(reader, res, params, function errorcb(err) {
            if (err) {
              console.error(err.stack);
              ask.res.end('404\n');
            }
          });
        }
      }, ask);
    }
  });
}






// Internal start function.
//

function createServer () { return new Camp(); }

function createSecureServer (opts) { return new SecureCamp(opts); }

function startServer (settings) {
  var server;

  // Are we running https?
  if (settings.secure) { // Yep
    settings.key  = fs.readFileSync(settings.key);
    settings.cert = fs.readFileSync(settings.cert);
    settings.ca   = settings.ca.map(function(file) {
      try {
        var ca = fs.readFileSync(file);
        return ca;
      } catch (e) { console.error('CA file not found:', file); }
    });
    server = new SecureCamp(settings).listen(settings.port);
  } else { // Nope
    server = new Camp(settings).listen(settings.port);
  }

  return server;
}


// Each camp instance creates an HTTP / HTTPS server automatically.
//
function start (settings) {

  settings = settings || {};

  // Populate security values with the corresponding files.
  if (settings.secure) {
    settings.passphrase = settings.passphrase || '1234';
    settings.key = settings.key || 'https.key';
    settings.cert = settings.cert || 'https.crt';
    settings.ca = settings.ca || [];
  }

  settings.port = settings.port || (settings.secure ? 443 : 80);

  return startServer(settings);
};


exports.start = start;
exports.createServer = createServer;
exports.createSecureServer = createSecureServer;
exports.Camp;
exports.SecureCamp;

exports.socketUnit;
exports.ajaxUnit;
exports.eventSourceUnit;
exports.routeUnit;
exports.staticUnit;
exports.notfoundUnit;

exports.templateReader = templateReader;
exports.mime = mime;
exports.binaries = binaries;
