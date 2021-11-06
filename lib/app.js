// Map paths to apps.
// The following code is covered by the AGPLv3 license.

var fs = require('./fs');
var log = require('./log');
var authenticate = require('./api').authenticate;
var base64url = require('./base64url');
var crypto = require('crypto');
var WebSocket = require('ws');
var canop = require('canop');
var urlLib = require('url');
var pathLib = require('path');
var Camp = require('camp');
var camp;
exports.main = function (server) {
  camp = server;
  fs.initAutosave();
};

function error(err, res, code, msg) {
  log.error(err + (err.stack? '\n' + err.stack: ''));
  if (res) { unloggedError(err, res, code, msg); }
}

function unloggedError(err, res, code = 500, msg = 'Internal server error\n') {
  res.statusCode = code;
  res.end(msg);
}

function success(body, res, code) {
  res.statusCode = code || 200;
  res.compressed().end(body);
}

// Return true if we rely on the HTTP cache (and called res.end()).
function httpCached(req, res, lastModified) {
  if (lastModified !== undefined) {
    var jsonLastModified = JSON.stringify(lastModified);
    res.setHeader('Last-Modified', new Date(lastModified).toUTCString());
    var etag = req.headers['if-none-match'];
    if (etag !== undefined  && etag === jsonLastModified) {
      res.statusCode = 304;  // Resource not modified.
      res.end();
      return true;
    } else {
      res.setHeader('ETag', jsonLastModified);
    }
  }
  return false;
}

function deleteIfDeadFile(err, path) {
  if (err.code === 'ENOENT') {
    fs.removeMeta(path);
  }
}

function sendApp(app, path, req, res, meta, permission) {
  var depthh = req.headers.depth, depth;
  if (depthh === 'infinity') { depth = Infinity; }
  else if (depthh === undefined) { depth = -1; }
  else { depth = +depthh; }
  var user = req.user? req.user.name: undefined;

  // We only allow apps that are in /app/ and in the user metadata allowedApps.
  var authorizedApp = (app[0] !== '/') || app.startsWith('/app/') ||
    (req.user != null && req.user.meta != null &&
      (req.user.meta.allowedApps instanceof Array) &&
      req.user.meta.allowedApps.includes(app));
  if (req.user !== undefined && !authorizedApp) { app = 'data'; }

  if (app === 'data') {
    res.setHeader('Content-Type', meta.type);
    // Prevent allowing a script to load private information.
    // (Ideally we would want to prevent sending credentials instead.)
    res.setHeader('Content-Security-Policy', "connect-src 'none'");
    if (!httpCached(req, res, meta.modified)) {
      fs.getStream(path, {depth: depth, user: user}).then(function(stream) {
        stream.pipe(res.compressed()); })
      .catch(function(err) { deleteIfDeadFile(err, path); error(err, res); });
    }
  } else if (app === 'metadata') {
    if (!ownerAccess.test(permission)) { denyAccess(res); return; }
    if (!httpCached(req, res, meta.updated)) { res.json(meta); }
  } else {
    if (app[0] !== '/') { app = '/app/' + app; }
    fs.metaGet(['params'], app, meta)
    .then(function(paramKeys) {
      paramKeys = paramKeys || [];
      log('\tusing ' + app, paramKeys);
      Promise.all(paramKeys.map(function(field) {
        if (field === 'data') {
          return fs.get(path, {depth: 0, user: user})
          .then(function(content) {
            if (meta.type === 'text' || meta.type.slice(0, 5) === 'text/') {
              return Promise.resolve(String(content));
            } else if (meta.type === 'folder' ||
              meta.type.slice(0, 7) === 'folder/') {
              return Promise.resolve(JSON.parse(String(content)));
            } else {
              return Promise.resolve(content.toString('base64'));
            }
          }).catch(function(err) { deleteIfDeadFile(err, path); error(err, res); });
        } else if (field === 'metadata') {
          if (ownerAccess.test(permission)) { return meta;
          } else { return {type: meta.type, updated: meta.updated}; }
        } else if (field[0] === '/') {
          // FIXME: look up metadata in the file metadata, then user dir.
          return fs.metaGet(field, path, meta);
        }
      }))
      .then(function(paramValues) {
        var params = Object.create(null);
        var templateData = Object.create(null);
        params.path = templateData.path = path;
        params.user = templateData.user = {name: user? req.user.name: undefined};
        params.permission = templateData.permission = permission;
        params.metadata = {type: meta.type, updated: meta.updated};
        addSpecialAppsTemplateData(app, templateData, req.user);
        for (var i = 0; i < paramValues.length; i++) {
          params[paramKeys[i]] = templateData[paramKeys[i]] = paramValues[i];
        }
        templateData.params = params;
        return templateData;
      })
      .then(function(templateData) {
        var appPage = app + '/page.html';
        // We only trust root apps with the power to execute templates.
        if (app.startsWith('/app/')) {
          var appRealPath = fs.realFromVirtual(appPage);
          var appTemplate = camp.template(appRealPath);
          res.template(templateData, appTemplate);
        } else {
          if (!httpCached(req, res, meta.modified)) {
            fs.getStream(appPage, {user: user}).then(function(stream) {
              stream.pipe(res.compressed()); })
            .catch(function(err) { error(err, res); });
          }
        }
      }).catch(function(err) { error(err, res); });
    }).catch(function(err) { error(err, res); });
  }
};

var safePath = exports.safePath = function safePath(path) {
  path = path.replace(/(\/|^)(\.\.?(\/|$))+/g, '/');
  if (path.length > 1) { path = path.replace(/\/$/, ''); }
  return path;
};

function addSpecialAppsTemplateData(app, templateData, user) {
  if (app === '/app/account') {
    templateData.loggedIn = user !== undefined;
    templateData.user.email = user? user.email: undefined;
  }
  // appAuth. See https://thefiletree.com/espadrine/post/identity.md
  //var hmac = crypto.createHmac('sha256', user.secret);
  //hmac.update(app);
  //var hash = base64url.fromBase64(hmac.digest('base64'));
  //templateData.appAuthHeader = `${app} hmac-sha256 ${hash}`;
}

function denyAccess(res) {
  log.error("Access denied");
  // We don't want users to be able to tell which page exists,
  // so that they cannot get information from other users' paths.
  pageNotFound(res);
}

function pageNotFound(res) {
  res.statusCode = 404;
  res.end("Page not found or access denied\n");
}

// Validates access to the path.
// Call cb(function(meta, permission)) if the authorization was valid.
function authorize(path, req, res, cb) {
  fs.meta(path).then(function(meta) {
    if (meta === undefined) { if (res) { pageNotFound(res); } return; }
    fs.permission(path, req.user? req.user.name: undefined)
    .then(function(permission) {
      if (permission === "-") { if (res) { denyAccess(res); }
      } else { cb(meta, permission); }
    }).catch(function(err) { error(err, res); });
  }).catch(function(err) { error(err, res); });
};

function logHttpRequest(req, path) {
  var timer = Object.keys(req.env.timer)
    .map(function(key) { return `${key}: ${req.env.timer[key]} ms`; })
    .join('; ');
  log(`${req.method} ${path}${req.user? ` as ${req.user.name}`: ''} (${timer})`);
}

var writeAccess = /^[wx]$/;
var ownerAccess = /^x$/;

// Main entry point for request treatment.
exports.resolve = function resolveApp(req, res) {
  var app = req.data.app;
  var op = req.data.op;
  var path = safePath(req.path);
  var timerStart = process.hrtime();
  res.on('close', function() {
    var timerEnd = process.hrtime(timerStart);
    req.env.timer.req = timerEnd[0] / 1e3 + timerEnd[1] / 1e6;
    logHttpRequest(req, path);
  });

  if (req.method === 'GET' || req.method === 'POST') {
    authorize(path, req, res, function(meta, permission) {
      if (op === undefined) {
        if (app !== undefined) {
          sendApp(app, path, req, res, meta, permission);
        } else {
          new Promise(function(resolve, reject) {
            if (meta.app !== undefined) {
              resolve(meta.app);
            } else {
              type = meta.type || 'binary';
              var genericType = type;
              var is = type.indexOf('/');  // index of first slash.
              if (is >= 0) { genericType = type.slice(0, is); }
              fs.metaFind(['apps', type], path,
                {meta: meta, or: [['apps', genericType]]})
              .then(resolve).catch(reject);
            }
          }).then(function(appPath) {
            if (appPath === undefined) { appPath = 'data'; }
            sendApp(appPath, path, req, res, meta, permission);
          }).catch(function(err) { error(err, res); });
        }

      } else if (op === 'append') {
        if (req.form !== undefined) {
          if (req.form.error) { unloggedError(req.form.error, res, 400); return; }
          Promise.all(req.files.content.map(function(file) {
            return fs.moveToFolder(file.path, path + '/' + file.name);
          })).then(function() { success(null, res); })
          .catch(function(err) { error(err, res); });
        } else {
          // FIXME: append req.body to file.
          error(null, res, 501);
        }
      }
    });
  } else if (req.method === 'PUT') {
    var body = '';
    req.on('data', function(chunk) { body += String(chunk); });
    req.on('error', function(err) { error(err, res); });
    req.on('end', function() {
      if (app === 'metadata') {
        authorize(path, req, res, function(meta, permission) {
          if (!ownerAccess.test(permission)) { denyAccess(res); return; }
          try { var meta = JSON.parse(body); } catch (e) {
            unloggedError(e, res, 400); return; }
          fs.updateMeta(path, meta).then(function() { success(null, res, 204); })
          .catch(function(err) { error(err, res); });
        });
      } else {
        authorize(pathLib.dirname(path), req, res, function(meta, permission) {
          if (!writeAccess.test(permission)) { denyAccess(res); return; }
          fs.create(path, {body: body}).then(function() { success(null, res, 201); })
          .catch(function(err) { error(err, res); });
        });
      }
    });
  } else if (req.method === 'MKCOL') {
    authorize(pathLib.dirname(path), req, res, function(meta, permission) {
      if (!writeAccess.test(permission)) { denyAccess(res); return; }
      fs.create(path, {type: 'folder'}).then(function() { success(null, res, 201); })
      .catch(function(err) { error(err, res); });
    });
  } else if (req.method === 'DELETE') {
    authorize(path, req, res, function(meta, permission) {
      if (!writeAccess.test(permission)) { denyAccess(res); return; }
      fs.remove(path).then(function() { success(null, res, 204); })
      .catch(function(err) { error(err, res); });
    });
  } else { unloggedError(new Error("Invalid request"), res, 400); }
};

var textWebSocketServers = new Map();
var editAutosaveInterval = 5000;  // milliseconds.
exports.websocket = function handleWebsocket(req, socket, head) {
  log('WEBSOCKET', req.url);
  var url = urlLib.parse(req.url, true);
  var urlPath;
  try {
    urlPath = decodeURIComponent(url.pathname);
  } catch(e) { return; }
  var app = url.query.app;
  var op = url.query.op;
  var path = safePath(urlPath);

  Camp.augmentReqRes(req, {}, camp);
  authenticate(req, undefined, function() {
    authorize(path, req, undefined, function(metadata, permission) {
      if (op === 'edit' && app === 'text') {
        // Get the data at that path.
        fs.get(path).then(function(buf) {
          var data = buf.toString();
          var servers = textWebSocketServers.get(path);
          var wsServer, canopServer;
          if (servers !== undefined) {
            wsServer = servers.wsServer;
            canopServer = servers.canopServer;
            saveFile = servers.saveFile;
            autosaveTimer = servers.autosaveTimer;
          } else {
            wsServer = new WebSocket.Server({noServer: true});
            canopServer = new canop.Server({data, base: metadata.revision});
            var dirtyFile = false;  // Is the data not saved on disk?
            canopServer.on('change', function() { dirtyFile = true; });
            var saveFile = function() {
              if (wsServer && dirtyFile) {
                fs.put(path, canopServer.data,
                  {metadata: {revision: canopServer.base}})
                .then(function() {
                  dirtyFile = false;
                  log("Saved " + path + " to disk.");
                  canopServer.signal({saved: canopServer.canonMark()});
                }).catch(function(err) {
                  log.error("Unable to save actively edited " + path + ":",
                    err);
                });
              }
            };
            // Autosave the edited data.
            var autosaveTimer = setInterval(saveFile, editAutosaveInterval);
            textWebSocketServers.set(path,
              {wsServer, canopServer, saveFile, autosaveTimer});
          }

          wsServer.handleUpgrade(req, socket, head, function(ws) {
            // FIXME: add readonly support in Canop, and set as readonly if the
            // client doesn't have write access.
            var writeAccessReceive = function(receive) {
              ws.on('message', receive);
            };
            var readOnlyReceive = function(receive) {
              ws.on('message', function(message) {
                try {
                  var protocol = canopServer.readProtocol(message);
                } catch(e) { console.log(e); return; }
                if ([0, 3, 6].includes(protocol[0])) { receive(message); }
                else console.log(protocol[0]);
              });
            };
            var client = {
              send: function(msg) { ws.send(msg); },
              onReceive: writeAccess.test(permission)?
                writeAccessReceive: readOnlyReceive,
            };
            canopServer.addClient(client);
            ws.on('close', function() {
              canopServer.removeClient(client);
              if (wsServer.clients.length <= 0) {
                // Clean up the (now empty) server.
                textWebSocketServers.delete(path);
                clearInterval(autosaveTimer);
                saveFile();
                wsServer.close();
              }
            });
          });
        }).catch(function(err) { log.error(err); });
      } else { log.error("Invalid WebSocket request"); }
    });
  });
};
