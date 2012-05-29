/* IRC persistent client API.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var irc = require('irc'),
    fs = require('./fs'),
    driver = require('./driver'),
    clients = {};

exports.join = function (data, end) {
  data.path = driver.normalize(data.path);

  if (!clients[data.path]) {
    var client = new irc.Client(
      data.serv,
      data.nick, {
        channels: [data.chan],
        autoConnect: false
    });

    clients[data.path] = client;

    client.connect(10, function() {
      client.join(data.chan, function() {
        client.ready = true;
        if (end) end();
      });
    });

    client.addListener('message', function(from, to, message) {
      console.log(from + ' => ' + to + ': ' + message);
    });
    client.addListener('pm', function(from, message) {
      console.log(from + ' => ME: ' + message);
    });
    client.addListener('message' + data.chan, function(from, message) {
      console.log(from + ' => ' + data.chan + ': ' + message);
      fs.file (data.path, function (err, file) {
        file.open(function() {
          file.content += '\n[' + (new Date()+'').substring(16,24) + '] ';
          file.content += from + ': ' + message;
          file.close();
        });
      });
    });
  } else if (end) end();
}

function say (client, chan, message, end) {
  if (!client.ready) {
    setTimeout(function() {
      if (client.buffer === undefined) client.buffer = [];
      if (message) client.buffer.push(message);
      say (client, chan, null, end)
    }, 500);
  } else {
    if (client.buffer !== undefined) {
      var i = 0; // FIXME use async?
      for (;;) {
        client.say(chan, client.buffer[i]);
        i++;
        if (i >= client.buffer.length) break;
      }
      client.buffer = undefined;
    }
    if (message) client.say(chan, message);
    if (end) end();
  }
}

exports.say = function (data, end) {
  data.path = driver.normalize(data.path);

  exports.join(data, function() {
    // TODO change serv / chan / nick if changed
    say(clients[data.path], data.chan, data.message, end);
  });
};
