/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */

var fleau = require('fleau');

// Let's rock'n'roll!
var camp = require('./lib/camp.js').start({
      port: +process.argv[2],
      secure: process.argv[3] === 'yes',
      debug: +process.argv[4],
      templateReader: fleau
    }),
    ajax = camp.ajax

// Templating demo
camp.route('/template.html', function(data, match, end) {
  end({    // Try http://localhost/template.html?title=Hello&info=[Redacted].
     title: data.title || 'Success'
   , info: data.info || 'This document has been templated!'
  })
})

// Doctor demo
var replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!'
              ,'Hm…', 'What do you mean?', 'So say we all.']
ajax.on('doctor', function(data, end) {
  replies.push(data.text)
  end({reply:replies[Math.floor(Math.random() * replies.length)]})
})

// Chat demo
var chat = camp.eventSource('all')
ajax.on('talk', function(data, end) {chat.send(data); end()})

// Websocket chat demo
camp.io.configure('development', function () { camp.io.set('log level', 0) })
camp.io.sockets.on('connection', function (socket) {
  socket.on('msg', function (data) { camp.io.sockets.emit('msg', data) })
})

// Not found demo
camp.notfound(/.*\.lol$/, function(data, match, end, ask) {
  match[0] = '/404.html'; end()
})

