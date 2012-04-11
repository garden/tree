SCOUT CAMP
==========


Dealing with server systems can be alleviated by systems which allow clear
distinction between:

  * serving pages; and
  * powering applications.


Scout.js
--------

### XHR

Browsers' built-in Ajax libraries are usually poor.  They are not cross-browser
(because of Internet Explorer) and they can quickly become a hassle.  Scout.js
is a javascript library to remove that hassle.

With Scout.js, one can easily target a specific element in the page which
must trigger an XHR(XML Http Request) when a specific event is fired.  This is
what you do, most of the time, anyway.  Otherwise, it is also easy to attach an
XHR upon a "setTimeout", and so on.

    Scout ( '#id-of-element' ).on ( 'click', function (params, evt, xhr) {
      params.action = 'getinfo';
      var sent = this.parentNode.textContent;
      params.data = { ready: true, data: sent };
      params.resp = function ( resp, xhr ) {
        if (resp.data === sent) {
          console.log ('Got exactly what we sent.');
        }
      };
    });

    // or...

    setTimeout ( Scout.send ( function ( params, xhr ) { ... } ), 1000 );

One thing that can bite is the fact that each Scout object only has one XHR
object inside.  If you do two Ajax roundtrips at the same time, with the same
Scout object, one will cancel the other.

This behavior is very easy to spot.  On the Web Inspector of your navigator, in
the "Network" tab, if a `$action` POST request is red (or cancelled), it means
that it was killed by another XHR call.

The cure is to create another Scout object through the
`var newscout = Scout.maker()` call.

### Server-Sent Events

All modern browsers support a mechanism for receiving a continuous,
event-driven flow of information from the server.  This technology is called
*Server-Sent Events*.

The bad news about it is that it is a hassle to set up server-side.  The good
news is that you are using ScoutCamp, which makes it a breeze.  Additionally,
ScoutCamp makes it work even in IE7.

    var es = Scout.EventSource('channel');

    es.on('eventName', function (data) {
      // `data` is a string.
    });

    es.onrecv(function (json) {
      // `json` is a JSON object.
    });



Camp.js
-------

### Ajax

The Camp.js engine targets ease of use of both serving plain html files and ajax
calls.  By default, when given a request, it looks for files in the current
directory.  However, it also has the concept of Ajax actions.

    var server = require ( 'camp' ).start ( );

    server.ajax.on ( 'getinfo', function (json, end) {
      console.log (json);
      end (json);   // Send that back to the client.
    } );

An action maps a string to the path request `/$<string>`.  When a client asks
for this resource, sending in information stored in the "json" parameter,
Camp.js will send it back the object literal that the callback function gives.

In the example given, it merely sends back whatever information the client
gives, which is a very contrived example.

The purpose of this distinction between normally served html pages and ajax
actions is to treat servers more like applications.  You first serve the
graphical interface, in html and css, and then, you let the user interact with
the server's data seemlessly through ajax calls.

### EventSource

I promised earlier that Server-Sent Events were a breeze in ScoutCamp.  They
are.  Let's build a channel named `channel`.  When we receive an Ajax call on
the `talk` event, we send the data it gives us to the EventSource channel.

    // This is actually a full-fledged chat.
    var chat = server.eventSource ( 'all' );
    server.ajax.on ('talk', function(data, end) { chat.send(data); end(); });

This EventSource object we get has two methods:

- The `send` method takes a JSON object and emits the `message` event to the
  client.  It is meant to be used with `es.onrevc`.
- The `emit` method takes an event name and a textual message and emits this
  event with that message to the client.  It is meant to be used with
  `es.on(event, callback)`.


Plate.js
--------

An associated possibility, very much linked to the normal use of Camp.js, is to
handle templates.  Those are server-side preprocessed files.

### Basic Usage

Mostly, you first decide where to put your template file.  Let's say we have
such a file at `/first/post.html` (from the root of the web/ or publish/
directory).

    var posts = ['This is the f1rst p0st!'];

    server.route ( /\/first\/post.html/, function ( query, path ) {
      return {
        text: posts[0],
        comments: ['first comment!', 'second comment...']
      };
    });

In this `camp.route` function, `query` is the object literal associated to the
query string sent in the URL.  For instance, `/first/post.html?key=value` has an
associated query of `{"key": "value"}`.  
The path, on the other side, corresponds to the match object that comes from
evaluating the regular expression against the path.

On the other side of the fence, the file `/web/first/post.html` might look like
this:

    <!doctype html><title></title>
    <p>{{=text|html}}</p>
    <ul>
    {{-comments|comment|i;
      <li>{{=comment|html}}</li>
    }}
    </ul>

Because it will be preprocessed server-side, the browser will actually receive
the following file:

    <!doctype html><title></title>
    <p>This is the f1rst p0st!</p>
    <ul>
      <li>first comment!</li>
      <li>second comment...</li>
    </ul>

### Diving In

There are two main elements of interest here.  The easiest is the camp.js
binding to the template system, the more documentation-heavy one is the actual
grammar of the templating language.

The camp.js binding is a very straightforward function; namely:

    server.route ( /pattern/, function ( query = {}, path = [] ) {
      return {};
    });

This function registers `paths` as being redirected to a template file.  The
template file is either `paths`, literally, or the path you affect `path[0]` to
(indeed, `path[0]` is the match object).  The return value of the `call`
function is an object literal that will be fed to the template file.  This
object literal can very well be dynamically generated.

The template syntax follows those basic rules:

* Plate substitutes all chunks of text surrounded by {{ and }}
  (which you can escape by adding a curly brace to the number of curly braces
  you want).
* Those special chunks are a series of distinct parameters:
   1. The first character is the macro that is used,
   2. The next blocks of data separated by bars `|` are arguments to that macro,
   3. What comes after a semi-colon `;` is the rest of the chunk.  
  For instance, `{{-hellos|hello; I say {{=hello|plain}}! }}` is separated as
  follows: first the macro `-`, then the first argument `hellos`, then the
  second `hello`, then the rest ` I say {{=hello|plain}}! `. You can probably
  guess that, in this case, the rest has nested syntax too.
* You can escape the macro parameters with `\|` and `\;`.
* The special chunks are substituted by some *real text* that the macro returns.

Default macros are the following:

* `{{=key|parser}}` will print the variable `key` (obtained from the literal
  given to the template) as a string, escaping characters along what
  `parser` returns.  `parser` is one of Plate.parsers (which is a real array,
  which you can extend if need be).  Default parsers (self-explanatory):
   * plain (text)
   * html (text)
   * xml (text)
   * xmlattr (text)
   * jsonstring (text)          // Escapes like a json string.
   * json (text, indentation)   // Takes a JS object.
   * uri (text)
   * !uri (text)                // Unencode the URI.
   * integer (text)
   * intradix (text, [radix])
   * float (text, [fractionDigits])
   * exp (text, [fractionDigits])  
  For instance, `{{=expNumber|exp 2}}` will only print the variable `expNumber`
  with 2 fractional digits.  
  You can sequence parsers like so: `{{=key|uri|xmlattr}}` goes through the URI
  escaper, and then through the xmlattr parser. As a result, giving this the
  string `"\"&\""` will insert the string `"%22&amp;%22"`.
* `{{?bool; rest }}` will print the rest if the variable `bool` is truthy.
  `bool` may be any JS expression, but this feature is unwise to use, as it will
  hurt performance.
* `{{-object|value|key; rest }}` will parse the rest once for each key in
  `object`, adding the new variables `value` and `key` to the scope.
* `{{# rest }}` will not print anything at all.
* `{{<template_file}}` will import a partial template in-place.
  This is bad practice, however, as it may hurt performance.
* `{{!m| func }}` will add a new macro `m` to the system, giving it the function
  whose body is `func`, which receives the arguments `literal` (the literal
  given to the template file) and `params` (parameters given to the macro).
* `{{~macro; rest }}` will run the macro named `macro` (please note that this
  macro has more than one character in it, this is legit).

You may create a user-defined parser, say a parser "remove\_t", like so:

    camp.Plate.parsers['remove_t'] = function (text, additionalParams) {
      return escapedText;
    };

The `additionalParams` are an array that comes from space-separated strings
given, in the template, after the parser name. It is useful to tune the behavior
of the parser. For instance, the `2` in `{{=number|exp 2}}` asks the `exp`
parser to give 2 decimal digits.

Similarly to how you add parsers, you can add user-defined macros (here, the
macro `i`):

    camp.Plate.macros['i'] = function (literal, params) {
      return insertedtext;
    };

The `literal` object contains all objects that are given to the template, and
the params are what is given to the macro between pipe characters `|`.


## Fall through

There are three steps when treating URLs.  Once it has not matched any template,
it is matched against the web/ folder on hard drive.  Finally, if nothing was
found before, it returns a 404 message.  This can be overriden by the
`camp.notfound` function, which is identical to the `camp.route` function.
It does the same thing, too, but only after even searching in the file system
failed to provide a result.



Camp In Depth
-------------

In Camp.js, there is a lot more than meets the eye.  Up until now, we have only
discussed the default behaviour of ScoutCamp.  For most uses, this is actually
more than enough.  Sometimes, however, you need to dig a little deeper.

### The Camp Object

`camp.start` is the simple way to launch the server in a single line.  You may
not know, however, that it returns an `http.Server` (or an `https.Server`)
subclass instance.  As a result, you can use all node.js' HTTP and HTTPS
methods.

You may provide the `start` function with a JSON object which defaults to this:

    {
      port: 80,     // The port to listen to.
      security: {
        key: 'https.key',
        cert: 'https.crt',
        ca: 'https.ca'
      }
    }

If you provide the relevant HTTPS files, the server will be secure.

`camp.createServer` creates a Camp instance directly, and
`camp.createSecureCamp` creates an HTTPS Camp instance.  The latter takes the
same parameters as `https.Server`.

`camp.Camp` and `camp.SecureCamp` are the class constructors.


### The stack

Camp is stack-base.  When we receive a request, it goes through all the layers
of the stack until it hits the bottom.  It should never hit the bottom: each
layer can either pass it on to the next, or end the request (by sending a
response).

The default route is defined this way:

    campInstance.stack = [ajaxLayer, eventSourceLayer,
        routeLayer, staticLayer, notfoundLayer];

Each element of the route is a function which takes two parameters:

- an Ask object (more below),
- a `next` function, which the layer may call if it will not send an HTTP
  response.

The Ask class is a way to provide a lot of useful elements associated with a
request.  It contains the following fields:

- server: the Camp instance,
- req: the http.ServerRequest object,
- res: the http.ServerResponse object,
- uri: the URI,
- path: the pathname associated with the request,
- query: the query taken from the URI.

Additionally, you can set the mime type of the response with
`ask.mime('text/plain')`, for instance.

### Default layers

The default layers provided are located in `camp.unit`.

These layers use functions that `camp` exports:

- `camp.ajaxUnit` (seen previously),
- `camp.eventSourceUnit` (idem),
- `camp.routeUnit` (idem),
- `camp.staticUnit` (idem),
- `camp.notfoundUnit` (idem),
- `server.documentRoot`: this string specifies the location of the root of
  your static web files.  The default is "./web".



- - -

Thaddee Tyl, author of Scout Camp.

