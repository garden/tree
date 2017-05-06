// Map paths to apps.
// The following code is covered by the AGPLv3 license.

var fs = require('./fs');
var WebSocket = require('ws');
var canop = require('canop');
var urlLib = require('url');
var camp;
exports.main = function (server) {
  camp = server;
  fs.initAutosave();
};

function error(err, res, code) {
  console.error(err);
  unloggedError(err, res, code);
}

function unloggedError(err, res, code) {
  res.statusCode = code || 500;
  res.end('Internal server error\n');
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

function sendApp(app, path, req, res, meta) {
  var depthh = req.headers.depth, depth;
  if (depthh === 'infinity') { depth = Infinity; }
  else if (depthh === undefined) { depth = -1; }
  else { depth = +depthh; }

  if (app === 'data') {
    res.setHeader('Content-Type', meta.type);
    if (!httpCached(req, res, meta.modified)) {
      fs.getStream(path, {depth: depth}).then(function(stream) {
        stream.pipe(res.compressed()); })
      .catch(function(err) { error(err, res); });
    }
  } else if (app === 'metadata') {
    if (!httpCached(req, res, meta.updated)) { res.json(meta); }
  } else {
    if (app[0] !== '/') { app = '/app/' + app; }
    // TODO: verify that the app is authorized.
    fs.metaGet(['params'], app, meta)
    .then(function(paramKeys) {
      paramKeys = paramKeys || [];
      console.log('\tusing ' + app, paramKeys);
      Promise.all(paramKeys.map(function(field) {
        if (field === 'data') {
          return fs.get(path, {depth: 0})
          .then(function(content) {
            if (meta.type === 'text' || meta.type.slice(0, 5) === 'text/') {
              return Promise.resolve(String(content));
            } else if (meta.type === 'folder' ||
              meta.type.slice(0, 7) === 'folder/') {
              return Promise.resolve(JSON.parse(String(content)));
            } else {
              return Promise.resolve(content.toString('base64'));
            }
          })
        } else if (field === 'metadata') {
          return meta;
        } else if (field[0] === '/') {
          return fs.metaFind(field, path, meta);
        }
      }))
      .then(function(paramValues) {
        var params = Object.create(null);
        var templateData = Object.create(null);
        addSpecialAppsTemplateData(app, templateData, req.user);
        params.path = templateData.path = path;
        for (var i = 0; i < paramValues.length; i++) {
          params[paramKeys[i]] = templateData[paramKeys[i]] = paramValues[i];
        }
        templateData.params = params;
        return templateData;
      })
      .then(function(templateData) {
        var appRealPath = fs.realFromVirtual(app + '/page.html');
        var appTemplate = camp.template(appRealPath);
        res.template(templateData, appTemplate);
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
    templateData.user = user;
  }
  // TODO: add appAuth.
  templateData.appAuth = '';
}

exports.resolve = function resolveApp(req, res) {
  var app = req.data.app;
  var op = req.data.op;
  var path = safePath(req.path);
  console.log(req.method + ' ' + path);

  if (req.method === 'GET' || req.method === 'POST') {
    if (op === undefined) {
      fs.meta(path)
      .then(function(meta) {
        if (app !== undefined) {
          sendApp(app, path, req, res, meta);
        } else {
          new Promise(function(resolve, reject) {
            if (meta.app !== undefined) {
              resolve(meta.app);
            } else {
              fs.metaGet(['type'], path, meta)
              .then(function(type) {
                type = type || 'binary';
                var genericType = type;
                var is = type.indexOf('/');  // index of first slash.
                if (is >= 0) { genericType = type.slice(0, is); }
                fs.metaFind(['apps', type], path,
                    {meta: meta, or: [['apps', genericType]]})
                .then(resolve).catch(reject);
              }).catch(reject);
            }
          }).then(function(appPath) {
            if (appPath === undefined) { appPath = 'data'; }
            sendApp(appPath, path, req, res, meta);
          }).catch(function(err) { error(err, res); });
        }
      }).catch(function(err) { error(err, res); });

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
  } else if (req.method === 'PUT') {
    var body = '';
    req.on('data', function(chunk) { body += String(chunk); });
    req.on('error', function(err) { error(err, res); });
    req.on('end', function() {
      if (app === 'metadata') {
        try { var meta = JSON.parse(body); } catch (e) {
          unloggedError(e, res, 400); return; }
        fs.updateMeta(path, meta).then(function() { success(null, res, 204); })
        .catch(function(err) { error(err, res); });
      } else {
        fs.create(path, {body: body}).then(function() { success(null, res, 201); })
        .catch(function(err) { error(err, res); });
      }
    });
  } else if (req.method === 'MKCOL') {
    fs.create(path, {type: 'folder'}).then(function() { success(null, res, 201); })
    .catch(function(err) { error(err, res); });
  } else if (req.method === 'DELETE') {
    fs.remove(path).then(function() { success(null, res, 204); })
    .catch(function(err) { error(err, res); });
  } else { unloggedError(new Error("Invalid request"), res, 400); }
};

var textWebSocketServers = new Map();
var editAutosaveInterval = 5000;  // milliseconds.
exports.websocket = function handleWebsocket(req, socket, head) {
  console.log('WEBSOCKET', req.url);
  var url = urlLib.parse(req.url, true);
  var urlPath;
  try {
    urlPath = decodeURIComponent(url.pathname);
  } catch(e) { return; }
  var app = url.query.app;
  var op = url.query.op;
  var path = safePath(urlPath);

  if (op === 'edit' && app === 'text') {
    // Get the data at that path.
    Promise.all([fs.get(path), fs.meta(path)])
    .then(function([buf, metadata]) {
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
              console.log("Saved " + path + " to disk.");
            }).catch(function(err) {
              console.error("Unable to save actively edited " + path + ":",
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
        var client = {
          send: function(msg) { ws.send(msg); },
          onReceive: function(receive) {
            ws.on('message', receive);
          },
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
    }).catch(function(err) { console.error(err); });
  } else { console.error("Invalid WebSocket request"); }
};
