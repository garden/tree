# Fléau [![Build Status](https://travis-ci.org/espadrine/fleau.png)](http://travis-ci.org/espadrine/fleau)

*An extensible, readable, streamed, safe templating language.*

# Taste

Import and use.

```javascript
var fleau = require('fleau');
var fs = require('fs');
fleau(fs.createReadStream('./YourTemplateFile'),   // input
      process.stdout,                              // output
      {data: 'to use', "in": ['your', 'file']});   // data
```

Example templates.

    Thaddee {{if {{apostles.indexOf(thaddee) != -1}}
              then was else wasn't}} an apostle

    {
      thaddee:  'Thaddaeus',
      apostles: ['Simon','Andrew','James','John','Philip','Bartholomew',
                 'Matthew','Thomas','James','Simon','Judas','Judas']
    }

    Thaddee wasn't an apostle

Loops:

    Characters:
    {{for i, guy in protagonists
    {{ {{= i in plain}}. {{= guy in plain}}
    }} }}

    {
      protagonists: ['Blondie', 'Angel', 'Tuco']
    }

    Characters:
     0. Blondie
     1. Angel
     2. Tuco


# Manual

## Exports

The exported object is a function that takes four parameters:

```javascript
fleau(inputStream,         // a template
      outputStream,        // where to output the result
      {data: 'to use'},    // parameters
      function callback(error) {…});
```

Each parameter is accessible as a variable in the template. More on that later.

This exported function also has a series of entries.

- `fleau.macros` is a map of all macro functions. A *macro* is what specifies
  what the control zone does (more on this below). This is exported for
  extensibility purposes.
- `fleau.parsers` is a map of all parser functions. Parsers are used in the `=`
  macro (it prints data from the parameters).
- `fleau.formatString(input :: String, write :: Function, literal :: Object)`
  formats the `input` parameter as a template, using the `write` function to
  write data to the output stream. The `literal` object is the `parameters`
  passed to the function.
  This function is exported for use in macros.
- `fleau.eval(literal :: Object, expression :: String)` returns the value
  corresponding to looking up (or evaluating) an expression in the context of
  the literal object passed in as parameters to the template.
  This function is exported for use in macros.

## Macros

In a *control zone* (a zone in the template between `{{` and `}}`), you have a
series of textual parameters, either delimited by whitespace, or by `{{…}}`.
The first of those paramters selects a macro.
*Macros* contain instructions to output data in the template.
The following are built-in macros.

The `=` macro displays an expression and escapes it using a parser.

    Here be dragons: {{= data in {{json 2}} }}.

    { data: ['T-O Psalter world map', 'Borgia map', 'Fra Mauro Map'] }

    Here be dragons: ['T-O Psalter world map', 'Borgia map', 'Fra Mauro Map'].

You can have parameters to parsers (more below), and you can also chain them
using a sequence of `in parser` instructions.

Conditions: the `if` macro.

    I am {{if here then {{here. Hello!}} else if atWork then
    {{at work…}} else out.}} Anyway, how do you do?

    { here: false, atWork: true }

    I am at work… Anyway, how do you do?

(You can have as many `else if` as you want.)

Loops: the `for` macro. You have two forms: with the index, and without.
We have already seen with the index in the intro.

    Characters:
    {{for guy in protagonists
    {{- {{= guy in plain}}
    }} }}

    {
      protagonists: ['Blondie', 'Angel', 'Tuco']
    }

    Characters:
    - Blondie
    - Angel
    - Tuco

The comment macro, `#`, used if you want to disable a control zone without
removing it.

    Here be {{# nothing}}

    {}

    Here be 

Finally, the macro macro, `!`, which adds a macro on-the-fly.
It reads the first parameter of the macro as a new macro name, and the second
parameter as the body of a function expression to which the macro will be bound.
It feeds it three parameters, `write`, a function to which you can give the
output, `literal`, the parameters given to the template, and `params`, the
parameters given to the macro.

    First param:{{! fp {{write (params[0])}} }} {{fp teh catburger…}}!

    {}

    First param: teh!

## Parsers

- `plain`: nothing is escaped.
- `html`: HTML escapes (such as `<`, `>, `&`, etc.).
- `xml`: similar to HTML.
- `xmlattr`: escapes for an XML attribute (such as `'` to `&apos;`).
- `jsonstring`: inside a JS (or JSON) string, escapes `'`, `\`, etc.
- `json`: outputs a JSON representation of the input. This parser has the usual
  parameters given to `JSON.stringify`.
- `uri`: escapes spaces to `%20`, etc, as done in URIs.
- `!uri`: unescapes URIs.
- `integer`: outputs the data as an integer.
- `intradix`: outputs an integer using the radix given as a parameter.
- `float`: outputs a floating-point number using the number of digits after the
  comma as given as a parameter.
- `exp`: outputs a number in scientific notation, using the number of digits
  after the comma as given as a parameter.

# Dev intro

The entirety of the templating system is hold in the `fleau.js` code file. There
are tests in the `test/` directory, which you run using `make test`.

`fleau.js` starts with a series of helper functions which are really meant to
work together. The main data structures, `ControlZone` and `TopLevel`, contain
all information about the location of control zones and escapes in and out of
them.

The data is constructed by the `toplevel` function. It doesn't do any string
manipulation; it only stores the indices of interesting spots. It is applied not
to the whole document, but to the start of the template until the end of the
first control zone it finds. That way, data starts being sent down the wire long
before all the document has been processed, which is useful in huge documents.

Quite obviously, the `zoneParser` function operates on each control zone and
separates it into space-separated tokens, or longer phrases. Then, `escapeCurly`
substitutes escapes to their corresponding output.

The `format` function is obviously the main entry point, and the main thing it
does is call `formatString`, giving it the complete contents of the template.
In turn, `formatString` reads each control zone sequentially, and calls the
corresponding macro every time.

All macros are in the `macros` map; each macro name is associated to the macro
function. Similarly, parsers are in the `parsers` map; each parser name is
associated to the corresponding parser function, which is given the text to
parse and optional parser parameters.

One last thing. If you are wondering about the peculiar code style, it is an
experiment in readability. Put a space between the function and the parameter
list if you want to contribute.

# License

LGPL, see LICENSE.
