var node_js = typeof exports === 'object';

(function (root, factory) {
  if (typeof exports === 'object') {
    // Node.
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(factory);
  } else {
    // Browser globals (root is window)
    root.localeval = factory().localeval;
  }
}(this, function () {

// Different implementations for browser and node.js.

if (node_js) {

  return function(code, sandbox, timeout, cb) {
    // Optional parameters: sandbox, timeout, cb.
    if (timeout != null) {
      // We have a timeout. Run in separate process.
      var cp = require('child_process');
      var child = cp.fork(__dirname + '/child.js');
      var th = setTimeout(function() {
        child.kill('SIGKILL');
      }, timeout);
      child.on('message', function(m) {
        clearTimeout(th);
        if (cb) { cb(m.result); }
      });
      child.send({ code: code, sandbox: sandbox });

    } else {
      // No timeout. Blocking execution.
      var vm = require('vm');
      return vm.runInNewContext(code, sandbox);
    }
  };

} else {
  // Assume a browser environment.

  function resetEnv(global) {
    var reset = 'var ';
    if (Object.getOwnPropertyNames) {
      var obj = this;
      var globals;
      while (obj !== null) {
        globals = Object.getOwnPropertyNames(obj);
        for (var i = 0; i < globals.length; i++) {
          if (globals[i] !== 'eval') {
            reset += globals[i] + ',';
          }
        }
        obj = Object.getPrototypeOf(obj);
      }
    } else {
      for (var sym in this) {
        reset += globals[i] + ',';
      }
    }
    reset += 'undefined;';
    return reset;
  }

  function dupProto(constructor) {
    var fakeProto = Object.create(null);
    var pnames = Object.getOwnPropertyNames(constructor.prototype);
    for (var i = 0; i < pnames.length; i++) {
      fakeProto[pnames[i]] = constructor.prototype[pnames[i]];
    }
    return fakeProto;
  }

  function redirectProto(constructor, proto) {
    var pnames = Object.getOwnPropertyNames(proto);
    for (var i = 0; i < pnames.length; i++) {
      constructor.prototype[pnames[i]] = proto[pnames[i]];
    }
  }

  var builtins = [Object, Function, Array, String, Boolean, Number, Date, RegExp, Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError];
  var realProtos = new Array(builtins.length);
  for (var i = 0; i < builtins.length; i++) {
    realProtos[i] = dupProto(builtins[i]);
  }

  function alienate() {
    // Fake all builtins' prototypes.
    for (var i = 0; i < builtins.length; i++) {
      redirectProto(builtins[i], dupProto(builtins[i]));
    }
  }

  function unalienate() {
    for (var i = 0; i < builtins.length; i++) {
      redirectProto(builtins[i], realProtos[i]);
    }
  }

  // Evaluate code as a String (`source`) without letting global variables get
  // used or modified. The `sandbox` is an object containing variables we want
  // to pass in.
  function leaklessEval(source, sandbox, sandboxName) {
    sandbox = sandbox || Object.create(null);
    sandboxName = sandboxName || '$sandbox$';
    var sandboxed = 'var ';
    for (var field in sandbox) {
      sandboxed += field + '=' + sandboxName + '["' + field + '"],';
    }
    sandboxed += 'undefined;';
    alienate();
    var ret = Function(sandboxName, resetEnv() + sandboxed + 'return eval(' +
          JSON.stringify(source) + ')').bind(Object.create(null))(sandbox);
    unalienate();
    return ret;
  }

  return {localeval: leaklessEval};

}

}));
