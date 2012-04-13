// test.js: A module for unit tests.
// Copyright (c) 2011 Jan Keromnes, Yann Tyl. All rights reserved.
// Code covered by the LGPL license.

var Test = function () { this.test = []; this.n = 0; this.errors = 0; };

Test.prototype.eq = function (a, b) {
  this.n ++;
  if (a !== b) {
    console.log ('#' + this.n + ' failed: got ' + JSON.stringify (a) +
                                ' instead of ' + JSON.stringify (b));
    this.errors ++;
  }
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

