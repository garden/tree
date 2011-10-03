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
  var opencurl = /(?:^|[^\{])\{\{[^\{]/,
      closecurl = /(?:^|[^\}])\}\}(?!\})/;

  // Find the first {{ there is.
  var operation = opencurl.exec (text);
  if (operation === null) { return Plate._escape (text); }
  if (operation[0].length > 3) {
    operation.index ++;
    operation[0] = operation[0].slice (1);
  }
  var firstcurl = operation.index,
      nextcurl;

  var matchbraces = function () {
    // Find the next }} there is after that.
    nextcurl = closecurl.exec (text.slice (firstcurl)).index+1 + firstcurl;

    // Count the number of {{ in between.
    var countopencurl = 0;
    while ((firstcurl = (opencurl.exec (text.slice (firstcurl+2)) !== null?
                         opencurl.exec (text.slice (firstcurl+2)).index+1
                         + firstcurl+2: 0))
           < nextcurl  &&  firstcurl > operation.index) {
      countopencurl ++;
    }

    // Skip as many }}.
    for (var i=0;  i < countopencurl;  i++) {
      nextcurl = closecurl.exec (text.slice (nextcurl+2)).index+1 +
          nextcurl+2;
    }
  };
  try {
    matchbraces ();
  } catch (e) {
    // There is a mismatch.
    console.error ('Template error: closing tag }} mismatch.\n' +
        'That might not be recoverable.\n' +
        'Corresponding data:\n' + text.slice (firstcurl));
    var recoveredtext = text.slice (firstcurl).replace ('}','}}');
    text = text.slice (0,firstcurl) + recoveredtext;
    console.error ('Recovered data:\n' + recoveredtext);
    try {
      matchbraces ();
    } catch (e) {
      // Undo the modification
      recoveredtext = text.slice (firstcurl).replace ('}}','}');
      text = text.slice (0,firstcurl) + recoveredtext;
      console.error ('Closing tag }} mismatch unrecoverable.');
      return text;
    }
  }

  var span = text.slice (operation.index + 3, nextcurl);
  ///console.log (span);

  // Use macro.
  var macro = operation[0][2];

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
  var result = Plate._escape (text.slice (0, operation.index));
  try {
    result += Plate._escape (Plate.macros[macro] (literal, params))
  } catch (e) {
    console.error ('Template error: macro "' + macro + '" didn\'t work.\n' +
        'Data processed up to error:\n' + result);
  }
  result += ((nextcurl+=2) > text.length? '':
      Plate.format (text.slice (nextcurl), literal));
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
    if (Plate.parsers[params[1]] === undefined) {
      console.error ('Template error: parser ' + params[1] + ' is missing.');
      return '';
    }
    return Plate.parsers[params[1]] (Plate.value (literal, params[0])
                                    , params[2]);
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
  'integer': function (integer) {
    return typeof integer == 'number'? integer.toFixed (0): '';
  },
  'intradix': function (intradix, radix) {
    return typeof intradix == 'number'? intradix.toString (parseInt (radix)):'';
  },
  'float': function (floating, fractionDigits) {
    return typeof floating == 'number'?
        floating.toFixed (parseInt (fractionDigits)): '';
  },
  'exp': function (exp, fractionDigits) {
    return typeof exp == 'number'?
        exp.toExponential (parseInt (fractionDigits)): '';
  }
};


// Exportation World!
//

exports.format = Plate.format;
exports.macros = Plate.macros;
exports.parsers = Plate.parsers;


})();
