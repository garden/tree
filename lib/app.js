// Map paths to apps.
// The following code is covered by the AGPLv3 license.

var fs = require('./fs');
var camp;
exports.main = function (server) { camp = server; };

function error(err, res) {
  console.error(err);
  res.statusCode = 500;
  res.end('Internal server error\n');
}

function sendApp(app, path, res, meta) {
  if (app === 'data') {
    fs.getStream(path).then(function(stream) { stream.pipe(res); })
    .catch(function(err) { error(err, res); });
  } else if (app === 'metadata') {
    fs.meta(path).then(function(meta) { res.json(meta); })
    .catch(function(err) { error(err, res); });
  } else {
    if (app[0] !== '/') { app = '/app/' + app; }
    fs.metaGet(['params'], app, meta)
    .then(function(paramKeys) {
      paramKeys = paramKeys || [];
      console.log('\tusing ' + app, paramKeys);
      Promise.all(paramKeys.map(function(field) {
        if (field === 'data') {
          return fs.get(path)
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
  path = path.replace(/\/$/, '');
  return path;
};

exports.resolve = function resolveApp(req, res) {
  var app = req.data.app;
  var op = req.data.op;
  var path = safePath(req.path);
  console.log(req.method + ' ' + path);
  var meta;
  if (app !== undefined) {
    sendApp(app, path, res, meta);
  } else {
    fs.meta(path)
    .then(function(metadata) {
      meta = metadata;
      if (meta.app !== undefined) {
        return meta.app;
      } else {
        return fs.metaGet(['type'], path, meta)
        .then(function(type) {
          var genericType = type;
          var is = type.indexOf('/');  // index of first slash.
          if (is >= 0) { genericType = type.slice(0, is); }
          return fs.metaFind(['apps', type], path,
              {meta: meta, or: [['apps', genericType]]})
        });
      }
    })
    .then(function(appPath) {
      if (appPath !== undefined) {
        sendApp(appPath, path, res, meta);
      } else {
        fs.getStream(path).then(function(stream) { stream.pipe(res); });
      }
    })
    .catch(function(err) { error(err, res); });
  }
};
