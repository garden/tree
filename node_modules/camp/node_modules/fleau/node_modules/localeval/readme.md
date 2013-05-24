# Local Eval

Evaluate a string of JS code without access to the global object.

Always use that instead of `eval()`. Always.

API:

    localeval(code :: String, sandbox :: Object) :: Object.

    localeval(code :: String,    sandbox :: Object,
              timeout :: Number, cb :: Function)

The `code` is a string of JS code. The `sandbox` contains objects which are
going to be accessible in the JS code.
It returns the last evaluated piece of JS code in `code`, if no timeout is
given. Otherwise, the callback gives that result as a parameter.

Node example:

```javascript
var localeval = require('localeval');
localeval('console.log("Do I have access to the console?")');  // Throws.
```

Browser example:

```html
<!doctype html><title></title>
<script src='localeval.js'></script>
<!-- Alerts "32". -->
<script> alert(localeval('a + b', {a: 14, b: 18})) </script>
```

# Warning

If no timeout is given, it doesn't protect your single-threaded code against
infinite loops.

You cannot give a timeout in browser code (for now).

That said, it protects against any security leak.

1. All local and global variables are inaccessible.

2. Variables defined while evaluating code don't pollute any scope.

3. Evaluated code cannot fiddle with global object's properties.
   Think
   `localeval('([]).__proto__.push = function(a) { return "nope"; }')`.

# Purpose

Trying to find a reasonable cross-environment ES5 sandbox evaluation function.
