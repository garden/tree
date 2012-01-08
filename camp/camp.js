/* camp.js: server-side Ajax handler that wraps around Node.js.
 * Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
 * Code covered by the LGPL license. */

"use strict";

var Plate = exports.Plate = require ('./plate');

var EventEmitter = require ('events').EventEmitter,
    http = require('http'),
    https = require('https'),
    p = require('path'),
    fs = require('fs'),
    url = require('url'),
    qs = require('querystring');


// Settings.
//
// By settings I mean data that was set when starting the server, and that is
// not meant to be changed thereafter.
var settings = {
  port: 80,
  security: {},
  debug: 0
};


// Template system.
//

var catches = [],
    fallthrough = [];

exports.handle = function (paths, literalcall, evtcb) {
  catches.push ([RegExp(paths).source, literalcall, evtcb]);
};

exports.notfound = function (paths, literalcall, evtcb) {
  fallthrough.push ([RegExp(paths).source, literalcall, evtcb]);
};


// Register ajax action.
//

exports.server = new EventEmitter ();

exports.add = (function () {

  // The exports.add function is the following.
  var adder = function (action, callback, evtfunc) {
  	exports.server.Actions[action] = [callback, evtfunc];
  };

  exports.server.Actions = {};    // This will be extended by the add function.

  return adder;
})();

exports.addDiffer = exports.add;


exports.server.mime = require('./mime.json');

exports.server.binaries = [
  'pdf', 'ps', 'odt', 'ods', 'odp', 'xls', 'doc', 'ppt', 'dvi', 'ttf', 'swf',
  'rar', 'zip', 'tar', 'gz', 'ogg', 'mp3', 'mpeg', 'wav', 'wma', 'gif', 'jpg',
  'jpeg', 'png', 'svg', 'tiff', 'ico', 'mp4', 'ogv', 'mov', 'webm', 'wmv'
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

/* Ask is a model of the client request's environment. */
function Ask (req, res) {
  return {req:req, res:res};
}

/* Differed sendback function (choice between func and object).
 * `ask` is the client request environment.
 * `getsentback` is the function that returns either an object or ∅.
 * `treat(res)` is a func that the result goes through and is sent.
 * `sentback` is a function, fired by the event whose name is
 * that function's name. */
function differedresult (ask, getsentback, treat, sentback) {
  var req = ask.req,
      res = ask.res;
  if (sentback !== undefined) {
    // Event-based ajax call.
    console.log('sentback', sentback.name);
    var evtname = sentback.name === ''? req.url.slice(2): sentback.name;

    if (typeof sentback !== 'function' && settings.debug > 2) {
      console.log ('warning: has a third parameter that isn\'t an ' +
        'event callback (ie, a function).');
    }

    req.pause ();   // We must wait for an event to happen.
    var evtnamecb = function () {
      var args = [];    // The argument list to send to action.
      for (var i in arguments) { args.push (arguments[i]); }
      // After all arguments given to `emit`, comes the returned value of
      // `getsentdata`, in `camp.add('action', getsentback, sentback)`.
      if (actiondata)  args.push (actiondata.data);

      var resp = sentback.apply (undefined, args);
      if (settings.debug > 3) { console.log ('event',evtname,
                                'yields',JSON.stringify(resp)); }
      if (resp !== undefined) {
        if (settings.debug > 3) { console.log ('subsequently writing it'); }
        try {
          req.resume ();
          res.end (treat (resp));
        } catch (e) {
          if (settings.debug > 2) { console.log (e.message); }
        }
        // Remove callback.
        exports.server.removeListener (evtname, evtnamecb);
      }
    }
    exports.server.on (evtname, evtnamecb);
    var actiondata = getsentback ();
    // actiondata must be {differ:false/true, data:{}}.
    if (actiondata && !actiondata.differ) {
      res.end (treat (actiondata.data || {}));
      exports.server.removeListener (evtname, evtnamecb);
    }

  } else {
    // Handle the action the usual way.
    res.end (treat (getsentback() || {}));
  }
}

// The request listener.
//
// It takes the request and the response objects, and deal with them.
// They can behave differently, according to the configuration:
//
// - look into the 'web' folder (default)
// - trigger the corresponding action (if it starts with a $)
// - run the template (if camp.handle was used)
//

function listener (req, res) {
  var uri = url.parse (decodeURI (req.url), true),
      path = uri.pathname,
      query = uri.query,
      ask = Ask(req, res);

  try {
    if (settings.debug > 5) { console.log(path); } ///
    var realpath = '.' + path;


    if (/^\/\$/.test (path)) {
      // This is an ajax action.
      if (settings.debug > 3) { console.log ('validated action', path); } ///
      var action = path.slice (2);

      res.writeHead (200, {'Content-Type': exports.server.mime['json']});

      /* Handler for when we get a data request. */
      var gotrequest = function (chunk) {

        if (chunk !== undefined) {
          /* Parse the chunk (it is an object literal). */
          parsequery (query, chunk.toString ());
        }

        /* Launch the defined action. */
        if (exports.server.Actions[action]) {
          var getsentback = function() {
            return exports.server.Actions[action][0] (query);
          },  evtcb =  exports.server.Actions[action][1];
          differedresult (ask, getsentback, JSON.stringify, evtcb);
        } else {
          res.end ('404');
        }

      };
      if (req.method === 'POST') req.on ('data', gotrequest);
      else gotrequest();

    } else {
      if (settings.debug > 3) { console.log ('validated', path); }  ///
      //TODO: make it a stream.

      /* What extension is it? */
      var ext = p.extname (realpath).slice (1);

      // Path catching mechanism.
      var catchpath = function (platepaths) {
        if (settings.debug > 1 && platepaths.length > 1) {
          console.log ('More than one plate paths match', path + ':');
          platepaths.forEach (function (path) {console.log ('-',path);});
        }
        var pathmatch = path.match (RegExp (platepaths[0][0]));

        // What does the plate handling yield? Direcly data, or...
        var completion = function() {
          var result = platepaths[0][1] (query, pathmatch);
          // Extension of the template.
          ext = p.extname (pathmatch[0]).slice (1);
          res.writeHead (200, {
            'Content-Type': exports.server.mime[ext] || 'text/plain'
          });
          return result;
        },  treat = function (templatedata) {
          var data = fs.readFileSync ('.' + pathmatch[0]);
          if (data === undefined) {
            if (settings.debug > 0) {
              console.log ('Template not found:', err.path);
            }
            res.writeHead (404, 'Where the hell do you think you\'re going?');
            res.end ('404: thou hast finished me!\n');
          }
          return Plate.format (data.toString (), templatedata);
        };

        // `platepaths[0][2]` is the callback associated to the event,
        // if it exists.
        differedresult (ask, completion, treat, platepaths[0][2]);

      };

      // Do we need template preprocessing?
      var platepaths;
      if ((platepaths = catches.filter (function(key) {
          return RegExp(key[0]).test (path);
        })).length > 0) {
        catchpath (platepaths);

      } else {
        // realpath is a real path!
        if (realpath.match (/\/$/)) {
          realpath = realpath + 'index.html';
          ext = 'html';
        }
        fs.readFile(realpath,
          exports.server.binaries.indexOf (ext) !== -1? 'binary': 'utf8',
          function (err, data) {
            if (err) {
              if ((platepaths = fallthrough.filter (function(key) {
                  return RegExp(key[0]).test (path);
              })).length > 0) {
                catchpath (platepaths);

              } else {
                if (settings.debug > 0) {
                  console.log ('File not found:', err.path);
                }
                res.writeHead (404,
                  'Where the hell do you think you\'re going?');
                res.end ('404: thou hast finished me!\n');
              }

            } else {
              res.writeHead (200, {
                'Content-Type': exports.server.mime[ext] || 'text/plain'
              });
              res.end (data, 'binary');
            }
        });
      }
    }

  } catch(e) {
    res.writeHead (404, 'You killed me!');
    if (settings.debug > 1) {
      res.write(e.toString() + '\n');
      console.log(e.stack);
    }
    res.end ('404: thou hast finished me!\n');
  }

};

// Internal start function.
//

function startServer () {
  // Are we running https?
  if (settings.security.key && settings.security.cert) { // yep
    https.createServer({
      key: fs.readFileSync(settings.security.key),
      cert: fs.readFileSync(settings.security.cert)
    }, listener).listen(settings.port);
  } else { // nope
    http.createServer(listener).listen(settings.port);
  }
}

// Each camp instance creates an HTTP / HTTPS server automatically.
//
exports.start = function (options) {
  var options = options || {};
  console.log(options);

  for (var setting in options) {
    settings[setting] = options[setting];
  }

  // Populate security values with the corresponding files.
  if (options.secure || options.key || options.cert) {
    settings.security.key = options.key || '../https.key';
    settings.security.cert = options.cert || '../https.crt';
  }

  settings.port = options.port || (security.key && security.cert ? 443 : 80);
  settings.debug = options.debug || 0;

  startServer();

  return module.exports;
};

