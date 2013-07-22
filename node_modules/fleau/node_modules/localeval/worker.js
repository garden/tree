onmessage = function(m) {
  postMessage({
    result: leaklessEval(m.data.code, m.data.sandbox)
  });
};


// Do not change what is below without changing localeval.js
//


// Produce the code to shadow all globals in the environment
// through lexical binding.
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
      reset += sym + ',';
    }
  }
  reset += 'undefined;';
  return reset;
}

// Given a constructor function, do a deep copy of its prototype
// and return the copy.
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

// Keep in store all real builtin prototypes to restore them after
// a possible alteration during the evaluation.
var builtins = [Object, Function, Array, String, Boolean, Number, Date, RegExp, Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError];
var realProtos = new Array(builtins.length);
for (var i = 0; i < builtins.length; i++) {
  realProtos[i] = dupProto(builtins[i]);
}

// Fake all builtins' prototypes.
function alienate() {
  for (var i = 0; i < builtins.length; i++) {
    redirectProto(builtins[i], dupProto(builtins[i]));
  }
}

// Restore all builtins' prototypes.
function unalienate() {
  for (var i = 0; i < builtins.length; i++) {
    redirectProto(builtins[i], realProtos[i]);
  }
}

// Evaluate code as a String (`source`) without letting global variables get
// used or modified. The `sandbox` is an object containing variables we want
// to pass in.
function leaklessEval(source, sandbox) {
  sandbox = sandbox || Object.create(null);
  var sandboxName = '$sandbox$';
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

