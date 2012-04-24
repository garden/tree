/* camp.js: server-side Ajax handler that wraps around Node.js.
 * Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
 * Code covered by the LGPL license. */

"use strict";

var Plate = require ('./plate');

var EventEmitter = require ('events').EventEmitter,
    http = require('http'),
    https = require('https'),
    p = require('path'),
    fs = require('fs'),
    url = require('url'),
    qs = require('querystring');




var mime = require('./mime.json'),
    binaries = [
      'pdf', 'ps', 'odt', 'ods', 'odp', 'xls', 'doc', 'ppt', 'dvi', 'ttf',
      'swf', 'rar', 'zip', 'tar', 'gz', 'ogg', 'mp3', 'mpeg', 'wav', 'wma',
      'gif', 'jpg', 'jpeg', 'png', 'svg', 'tiff', 'ico', 'mp4', 'ogv', 'mov',
      'webm', 'wmv'
];


// We'll need to parse the query (either POST or GET) as a literal.
function parsequery (query, strquery) {
  var items = strquery.split('&');
  for (var item in items) {
    // Each element of key=value is then again split along `=`.
    var elems = items[item].split('=');
    try {
      query[decodeURIComponent(elems[0])] =
        JSON.parse(decodeURIComponent(elems[1]));
    } catch (e) {
      console.log ('query:', JSON.stringify(query), e.toString());
    }
  }
  return query;
}


// Ask is a model of the client's request / response environment.
function Ask (server, req, res) {
  this.server = server;
  this.req = req;
  this.res = res;
  try {
    this.uri = url.parse(decodeURI(req.url), true);
  } catch (e) {     // Using `escape` should not kill the server.
    this.uri = url.parse(unescape(req.url), true);
  }
  this.path = this.uri.pathname;
  this.query = this.uri.query;
}

// Set the mime type of the response.
Ask.prototype.mime = function (type) {
  this.res.setHeader('Content-Type', type);
}




// Camp class is classy.
//
// Camp has a router function that returns the stack of functions to call, one
// after the other, in order to process the request.

function Camp() {
  http.Server.call(this);
  this.stack = [];
  for (var i = 0; i < defaultRoute.length; i++)
    this.stack.push(defaultRoute[i](this));
  this.on('request', listener.bind(this));
}
Camp.prototype = new http.Server();

function SecureCamp(opts) {
  https.Server.call(this, opts);
  this.stack = [];
  for (var i = 0; i < defaultRoute.length; i++)
    this.stack.push(defaultRoute[i](this));
  this.on('request', listener.bind(this));
}
// The following `requestCert` thing seems required by node.
SecureCamp.prototype = new https.Server({requestCert:null});



// Insert a listener after a listener named `listn`.

Camp.prototype.insertListener = SecureCamp.prototype.insertListener =
function addListenerBefore(listn, type, listener) {

  // this._events is an EventEmitter thing, a list of functions.

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
// - if the request is of the form /$..., it runs the ajax / eventSource unit.
// - if the request is a registered template, it runs the template unit.
// - if the request isn't a registered route, it runs the static unit.
// - else, it runs the notfound unit.

var defaultRoute = [socketUnit, ajaxUnit, eventSourceUnit,
                    routeUnit, staticUnit, notfoundUnit];

// Socket.io unit.
function socketUnit (server) {
  var io = server.io = require('socket.io').listen(server);
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

  return function ajaxLayer (ask, next) {
    if (ask.path[1] !== '$') return next();
    var action = ask.path.slice(2),
        res = ask.res;

    if (ajax.listeners(action).length <= 0) return next();

    res.setHeader('Content-Type', mime.json);

    // Handler for when we get a data request.
    var gotrequest = function (chunk) {

      if (chunk !== undefined) parsequery(ask.query, chunk.toString());

      // Launch the defined action.
      ajax.emit(action, ask.query, function ajaxEnd (data) {
        res.end(JSON.stringify(data || {}));
      }, ask);
    };
    if (ask.req.method === 'POST') ask.req.on ('data', gotrequest);
    else gotrequest();
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
  var documentRoot = server.documentRoot = process.cwd() + '/web';

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
      fs.createReadStream(realpath).pipe(ask.res);
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
      catchpath(ask, platepaths);
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
      catchpath(ask, platepaths);
    } else {
      ask.res.end('404\n');
    }
  };
}

// Route *and* not found units — see what I did there?

function catchpath (ask, platepaths) {
  var res = ask.res;

  if (platepaths.length > 1) {
    console.error ('More than one template path match', ask.path + ':');
    platepaths.forEach (function (path) {console.error ('-', path[0]);});
  }
  var pathmatch = ask.path.match (RegExp (platepaths[0][0]));

  // Template parameters (JSON-serializable).
  var params = platepaths[0][1](ask.query, pathmatch, function end (params) {
    if (!ask.res.getHeader('Content-Type'))   // Allow overriding.
      ask.mime(mime[p.extname(pathmatch[0]).slice(1)] || 'text/plain');

    var templatePath = p.join(ask.server.documentRoot, pathmatch[0]),
        reader = fs.createReadStream(templatePath);

    if (!(params && Object.keys(params).length)) {
      // No data was given. Same behaviour as static.
      reader.pipe(ask.res);
    } else {
      Plate.format(reader, ask.res, params);
    }
  }, ask);
}






// Internal start function.
//

function createServer () { return new Camp(); }

function createSecureServer (opts) { return new SecureCamp(opts); }

function startServer (settings) {
  var server;

  // Are we running https?
  if (settings.secure) { // Yep
    server = new SecureCamp ({
      key:  fs.readFileSync(settings.security.key),
      cert: fs.readFileSync(settings.security.cert),
      ca:   settings.security.ca.map(function(file) {
        try {
          var ca = fs.readFileSync(file);
          return ca;
        } catch (e) { console.error('CA file not found:', file); }
      })
    }).listen(settings.port);
  } else { // Nope
    server = new Camp().listen(settings.port);
  }

  return server;
}


// Each camp instance creates an HTTP / HTTPS server automatically.
//
function start (options) {

  // Settings.
  //
  // By settings I mean data that was set when starting the server, and that is
  // not meant to be changed thereafter.
  var settings = {
    port: 80,
    security: {}
  };

  options = options || {};

  for (var setting in options) {
    settings[setting] = options[setting];
  }

  // Populate security values with the corresponding files.
  if (options.secure) {
    settings.security.key = options.key || 'https.key';
    settings.security.cert = options.cert || 'https.crt';
    settings.security.ca = options.ca || [];
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

exports.Plate = Plate;
exports.mime = mime;
exports.binaries = binaries;
