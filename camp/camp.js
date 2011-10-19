/* camp.js: server-side Ajax handler that wraps around Node.js.
 * Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
 * Code covered by the LGPL license. */

var EventEmitter = require ('events').EventEmitter;
var Plate = exports.Plate = require ('./plate');

// Template system.
//

var catches = [];
var fallthrough = [];
exports.handle = function (paths, literalcall, evtcb) {
  catches.push ([RegExp(paths).source, literalcall, evtcb]);
};
exports.notfound = function (paths, literalcall, evtcb) {
  fallthrough.push ([RegExp(paths).source, literalcall, evtcb]);
};


// Register ajax action.
//

exports.Server = new EventEmitter ();

exports.add = (function () {

  // The exports.add function is the following.
  var adder = function (action, callback, evtname) {
  	exports.Server.Actions[action] = [callback, evtname];
  };

  exports.Server.Actions = {};    // This will be extended by the add function.

  return adder;
})();


exports.Server.mime = {
  'txt': 'text/plain',
  'html': 'text/html',
  'xhtml': 'text/html',
  'htm': 'text/html',
  'xml': 'text/xml',
  'css': 'text/css',
  'csv': 'text/csv',
  'dtd': 'application/xml-dtd',

  'js': 'application/javascript',
  'json': 'application/json',

  'pdf': 'application/pdf',
  'ps': 'application/postscript',
  'odt': 'application/vnd.oasis.opendocument.text',
  'ods': 'application/vnd.oasis.opendocument.spreadsheet',
  'odp': 'application/vnd.oasis.opendocument.presentation',
  'xls': 'application/vnd.ms-excel',
  'doc': 'application/vnd.msword',
  'ppt': 'application/vnd.ms-powerpoint',
  'xul': 'application/vnd.mozilla.xul+xml',
  'kml': 'application/vnd.google-earth.kml+xml',
  'dvi': 'application/x-dvi',
  'tex': 'application/x-latex',
  'ttf': 'application/x-font-ttf',
  'swf': 'application/x-shockwave-flash',
  'rar': 'application/x-rar-compressed',
  'zip': 'application/zip',
  'tar': 'application/x-tar',
  'gz': 'application/x-gzip',

  'ogg': 'audio/ogg',
  'mp3': 'audio/mpeg',
  'mpeg': 'audio/mpeg',
  'wav': 'audio/vnd.wave',
  'wma': 'audio/x-ms-wma',
  'gif': 'image/gif',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'svg': 'image/svg+xml',
  'tiff': 'image/tiff',
  'ico': 'image/vnd.microsoft.icon',
  'mp4': 'video/mp4',
  'ogv': 'video/ogg',
  'mov': 'video/quicktime',
  'webm': 'video/webm',
  'wmv': 'video/x-ms-wmv'
};
exports.Server.binaries = [
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
      query[unescape(elems[0])] = JSON.parse(unescape(elems[1]));
    } catch (e) {
      console.log ('query:', JSON.stringify(query), e.toString());
    }
  }
  return query;
}


// Start function.
//

exports.Server.start = function (port, debug) {
  "use strict";
  port = port || 80;
  debug = debug || 0;

  var http = require('http')
    , p = require('path')
    , fs = require('fs')
    , url = require('url')
    , qs = require('querystring');

  http.createServer(function(req,res){
    var uri = url.parse (req.url, true);
    var path = uri.pathname;
    var query = uri.query;

    try {
      if (debug > 5) { console.log(path); } ///
      var realpath = '.' + path;


      /* Differed sendback function (choice between func and object).
       * `getsentback` is the function that returns either an object or ∅..
       * `treat(res)` is a func that the result goes through and is sent.
       * `sentback` is a function, fired by the event whose name is that
       * that function's name. */
      var differedresult = function (getsentback, treat, sentback) {
        if (sentback !== undefined) {
          // Event-based ajax call.
          var evtname = sentback.name;

          if (typeof sentback !== 'function' && debug > 2) {
            console.log ('warning: has a third parameter that isn\'t an ' +
              'event callback (ie, a function).');
          }

          req.pause ();   // We must wait for an event to happen.
          exports.Server.on (evtname, function evtnamecb () {
            var args = [];    // The argument list to send to action.
            for (var i in arguments) { args.push (arguments[i]); }

            var resp = sentback.apply (query, args);
            if (debug > 3) { console.log ('event',evtname,
                                      'yields',JSON.stringify(resp)); }
            if (resp !== undefined) {
              if (debug > 3) { console.log ('subsequently writing it'); }
              try {
                req.resume ();
                res.end (treat (resp));
              } catch (e) {
                if (debug > 2) { console.log (e.message); }
              }
              // Remove callback.
              exports.Server.removeListener (evtname, evtnamecb);
            }
          });
          getsentback ();

        } else {
          // Handle the action the usual way.
          res.end (treat (getsentback() || {}));
        }
      };

      if (/^\/\$/.test (path)) {
        // This is an ajax action.
        if (debug > 3) { console.log ('validated action', path); } ///
        var action = path.slice (2);

        res.writeHead (200, {'Content-Type': exports.Server.mime['json']});

        /* Handler for when we get a data request. */
        var gotrequest = function (chunk) {

          /* Parse the chunk (it is an object literal). */
          parsequery (query, chunk.toString ());

          /* Launch the defined action. */
          if (exports.Server.Actions[action]) {
            var getsentback = function() {
              return exports.Server.Actions[action][0] (query);
            },  evtcb =  exports.Server.Actions[action][1];
            differedresult (getsentback, JSON.stringify, evtcb);
          } else {
            res.end ('404');
          }

        };
        req.on ('data', gotrequest);

      } else {
        if (debug > 3) { console.log ('validated', path); }  ///
        //TODO: make it a stream.

        /* What extension is it? */
        var ext = p.extname (realpath).slice (1);

        // Path catching mechanism.
        var catchpath = function (platepaths) {
          if (debug > 1 && platepaths.length > 1) {
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
              'Content-Type': exports.Server.mime[ext] || 'text/plain'
            });
            return result;
          },  treat = function (templatedata) {
            var data = fs.readFileSync ('.' + pathmatch[0]);
            if (data === undefined) {
              if (debug > 0) { console.log ('Template not found:', err.path); }
              res.writeHead (404, 'Where the hell do you think you\'re going?');
              res.end ('404: thou hast finished me!\n');
            }
            return Plate.format (data.toString (), templatedata);
          };

          // `platepaths[0][2]` is the callback associated to the event,
          // if it exists.
          differedresult (completion, treat, platepaths[0][2]);

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
          fs.readFile(realpath
              , exports.Server.binaries.indexOf (ext) !== -1? 'binary': 'utf8'
              , function (err, data) {
            if (err) {
              if ((platepaths = fallthrough.filter (function(key) {
                  return RegExp(key[0]).test (path);
              })).length > 0) {
                catchpath (platepaths);

              } else {
                if (debug > 0) { console.log ('File not found:', err.path); }
                res.writeHead (404, 'Where the hell do you think you\'re going?');
                res.end ('404: thou hast finished me!\n');
              }

            } else {
              res.writeHead (200, {
                'Content-Type': exports.Server.mime[ext] || 'text/plain'
              });
              res.end (data, 'binary');
            }
          });
        }
      }

    } catch(e) {
      res.writeHead (404, 'You killed me!');
      if (debug > 1) { res.write(e.toString() + '\n'); }
      res.end ('404: thou hast finished me!\n');
    }

  }).listen(port);
};

// Easy start alias
//
exports.start = exports.Server.start;
