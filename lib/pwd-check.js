// Check passwords for file access.
// Copyright © 2011-2014 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the AGPLv3 license.

var scrypt = require('scrypt');
var lookup = require('./lookup');

function pwdCheck(file, key, keyName, cb) {
  // Password check.
  lookup(file, {})(keyName, function lookupMade(hash) {
    if (hash != null) {
      if (typeof key !== 'string') {
        return cb(new Error('Give a (string) key `' + keyName + '` '
          + 'in the query to modify ' + file.path + '.'));
      }
      scrypt.verifyHash(hash, key, function(err) {
        if (!!err) {
          cb(new Error('File ' + file.path
              + ' requires the correct ' + keyName + '. '
              + 'Modify `' + keyName
              + '` in the query to match the stored hash.\n' + err));
        } else {
          cb();
        }
      });
    } else {
      cb();
    }
  });
}

module.exports = pwdCheck;
