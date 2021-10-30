// Read configuration data.
var fs = require('fs');

try {
  var conf = require('../admin/private/env.json');
} catch(e) {
  var conf = {};
}

try {
  conf.pg.ssl.ca = fs.readFileSync(conf.pg.ssl.ca).toString();
} catch(e) {
  conf.pg.ssl = false;
}

// website
conf.website = (conf.http.secure? 'https': 'http') + '://' +
  conf.http.host +
  (/^80|443$/.test(conf.http.port)? '': (':' + conf.http.port));

module.exports = conf;
