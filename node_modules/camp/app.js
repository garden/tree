/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */


// Let's rock'n'roll!
var camp = require('.').start({
      port: +process.argv[2],
      secure: process.argv[3] === 'yes',
      debug: +process.argv[4]
    }),
    ajax = camp.ajax

// Templating demo
camp.route('/template.html', function(data, path) {
  return {    // Try http://localhost/template.html?title=Hello&info=[Redacted].
     title: data.title || 'Success',
     enc: data.enc || 'utf-8',
     info: data.info || 'This document has been templated!'
  }
})

// Doctor demo
var replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!',
               'Hm…', 'What do you mean?', 'So say we all.']
ajax.on('doctor', function(data, end) {
  replies.push(data.text)
  end({reply:replies[Math.floor(Math.random() * replies.length)]})
});

// Chat demo
var chat = camp.eventSource('all')
ajax.on('talk', function(data, end) {chat.send(data); end()})

// Not found demo
camp.notfound(/.*\.lol$/, function(data, path, ask) { path[0] = '/404.html' })

