// Read configuration data.

try {
  var conf = require('../admin/private/secrets.json');
} catch(e) {
  var conf = {};
}

module.exports = conf;
