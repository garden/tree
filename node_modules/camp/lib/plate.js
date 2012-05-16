/* plate.js: templating language.
 * Copyright (c) 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
 * Code covered by the LGPL license. */

(function () {




// Api World!
//

Plate = {};

Plate._escape = function (text) {
  return (text? text: '').replace ('{{','{').replace ('}}','}');
};

// Return the boundaries of the next content to substitute,
// as a list containing [index of {{ start, index of }} stop].
function toplevel (text) {
  var state = 0, boundaries = [], bracecount = 0;
  for (var i = 0;  i < text.length;  i++) {
    if (state === 0) {
      // Toplevel.
      if (text[i] === '{')  state = 1;
    } else if (state === 1) {
      // Toplevel, had an opening curly brace.
      if (text[i] === '{' && text[i+1] !== '{') {
        boundaries.push(i-1);
        state = 2;
      } else  state = 0;
    } else if (state === 2) {
      // Inside.
      if (text[i] === '}')  state = 3;
      else if (text[i] === '{')  state = 4;
    } else if (state === 3) {
      // Inside, had a closing curly brace.
      if (text[i] === '}' && text[i+1] !== '}') {
        if (bracecount === 0) {
          boundaries.push(i);
          break; // state = 0;
        } else {
          bracecount--;
          state = 2;
        }
      } else  state = 2;
    } else if (state === 4) {
      // Inside, had an opening curly brace.
      if (text[i] === '{')  bracecount++;
      state = 2;
    }
  }
  return boundaries;
}

// Return an Array of String parameters given to the macro.
// Deals with escapes for | and ;.
function fragparams (span) {
  var params = [], last = 0, param = '';
  for (var i = 0; i < span.length; i++) {
    if (span[i] === '\\') {       // Go to escape state.
      param += span.slice(last, i) + span[i+1];
      i++;
      last = i + 1;
    } else if (span[i] === ';') { // Go to rest state.
      params.push(param + span.slice(last, i));
      last = i + 1;
      break;
    } else if (span[i] === '|') { // New parameter.
      params.push(param + span.slice(last, i));
      last = i + 1;
      param = '';
    }
  }
  params.push(param + span.slice(last));
  return params;
}


// Main entry point.
//
// input and output are two streams, one readable, the other writable.

Plate.format = function (input, output, literal) {
  var text = '';
  input.on ('data', function (data) {
    text += '' + data;
  });
  input.on ('end', function template () {
    Plate.formatString (text, function write (text) {
      output.write(Plate._escape(text));
    }, literal);
    output.end ();
  });
};

Plate.formatString = function (text, write, literal) {
  var boundaries = toplevel (text),
      span = text.slice (boundaries[0] + 3, boundaries[1] - 1),
      macro = text[boundaries[0] + 2],
      params = fragparams(span);    // Fragment the parameters.

  if (!macro) { write (text); return; }

  // Call the macro.
  write (text.slice (0, boundaries[0]));
  try {
    Plate.macros[macro] (write, literal, params);
  } catch (e) {
    console.error ('Template error: macro "' + macro + '" didn\'t work.\n');
    console.error ('"' + e.message + '"');
    console.error ('Parameters given to macro:', params);
    console.error ('Literal:', literal);
  }
  if ((boundaries[1] += 1) <= text.length) {
    Plate.formatString (text.slice (boundaries[1]), write, literal);
  }
};

// Helper function to parse simple expressions.
// Can throw pretty easily if the template is too complex.
// Also, using variables is a lot faster.
Plate.value = function (literal, strval) {
  try {
    // Special-case faster, single variable access lookups.
    if (/^[a-zA-Z_\$]+$/.test(strval)) {
      return literal[strval];
    } else {
      // Putting literal in the current scope.  Ugly as hell.
      var evalLiteral = "";
      for (var field in literal) {
        evalLiteral += "var " + field + " = literal['" + field + "'];";
      }
      return eval (evalLiteral + '('+ strval +');');
    }
  } catch(e) {
    console.error ('Template error: literal ' + JSON.stringify (strval) +
                   ' is missing.\n', e);
    return '';
  }
  return strval;
};

Plate.macros = {
  '=': function (write, literal, params) {
    // Displaying a variable.
    var parsedtext = Plate.value (literal, params[0]),
        parsercalls = params.slice(1).map(function(el) {return el.split(' ');}),
        parsers = parsercalls.map(function(el) {return el[0];}),
        parsersparams = parsercalls.map(function(el) {return el.slice(1);});
    for (var i = 0; i < parsers.length; i++) {
      if (Plate.parsers[parsers[i]] === undefined) {
        console.error ('Template error: parser ' + parsers[i] + ' is missing.');
        return;
      }
      parsedtext = Plate.parsers[parsers[i]] (parsedtext, parsersparams[i]);
    }
    write (parsedtext);
  },
  '?': function (write, literal, params) {
    // If / then [ / else ].
    var val = Plate.value (literal, params[0]);
    if (val) {
      Plate.formatString(params[1], write, literal);
    } else if (params[2]) Plate.formatString(params[2], write, literal);
  },
  '-': function (write, literal, params) {
    // Iterate through an object / an array / a string.
    var val = Plate.value (literal, params[0]);
    if (val === undefined) {
      console.error ('Template error: literal ' + JSON.stringify (params[0]) +
                   ' is missing.');
      return;
    }
    var newliteral = literal;
    for (var i in val) {
      newliteral[params[1]] = val[i];
      newliteral[params[2]] = i;
      Plate.formatString (params[3], write, literal);
    }
  },
  '#': function () {},  // Comment.
  '<': function (write, literal, params) {
    // Loading another template.
    // The fact that this exists is only used as an example that this is wrong.
    if (require && typeof require === 'function') {
      var fs = require('fs');
      if (fs && fs.readFileSync) {
        var file = params[0].trim();
        Plate.formatString (fs.readFileSync(file, 'utf8'), write, literal);
      }
    }
    return '';
  },
  '!': function (write, literal, params) {
    // Add a macro from inside a template.
    Plate.macros[params[0]] = Function ('write','literal','params', params[1]);
  },
  '~': function (write, literal, params) {
    // Use a named macro.
    write (Plate.macros[params[0]] (write, literal, params.slice (1))
                  || '');
  }
};
Plate.macros['for'] = Plate.macros['-'];    // Useful alias.

Plate.parsers = {
  'plain': function (text) { return text; },
  'html': function (text) {
    return text.replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;');
  },
  'xml': function (text) {
    return text.replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;');
  },
  'xmlattr': function (text) {
    return text.replace (/&/g,'&amp;').replace (/</g,'&lt;')
               .replace (/>/g,'&gt;').replace (/'/g,'&apos;')
               .replace (/"/g,'&quot;');
  },
  'uri': function (text) {
    return encodeURI (text);
  },
  '!uri': function (text) {
    return decodeURI (text);
  },
  'jsonstring': function (text) {
    // FIXME: does someone have an idea on how to handle unicode?
    return text.replace (/\\/g,'\\\\').replace (/"/g,'\\"')
               .replace (/\n/g,'\\n').replace (/\f/g,'\\f')
               .replace (/\r/g,'\\r').replace (/\t/g,'\\t')
               .replace (RegExp('\b','g'),'\\b');
  },
  'json': function (text, indent) {
    return JSON.stringify (text, null, +indent[0]);
  },
  'integer': function (integer) {
    return typeof integer == 'number'? integer.toFixed (0): '';
  },
  'intradix': function (intradix, radix) {
    return typeof intradix == 'number'?
      intradix.toString (parseInt (radix[0])):'';
  },
  'float': function (floating, fractionDigits) {
    return typeof floating == 'number'?
        floating.toFixed (parseInt (fractionDigits[0])): '';
  },
  'exp': function (exp, fractionDigits) {
    return typeof exp == 'number'?
        exp.toExponential (parseInt (fractionDigits[0])): '';
  }
};


// Exportation World!
//

exports.format = Plate.format;
exports.formatString = Plate.formatString;
exports.macros = Plate.macros;
exports.parsers = Plate.parsers;


})();
