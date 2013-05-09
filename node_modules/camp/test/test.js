// test.js: A module for unit tests.
// Copyright © 2011-2013 Thaddee Tyl, Jan Keromnes. All rights reserved.
// Code covered by the LGPL license.

var Test = function () { this.n = 0; this.errors = 0; };

// Deep inequality.
function notEqual(a, b) {
  if (a instanceof Array || a instanceof Object) {
    if (typeof a === typeof b) {
      for (var key in a) {
        if (notEqual(a[key], b[key])) {
          return true;
        }
      }
      for (var key in b) {
        if (notEqual(a[key], b[key])) {
          return true;
        }
      }
      return false;
    } else {
      return true;
    }
  } else {
    return a !== b;
  }
}

Test.prototype.eq = function (a, b, msg) {
  this.n ++;
  if (notEqual(a, b)) {
    console.log ('#' + this.n + ' failed: got ' + JSON.stringify (a) +
                                ' instead of ' + JSON.stringify (b));
    if (msg) {
      console.log (msg.split('\n').map(function(e){return '  '+e;}).join('\n'));
    }
    this.errors ++;
  }
};

Test.prototype.each = function (tests, result) {
  var len = tests.length;
  var i = tests.length;
  function endTest () {
    i++;
    // When all tests have been performed…
    if (i === len) { result (); }
  }
  for (var j = 0; j < tests.length; j++) {
    tests[j] (endTest);
  }
};

Test.prototype.seq = function (tests, result) {
  var len = tests.length;
  var i = 0;
  function endTest() {
    i++;
    // When all tests have been performed…
    if (i === len) { result (); }
    else { tests[i] (endTest); }
  }
  tests[i] (endTest);
};

Test.prototype.tldr = function () {
  if (this.errors === 0) { console.log ('All ' + this.n + ' tests passed.');
  } else if (this.errors === this.n) { console.log ('All tests failed.');
  } else {
    console.log ((this.n - this.errors) + ' tests passed out of ' +
                 this.n + ' (' +
                 (100 * (1 - this.errors/this.n)).toFixed (2) + '%).');
  }
};

Test.prototype.exit = function () {
  process.exit((this.errors > 0)? 1: 0);
};

module.exports = Test;

