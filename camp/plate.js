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
Plate.format = function (text, literal) {
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

  var span = text.slice (boundaries[0] + 3, boundaries[1] - 1),
      macro = text[boundaries[0] + 2];

  if (!macro) { return text; }

  // Fragment the parameters.
  var params = [];
  var semi = span.indexOf (';');
  var prevpipe = pipe = 0;
  while ((pipe = span.indexOf ('|', pipe)) > -1
         && (semi>0? pipe < semi: true)) {
    params.push (span.slice (prevpipe, pipe));
    prevpipe = (pipe ++) + 1;
  }
  if (semi > 0) {
    params.push (span.slice (prevpipe, semi));
    prevpipe = semi+1;
  }
  params.push (span.slice (prevpipe));
  ///console.log (params);

  // Call the macro.
  var result = Plate._escape (text.slice (0, boundaries[0]));
  try {
    result += Plate._escape (Plate.macros[macro] (literal, params))
  } catch (e) {
    console.error ('Template error: macro "' + macro + '" didn\'t work.\n' +
        'Data processed up to error:\n' + result);
    console.error ('"' + e.message + '"');
    console.error ('Parameters given to macro:', params);
    console.error ('Literal:', literal);
  }
  result += ((boundaries[1]+=1) > text.length? '':
      Plate.format (text.slice (boundaries[1]), literal));
  return result;
};

// Helper function to parse simple expressions.
// Can throw pretty easily if the template is too complex.
Plate.value = function (literal, strval) {
  strval = strval.replace (
      /([a-zA-Z$_][a-zA-Z$_0-9]*(\.[a-zA-Z$_][a-zA-Z$_0-9]*)*)/g
      , 'literal.$1');
  var val;
  try { val = eval ('('+ strval +')'); } catch(e) {
    console.error ('Template error: literal ' + JSON.stringify (strval) +
                 ' is missing.');
    return '';
  }
  return val;
};

Plate.macros = {
  '=': function (literal, params) {
    var parsedtext = Plate.value (literal, params[0]),
        parsercalls = params.slice(1).map(function(el) {return el.split(' ');}),
        parsers = parsercalls.map(function(el) {return el[0];}),
        parsersparams = parsercalls.map(function(el) {return el.slice(1);});
    for (var i = 0; i < parsers.length; i++) {
      if (Plate.parsers[parsers[i]] === undefined) {
        console.error ('Template error: parser ' + parsers[i] + ' is missing.');
        return '';
      }
      parsedtext = Plate.parsers[parsers[i]] (parsedtext, parsersparams[i]);
    }
    return parsedtext;
  },
  '?': function (literal, params) {
    var val = Plate.value (literal, params[0]);
    if (val) {
      return params[1];
    } else return params[2]? params[2]: '';
  },
  '-': function (literal, params) {
    var val = Plate.value (literal, params[0]);
    if (val === undefined) {
      console.error ('Template error: literal ' + JSON.stringify (params[0]) +
                   ' is missing.');
      return '';
    }
    var list = '';
    var newliteral = literal;
    for (var i in val) {
      newliteral[params[1]] = val[i];
      newliteral[params[2]] = i;
      list += Plate.format (params[3], literal);
    }
    return list;
  },
  '#': function () { return ''; },
  '!': function (literal, params) {
    Plate.macros[params[0]] = Function ('literal', 'params', params[1]);
    return '';
  },
  '~': function (literal, params) {
    return Plate.macros[params[0]] (literal, params.slice (1)) || '';
  }
};

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
exports.macros = Plate.macros;
exports.parsers = Plate.parsers;


})();
