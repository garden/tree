// Redirect all traffic from HTTP to HTTPS
const path = require('path');
const fs = require('fs');
require('http').createServer(function(req, res){
  // Let’s encrypt: it won't work on TLS if the certificate is expired,\
  // so we cannot redirect to TLS.
  if (req.url.startsWith('/.well-known/')) {
    fs.readFile(path.join('../.well-known/', safePath(req.url)), (err, data) => {
      if (err) { res.statusCode = 404; res.end('Page not found\n'); return; }
      res.end(data);
    });
    return;
  }

  res.writeHead(301, {'Location': 'https://' + req.headers.host + req.url});
  res.end();
}).listen(80);

function safePath(url) {
  return path.normalize(url.replace('/.well-known/', '')).replace(/^(\.\.(\/|\\|$))+/, '');
}
