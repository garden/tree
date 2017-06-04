var spawn = require('child_process').spawn;

// Listen to GitHub push events on port 1123
require('http').createServer(function(req, res) {
  if (req.headers['x-github-event'] === 'push') {
    spawn('/home/dom/tree/admin/setup/updator.sh').stdin.end();
  }
  res.end();
}).listen(1123);
