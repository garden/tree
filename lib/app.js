// Map paths to apps.
// The following code is covered by the AGPLv3 license.

var fs = require('./fs');
var camp;
exports.main = function (server) { camp = server; };

function error(err, res, code) {
  code = code || 500;
  console.error(err);
  res.statusCode = code;
  res.end('Internal server error\n');
}

function sendApp(app, path, req, res, meta) {
  var depthh = req.headers.depth, depth;
  if (depthh === 'infinity') { depth = Infinity; }
  else if (depthh === undefined) { depth = -1; }
  else { depth = +depthh; }

  if (app === 'data') {
    res.setHeader('Content-Type', meta.type);
    fs.getStream(path, {depth: depth}).then(function(stream) { stream.pipe(res); })
    .catch(function(err) { error(err, res); });
  } else if (app === 'metadata') {
    res.json(meta);
  } else {
    if (app[0] !== '/') { app = '/app/' + app; }
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
        params.path = path;
        for (var i = 0; i < paramValues.length; i++) {
          params[paramKeys[i]] = paramValues[i];
        }
        return params;
      })
      .then(function(params) {
        var appRealPath = fs.realFromVirtual(app + '/page.html');
        var appTemplate = camp.template(appRealPath);
        res.template(params, appTemplate);
      }).catch(function(err) { error(err, res); });
    }).catch(function(err) { error(err, res); });
  }
};

var safePath = exports.safePath = function safePath(path) {
  path = path.replace(/(\/|^)(\.\.?(\/|$))+/g, '/');
  if (path.length > 1) { path = path.replace(/\/$/, ''); }
  return path;
};

exports.resolve = function resolveApp(req, res) {
  var app = req.data.app;
  var op = req.data.op;
  var path = safePath(req.path);
  console.log(req.method + ' ' + path);

  if (req.method === 'GET' || req.method === 'POST') {
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
              var genericType = type;
              var is = type.indexOf('/');  // index of first slash.
              if (is >= 0) { genericType = type.slice(0, is); }
              fs.metaFind(['apps', type], path,
                  {meta: meta, or: [['apps', genericType]]})
              .then(resolve).catch(reject);
            }).catch(reject);
          }
        }).then(function(appPath) {
          if (appPath !== undefined) {
            sendApp(appPath, path, req, res, meta);
          } else {
            fs.getStream(path).then(function(stream) { stream.pipe(res); });
          }
        }).catch(function(err) { error(err, res); });
      }
    }).catch(function(err) { error(err, res); });
  } else { error(new Error("Invalid request"), res, 400); }
};
