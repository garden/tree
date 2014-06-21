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

    setTimeout ( Scout.send ( function ( params, xhr ) { … } ), 1000 );

One thing that can bite is the fact that each Scout object only has one XHR
object inside.  If you do two Ajax roundtrips at the same time, with the same
Scout object, one will cancel the other.

This behavior is very easy to spot.  On the Web Inspector of your navigator, in
the "Network" tab, if a `$action` POST request is red (or cancelled), it means
that it was killed by another XHR call.

The cure is to create another Scout object through the
`var newScout = Scout.maker()` call.

### Server-Sent Events

All modern browsers support a mechanism for receiving a continuous,
event-driven flow of information from the server.  This technology is called
*Server-Sent Events*.

The bad news about it is that it is a hassle to set up server-side.  The good
news is that you are using ScoutCamp, which makes it a breeze.  Additionally,
ScoutCamp makes it work even in IE7.

    var es = Scout.eventSource('channel');

    es.on('eventName', function (data) {
      // `data` is a string.
    });

    es.onrecv(function (json) {
      // `json` is a JSON object.
    });



Camp.js
-------

We start the web server.

    var server = require ( 'camp' ).start ( );

The `start()` function has the following properties:

- `documentRoot`: the path to the directory containing the static files you
  serve (and the template files, potentially). If your website is made of HTML
  pages, this is where they are located. Defaults to `./web`.
- `templateReader`: the default template engine used. See below.
- `passphrase`, `key`, `cert`, `ca`: in the case of a secure website (using
  HTTPS), those are fields you may specify to indicate where to find information
  about the website's security. Defaults include "https.key", "https.crt", and,
  as the CA (Certificate Authority, a list of certificates) an empty list.

### Ajax

The Camp.js engine targets ease of use of both serving plain html files and ajax
calls.  By default, when given a request, it looks for files in the `./web/`
directory.  However, it also has the concept of Ajax actions.

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

Note that  the `json` parameter given is a single object containing all
parameters from the following sources:

- the query string from GET requests
- POST requests with enctype application/x-www-form-urlencoded
- POST requests with enctype multipart/form-data. This one uses the same API as
  [formidable](https://github.com/felixge/node-formidable) for file objects.

Before downloading POST Ajax data, you can hook a function up using the
following code:

    camp.ajaxReq.on('getinfo', function(ask) { … });

That can be useful to give information about the progress of an upload, for
instance, using `ask.form.on('progress', function(bytesReceived, bytesExpected) {})`.

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

### WebSocket

We also include the raw duplex communication system provided by the WebSocket
protocol.

    camp.ws('channel', function (socket));

Every time a WebSocket connection is initiated (say, by a Web browser), the
function is run. The `socket` is an instance of [ws.WebSocket]
(https://github.com/einaros/ws/blob/master/doc/ws.md#class-wswebsocket).
Usually, you only need to know about `socket.on('message', function(data))`,
and `socket.send(data)`.

This function returns an instance of a [WebSocket server]
(https://github.com/einaros/ws/blob/master/doc/ws.md#class-wsserver)
for that channel.
Most notably, it has a `wsServer.clients` list of opened sockets on a channel.

A map from channel names to WebSocket servers is available at:

    camp.wsChannels[channel];

For the purpose of broadcasting (ie, sending messages to every connected socket
on the channel), we provide the following function.

    camp.wsBroadcast('channel', function recv(data, function end(data)))

The `recv` function is run once every time a client sends data.
The `end` function sends some data, the same data, to each socket on the
channel.

Client-side, obviously, your browser needs to have a
[WebSocket API](http://dev.w3.org/html5/websockets/#websocket).
Check that it does provide that. For each browser, Chrome 14, Firefox 11,
IE10, Safari 6 and Blackberry Browser 7, all onwards, support WebSocket,
even on mobile phones.
The `scout.js` API follows.

    // `socket` is a genuine WebSocket instance.
    var socket = var Scout.webSocket('channel');
    // It has an additional field.
    socket.sendjson({ some: "data" });  // (Gets sent as a JSON string.)

### Socket.io

Be warned before you read on: the Socket.io interface is deprecated.
Use the WebSocket interface provided above instead.
Also, do not use *both* the socket.io interface and the WebSocket interface.
That seems to be asking for trouble.

We also include the duplex communication system that socket.io provides. When
you start the server, by default, socket.io is already launched. You can use its
APIs as documented at <http://socket.io#how-to-use> from the `camp.io` object.

    camp.io.sockets.on('connection', function (socket) { … });

On the client-side, `Scout.js` also provides shortcuts, through its
`Scout.socket(namespace)` function. Calling `Scout.socket()` returns the
documented Socket.io object that you can use according to their API.

    var io = Scout.socket();
    io.emit('event name', {data: 'to send'});
    io.on('event name', function (jsonObject) { … });


Templates
---------

An associated possibility, very much linked to the normal use of Camp.js, is to
handle templates.  Those are server-side preprocessed files.

### Basic Usage

Mostly, you first decide where to put your template file.  Let's say we have
such a file at `/first/post.html` (from the root of the web/ or publish/
directory).

    var posts = ['This is the f1rst p0st!'];

    server.route ( /\/first\/post.html/, function ( query, match, end ) {
      end ({
        text: posts[0],
        comments: ['first comment!', 'second comment…']
      });
    });

In this `camp.route` function, `query` is the object literal associated to the
query string sent in the URL.  For instance, `/first/post.html?key=value` has an
associated query of `{"key": "value"}`.

The `match`, on the other side, corresponds to the match object that comes from
evaluating the regular expression against the path.

On the other side of the fence, the file `/web/first/post.html` might look like
this:

    <!doctype html><title></title>
    <p>{{= text in html}}</p>
    <ul>
    {{for comment in comments {{
      <li>{{= comment in html}}</li>
    }}}}
    </ul>

Because it will be preprocessed server-side, the browser will actually receive
the following file:

    <!doctype html><title></title>
    <p>This is the f1rst p0st!</p>
    <ul>
      <li>first comment!</li>
      <li>second comment...</li>
    </ul>

You can tweak how the router works using `end`'s second parameter, an object
with the following fields:

- `template`: the file (relative to the `web` directory) to read as the
  template, or a readable stream (see
  [the standard library](http://nodejs.org/api/stream.html)).
- `reader`: the template engine to use. It defaults to `server.templateReader`,
  which defaults to [Fleau](https://github.com/espadrine/fleau).

By default, the following will be executed:

    var posts = ['This is the f1rst p0st!'];

    server.route ( /\/first\/post.html/, function ( query, match, end ) {
      end ({
        text: posts[0],
        comments: ['first comment!', 'second comment...']
      }, {
        template: '/first/post.html',   // The file given as a regex.
        reader: server.templateReader
      });
    });

### Diving In

There are two main elements of interest here.  The easiest is the camp.js
binding to the template system, the more documentation-heavy one is the actual
grammar of the templating language.

The camp.js binding is a very straightforward function; namely:

    server.route ( /pattern/, function ( query = {}, path = [], end, ask ) {
      end ({});
    });

This function registers a pattern (name it `paths`) as being redirected to a
template file.  The template file is either the match corresponding to `paths`,
or the path you affect `path[0]` to (indeed, `path` is the match object).
Please note that the path is relative to the root of your static files.  
The return value (strictly speaking, the value passed to the continuation here
named `end`) is an object literal that will be fed to the template file.
Finally, the `ask` parameter is an Ask instance (see later on for more
information).


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
        secure: true,
        key: 'https.key',
        cert: 'https.crt',
        ca: 'https.ca'
      }
    }

If you provide the relevant HTTPS files and set the `secure` option to true, the
server will be secure.

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

    campInstance.stack = [socketLayer, wsLayer, ajaxLayer, eventSourceLayer,
        routeLayer, staticLayer, notfoundLayer];

Each element of the route is a function which takes two parameters:

- an Ask object (more below),
- a `next` function, which the layer may call if it will not send an HTTP
  response.

The Ask class is a way to provide a lot of useful elements associated with a
request.  It contains the following fields:

- server: the Camp instance,
- req: the [http.IncomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage) object,
- res: the [http.ServerResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse) object,
- uri: the URI,
- path: the pathname associated with the request,
- query: the query taken from the URI.
- form: a `formidable.IncomingForm` object as specified by
  the [formidable](https://github.com/felixge/node-formidable)
  library API. Noteworthy are `form.uploadDir` (where the files are uploaded,
  this property is settable),
  `form.path` (where the uploaded file resides),
  and `form.on('progress', function(bytesReceived, bytesExpected) {})`.
- username, password: in the case of a Basic Authentication HTTP request, parses
  the contents of the request and places the username and password as strings in
  those fields.

Additionally, you can set the mime type of the response with
`ask.mime('text/plain')`, for instance.

### Default layers

The default layers provided are located in `camp.unit`.

These layers use functions that `camp` exports:

- `camp.ajaxUnit` (seen previously),
- `camp.socketUnit` (idem),
- `camp.wsUnit` (idem),
- `camp.eventSourceUnit` (idem),
- `camp.routeUnit` (idem),
- `camp.staticUnit` (idem),
- `camp.notfoundUnit` (idem),
- `server.documentRoot`: this string specifies the location of the root of
  your static web files.  The default is "./web".



- - -

Thaddee Tyl, author of ScoutCamp.

