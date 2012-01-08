SCOUT CAMP
==========


Dealing with server systems can be alleviated by systems which allow clear
distinction between:

  * serving pages; and
  * powering applications.


Node.js
-------

The technology that Scout Camp is built on top of is Node.js, a modest library
for creating server applications.

Node.js is a high-performance library implementing a series of protocols
including HTTP 1.1, TCP, and so much more.  It is designed to be event-based and
non-blocking, a combination which has already proven to be awesome in web
browsers.  However, using events has typically been awkward in C and similar
non-closure languages.  As a result, Node.js uses a javascript interface built
with V8, with which one can script anything and have access to all Node.js'
functionnality.

The reason why the combination non-blocking IO + events + closures is
particularly witful is the following.  In order to perform non-blocking IO, one
does need some kind of parallelism, or dispatch mechanism.  Threads, or even
processes, can be used for that, but they are technically challenging to use,
even for alert mutex experts.  CSP is another option, but it is not present by
default in programming languages, and it is hard to "install".  On the other
hand, events are very easy to use, they are already present in the browser and
scriptable from javascript.  However, events require that one give a chunk of
code, a function of some sort, to handle some event.  Passing functions as a
parameter is typically cumbersome in C, etc.  You have to declare it in global
space, define it there, even though you may not have access to all the variables
you need, and you therefore enter a hell of billion-parameters functions.
Closures, on the other hand, adresses this concern beautifully.  All variables
in scope are accessible, and you may pass in anonymous functions without needing
to worry.


Scout.js
--------

Today's built-in Ajax library is poor.  It is not cross-browser (because of
Internet Explorer) and it can quickly become a hassle.  Scout.js is a javascript
library that removes that hassle.

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


Camp.js
-------

The Camp.js engine targets ease of use of both serving plain html files and ajax
calls.  By default, when given a request, it looks for files in the current
directory.  However, it also has the concept of actions.

    var camp = require ( './camp.js' );
    camp.add ( 'getinfo', function (json) {
      console.log (json); return json;
    } );
    camp.start ();

An action maps a string to the path request "/$<string>".  When a client asks
for this resource, sending in information stored in the "json" parameter,
Camp.js will send it back the object literal that the callback function gives.

In the example given, it merely sends back whatever information the client
gives, which is a very contrived example.

The purpose of this distinction between normally served html pages and ajax
actions is to treat servers more like applications.  You first serve the
graphical interface, in html and css, and then, you let the user interact with
the server's data seemlessly through ajax calls.

You may also differ the moment when you send the json back to the client.  The
basic idea is, you want to send it when an event is raised: `camp.server.emit
('actionname', data)`.  In that case, use the `camp.addDiffer` function.
You need to add a third parameter to the definition of your action, to be run
when the event is emitted:

    camp.addDiffer ( 'actionname', function () {
      …
      return {differ:true, data:localdata};
    }, function actionname (data1, data2, localdata) {
      return json;
    });

    …

    // Somewhere, sometime later:
    camp.server.emit ( 'actionname', data1, data2);

The name of the event to raise is either the name of the third parameter to
`addDiffer`, or, if it has no name, the name of the action.

Please note that the second parameter to `addDiffer` (if given) returns
information to indicate whether you wish to differ this action.

If you do want to differ, `data` will be given as an argument to the third
parameter, when the event is emitted.
Otherwise, `data` is the data sent back to the client.

Plate.js
--------

An associated possibility, very much linked to the normal use of Camp.js, is to
handle templates.  Those are server-side preprocessed files.

### Basic Usage

Mostly, you first decide where to put your template file.  Let's say we have
such a file at `/first/post.html` (from the root of the web/ or publish/
directory).

    var posts = ['This is the f1rst p0st!'];

    camp.handle ( /\/first\/post.html/, function ( query, path ) {
      return {
        text: posts[0],
        comments: ['first comment!', 'second comment...']
      };
    });

In this `camp.handle` function, `query` is the object literal associated to the
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

    camp.handle ( paths = /pattern/, call = function ( query = {}, path = [] ) {
      return {};
    });

This function registers `paths` as being redirected to a template file.  The
template file is either `paths`, literally, or the path you affect `path[0]` to
(indeed, `path[0]` is the match object).  The return value of the `call`
function is an object literal that will be fed to the template file.  This
object literal can very well be dynamically generated.

The template syntax follows those basic rules:

* Nothing is treated specially, but chunks of text surrounded by {{ and }}.
* Those special chunks are a series of distinct parameters:
   1. The first character is the macro that is used,
   2. The next blocks of data separated by bars `|` are arguments to that macro,
   3. What comes after a semi-colon `;` is the rest of the chunk.  
  For instance, `{{-hellos|hello; I say {{=hello|plain}}! }}` is separated as
  follows: first the macro `-`, then the first argument `hellos`, then the
  second `hello`, then the rest ` I say {{=hello|plain}}! `. You can probably
  guess that, in this case, the rest has nested syntax too.
* The special chunks are substituted by some *real text* that the macro returns.

Default macros are the following:

* `{{=key|parser}}` will print `key` as a string, escaping characters along what
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
* `{{-object|value|key; rest }}` will parse the rest once for each key in
  `object`, adding the new variables `value` and `key` to the scope.
* `{{# rest }}` will not print anything at all.
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

You may, just as with `Camp.addDiffer` actions, give `Camp.handle` a third
parameter, a function, to serve as a callback for the event that will trigger
that function (and will send the templated document back to the client).
Since we cannot use the action name as an event name (there are no action), we
use the name of the function given as a third parameter.


## Fall through

There are three steps when treating URLs.  Once it has not matched any handle,
it is matched against the web/ folder on hard drive.  Finally, if nothing was
found before, it returns a 404 message.  This can be overriden by the
`camp.notfound` function, which is identical to the `camp.handle` function.  It
does the same thing, too, but only after even searching in the file system
failed to provide a result.


Thaddee Tyl, author of Scout Camp.

