var camp = require('../lib/camp');
var http = require('http');
var Test = require('./test');
var t = new Test();

// FIXME: is there a good way to make a server get a port for testing?
var server;
var needAServer = true;
var portNumber = 8000;
do {
  try {
    server = camp.start({port:portNumber, documentRoot:'./test/web'});
    needAServer = false;
  } catch(e) { portNumber++; }
} while (needAServer);

t.seq([
  function (next) {
    http.get('http://localhost:' + portNumber, function(res) {
      t.eq(res.httpVersion, '1.1', "Server must be HTTP 1.1.");
      t.eq(res.headers.connection, 'keep-alive',
        "Connection should be keep-alive.");
      t.eq(res.headers['transfer-encoding'], 'chunked',
        "Connection should be chunked by default.");
      res.on('data', function(content) {
        t.eq('' + content, '404',
             "Did not receive content of index.html.");
        next();
      });
    });
  }
], function end() {
  t.tldr();
  process.exit(0);
});

