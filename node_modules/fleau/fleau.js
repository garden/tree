// Fleau Templating Language.
// Copyright © Thaddee Tyl. All rights reserved.
// Code covered by the LGPL license.

var localeval = require ('localeval');

function ControlZone () {
  this.from = 0;        // Index of starting character.
  this.to = 1;          // Index of character beyond the last.
  this.escapes = [];    // List of indices that go by 3: (start, end, type).
  // Types: '{{' 0, '}}' 1.
}

function TopLevel () {
  this.zone = null;     // List of ControlZone.
  this.escapes = [];    // List of indices that go by 3: (start, end, type).
  // Types: '{{' 0, '}}' 1.
}

// Return the boundaries of the next content to substitute,
// as a list containing alternatively
// (index of substitution start) and (index of substitution stop + 1).
function toplevel (text) {
  var state = 0;
  var bracecount = 0;
  var section = new TopLevel ();
  for (var i = 0;  i < text.length;  i++) {
    if (state === 0) {
      // Toplevel.
      if (text[i] === '{' && text[i+1] && text[i+1] === '{') {
        if (text[i+2] !== '[') {
          // The trigger matches; we enter a control zone.
          //
          //   outer {{ control zone }} outer
          //         ^-----------------^
          section.zone = new ControlZone ();
          section.zone.from = i;
          state = 1;
          i += 1;     // Counting the for loop, i will be just after the curly.
        } else {
          // This is an escape.
          // {{[ needs to be converted to {{.
          section.escapes.push (i, i + 3, 0);
          i += 2;     // Counting the for loop, i will be just after the [.
        }
      } else if (text[i] === ']' && text[i+1] && text[i+1] === '}'
          && text[i+2] && text[i+2] === '}') {
        // This is an escape.
        // ]}} needs to be converted to }}.
        section.escapes.push (i, i + 3, 1);
        i += 2;     // Counting the for loop, i will be just after the curly.
      }
    } else if (state === 1) {
      // Inside the control zone.
      if (text[i] === '}' && text[i+1] && text[i+1] === '}') {
        if (bracecount > 0) {
          bracecount -= 1;
          i += 1;
        } else {
          // We leave the control zone.
          section.zone.to = i + 2;
          return section;
        }
      } else if (text[i] === ']' && text[i+1] && text[i+1] == '}'
          && text[i+2] && text[i+2] === '}') {
        // This is an escape.
        // ]}} needs to be converted to }}.
        section.zone.escapes.push (i, i + 3, 1);
        i += 2;
      } else if (text[i] === '{' && text[i+1] && text[i+1] == '{') {
        // Opening a subsection.
        if (text[i+2] && text[i+2] !== '[') {
          bracecount += 1;
          i += 1;
        } else {
          // This is an escape.
          // {{[ needs to be converted to {{.
          section.zone.escapes.push (i, i + 3, 0);
          i += 2;
        }
      }
    }
  }
  return section;
}

// Return a text where all escapes as defined in the toplevel function
// are indeed escaped.
function escapeCurly (text, escapes) {
  var newText = text.slice (0, escapes[0]);
  for (var i = 0; i < escapes.length; i += 3) {
    var from = escapes[i];
    var to = escapes[i + 1];
    var type = escapes[i + 2];
    // Which escape do we have here?
    if (type === 0) {   newText += '{{';
    } else {            newText += '}}';
    }
    newText += text.slice (to, escapes[i+3]);
  }
  return newText;
}

var whitespace = /[ \t\n\r\v]+/;
function nonEmpty (s) { return s.length > 0; }

// Cuts a control zone into an Array of Strings.
// We have three components: space-separated identifiers and text.
function zoneParser (span) {
  var tokens = [];
  var sep = [];     // Separation indices.
  var section = toplevel (span);   // textual zones.
  while (section.zone !== null) {
    var zone = section.zone;
    // Add tokens before the zone.
    tokens = tokens.concat (span.slice (0, zone.from)
                                .split (whitespace)
                                .filter (nonEmpty));
    // Add the zone.
    tokens.push (span.slice (zone.from + 2, zone.to - 2));
    // Prepare for next iteration.
    span = span.slice (zone.to);
    section = toplevel (span);
  }
  tokens = tokens.concat (span.slice (0)
                              .split (whitespace)
                              .filter (nonEmpty));
  return tokens;
}


// Main entry point.
//
// input and output are two streams, one readable, the other writable.

function format (input, output, literal, cb) {
  var text = '';
  input.on ('data', function (data) {
    text += '' + data;   // Converting to UTF-8 string.
  });
  input.on ('end', function template () {
    try {
      formatString (text, function write (text) {
        output.write (text);
      }, literal);
    } catch (e) {
      if (cb) { cb (e); }
    } finally {
      // There are streams you cannot end.
      try {
        output.end ();
      } catch (e) {} finally {
        if (cb) { cb (null); }
      }
    }
  });
};

function formatString (input, write, literal) {
  var section = toplevel (input);
  if (section.zone !== null) {
    var span = input.slice (section.zone.from + 2, section.zone.to - 2);
    var params = zoneParser (span);    // Fragment the parameters.
    var macro = params[0];
  }

  // If the macro is invalid, print the zone directly.
  if (!macro) {
    write (escapeCurly (input, section.escapes));
    return;
  }

  write (escapeCurly (input.slice (0, section.zone.from), section.escapes));
  try {   // Call the macro.
    macros[macro] (write, literal, params.slice (1));
  } catch (e) {
    throw Error ('Template error: macro "' + macro + '" didn\'t work.\n' +
                 '"' + e.message + '" ' +
                 'Parameters given to macro:', params.slice (1) +
                 'Literal:', literal);
  }
  if (section.zone.to < input.length) {
    formatString (input.slice (section.zone.to), write, literal);
  }
};

// Helper function to parse simple expressions.
// Can throw pretty easily if the template is too complex.
// Also, using variables is a lot faster.
function evValue (literal, strval) {
  try {
    // Special-case faster, single variable access lookups.
    if (/^[a-zA-Z_\$]+$/.test(strval)) {
      return literal[strval];
    } else {
      // Putting literal in the current scope.
      return localeval (strval, literal);
    }
  } catch(e) {
    throw Error ('Template error: literal ' + JSON.stringify (strval) +
                 ' is missing.\n', e.message, '\n', e.stack);
    return '';
  }
  return strval;
};

var macros = {
  '=': function (write, literal, params) {
    // Displaying a variable.
    var parsedtext = evValue (literal, params[0]);
    var parsercalls = params.slice (1)
                            .filter (function (a) {return a !== 'in';})
                            .map (function (c) {return c.split (whitespace);});
    var parserNames = parsercalls.map (function (el) {return el[0];});
    var parserNamesparams = parsercalls.map(function(el) {return el.slice(1);});
    for (var i = 0; i < parserNames.length; i++) {
      if (parsers[parserNames[i]] === undefined) {
        throw Error ('Template error: parser ' +
                     parserNames[i] + ' is missing.');
      }
      parsedtext = parsers[parserNames[i]] (parsedtext, parserNamesparams[i]);
    }
    write (parsedtext);
  },
  'if': function (write, literal, params) {
    // If / then [ / else ].
    var cindex = 0;   // Index of evaluated condition.
    var result = '';
    while (true) {
      if (evValue (literal, params[cindex]) === true) {
        // We skip "then", so the result is at index +2.
        result = params[cindex + 2];
        break;
      } else if (params[cindex + 4]) {
        // We skip "else", so the result is at index +4.
        if (params[cindex + 4] === 'if') {
          cindex += 5;
        } else {
          result = params[cindex + 4];
          break;
        }
      } else break;
    }
    formatString (result, write, literal);
  },
  'for': function (write, literal, params) {
    // Iterate through an object / an array / a string.
    var iterIndex = 2;   // We skip the "in".
    var valSymbol = params[0];
    if (valSymbol[valSymbol.length - 1] === ',') {
      // That symbol was actually the key.
      var keySymbol = valSymbol.slice (0, valSymbol.length - 1);
      valSymbol = params[1];
      iterIndex = 3;  // We skip the "in". Again.
    }
    var iter = evValue (literal, params[iterIndex]);
    if (iter === undefined) {
      throw Error ('Template error: literal ' +
          JSON.stringify (params[iterIndex]) + ' is missing.');
    }
    var newliteral = literal;
    for (var i in iter) {
      newliteral[keySymbol] = i;
      newliteral[valSymbol] = iter[i];
      formatString (params[iterIndex + 1], write, literal);
    }
  },
  '#': function () {},  // Comment.
};

var parsers = {
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
    // RFC5987-compliant.
    return encodeURIComponent (text).replace(/['()]/g, escape)
      .replace(/\*/g, '%2A').replace(/%(?:7C|60|5E)/g, unescape);
  },
  '!uri': function (text) {
    return decodeURIComponent (text);
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

module.exports = format;
module.exports.macros = macros;
module.exports.parsers = parsers;
module.exports.formatString = formatString;
module.exports.eval = evValue;
