// Redirect all traffic from HTTP to HTTPS
require('http').createServer(function(req, res){
  res.writeHead(301, {'Location': 'https://' + req.headers.host + req.url});
  res.end();
}).listen(80);
