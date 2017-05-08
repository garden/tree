// Read configuration data.

try {
  var conf = require('../private/secrets.json');
} catch(e) {
  var conf = {};
}

module.exports = conf;
