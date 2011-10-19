/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */


// SERVER CONFIGURATION
//

// Import modules
var Camp = require ('./camp/camp');

// Set parameters
var port = process.argv[2] || 80,
    debug = process.argv[3] || 0;


// FILE-SYSTEM ACCESS
//

// Redirection of `http://<DNS>.tld/root/something`
// to look for `/root/something`.
Camp.handle (/\/root\/?(.*)/, function (query, path) {
  console.log('-- In /root handler');
  path[0] = '/pencil.html';

  var data = {};
  data.path = path[1];
  console.log('-- data.path is %s', data.path);
  // TODO: in the future, this will be the #plug system.
  // If they want a directory, load gateway.
  arbor.getfile (path[1], function (err, file) {
    if (err) console.error(err);
    if (arbor.isoftype(file, 'text/plain')) {
      console.log('--Is a file');
      path[0] = '/pencil.html';
      data.lang = 'htmlmixed';
      var mime = arbor.typenamefromtype[file.type];
      if (true || mime === 'text/html')  { data.htmlmixed = true; } // TODO remove true
      data.mime = mime;
      console.log('--before fsplugged');
      var util = require('util');
      console.log(util.inspect(Camp.Server.listeners('fsplugged')));
      setTimeout(function() {
        console.log(util.inspect(Camp.Server.listeners('fsplugged')));
      }, 2000);
      Camp.Server.emit ('fsplugged');
      console.log('--after fsplugged');

    } else if (arbor.isoftype(file, 'dir')) {
      path[0] = '/gateway.html';
      console.log('-- Ready to ask for the directory\'s content');
      file.content (function (err, content) {
        console.log('-- Got content of directory');
        if (err) console.error(err);
        data.dir = content;
        data.filenames = [];
        for (var file in content) {
          data.filenames.push(file);
        }
        // testing
        for (var file in data.files) {
          console.log('-- file "%s"', data.files[file]);
        }
        console.log('-- Listeners of fsplugged are:');
        var util = require('util');
        console.log(util.inspect(Camp.Server.listeners('fsplugged')));
        setTimeout(function() {
          console.log(util.inspect(Camp.Server.listeners('fsplugged')));
        }, 2000);
        // end testing
        Camp.Server.emit('fsplugged');
      });
    }
  });

  console.log('teh data', JSON.stringify(data));
  //return data;
  return function fsplugged () { console.log('asldkjf'); return data; };
}, 'fsplugged');


var root;
var arbor = require ('./lib/fs');
arbor.getroot (function (err, fsroot) {
  root = fsroot;
});

Camp.add ('fs', function (query) {
  var data = {};
  switch (query['op']) {
    case 'ls':
    case 'cat':
      arbor.getfile (query['path'], function (err, dir) {
        if (err) console.error(err);
        dir.content (function (err, content) {
          if (err) console.error(err);
          data.dir = content;
          Camp.Server.emit ('fs');
        });
      });
      break;
    default:
      return {};
  }
  return function fs () {
    return data || {};
  };
}, 'fs');


// REAL-TIME COLLABORATION
//


var COPY = "<!doctype html>\n<title><\/title>\n\n<body>\n  <canvas id=tutorial width=150 height=150><\/canvas>\n\n  <script>\n    var canvas = document.getElementById('tutorial');\n    var context = canvas.getContext('2d');\n\n    context.fillStyle = 'rgb(250,0,0)';\n    context.fillRect(10, 10, 55, 50);\n\n    context.fillStyle = 'rgba(0, 0, 250, 0.5)';\n    context.fillRect(30, 30, 55, 50);\n  <\/script>\n<\/body>";

var DMP = require ('./lib/diff_match_patch.js');
var DIFF_EQUAL = DMP.DIFF_EQUAL;
var dmp = new DMP.diff_match_patch ();


// Each path (and the corresponding file) has several users.
//
// Each user is identified by a number, and has an associated lastcopy.
// eg, users = {'1234': {lastcopy: 'foo bar...',
//                       bufferhim: false, // Do we need to buffer for him?
//                       buffer: [],       // Deltas to be sent on dispatch.
//                       timeout: 0}}      // Time before we forget this user.
var usersforpath = {};


// Update the copy corresponding to a user, because of user input.
//
// client: { lastcopy: 'content before last sync' }
// delta: patch in delta form to apply to our copy.
// workingcopy: content of our copy, as a string.
// applylocally: function ( patch ) { return newWorkingCopy; }
// send: function ( delta ) { }
function sync (client, delta, workingcopy, applylocally, send) {

  // Patch last copy.
  // Note: dmp.patch_apply returns the resulting text in the first element
  // of the array.
  var lastcopydiff = dmp.diff_fromDelta (client.lastcopy, delta);
  var lastcopypatch = dmp.patch_make (client.lastcopy, lastcopydiff);
  client.lastcopy = dmp.patch_apply (lastcopypatch, client.lastcopy) [0];

  // Patch working copy.
  workingcopy = applylocally (lastcopypatch);

  // Create the patch that we want to send to the wire.
  var newdiff = dmp.diff_main (client.lastcopy, workingcopy);
  if (newdiff.length > 2) {
    dmp.diff_cleanupSemantic (newdiff);
    dmp.diff_cleanupEfficiency (newdiff);
  }

  // Update the last copy.
  client.lastcopy = workingcopy;
  
  // Send back the new diff if there is something to it.
  if (newdiff.length !== 1 || newdiff[0][0] !== DIFF_EQUAL) {
    send (unescape (dmp.diff_toDelta (newdiff)));    // Send the new delta.
  }
}



// Buffering modifications.
var TimeoutBetweenDispatches = 60 * 40000;  // 4 min.
var userbuffer = {};
var usertimeouts = {};


// First time someone connects, he sends a data request.
Camp.add ('data', function (query) {
  // `query` must have user, path.
  (usersforpath[query.path] = usersforpath[query.path] || {})[query.user] = {
    bufferhim: false,
    buffer: [],
    timeout: 0
  };
  // `data` is of the form: {data:'', err:''}
  var data = {};
  arbor.getfile (query.path, function (err, file) {
    if (err) { console.error(err); data.err = err.message; }
    file.content (function (err, content) {
      if (err) { console.error(err); data.err = err.message; }
      // If there is something to send, there we go.
      data.data = content || '\n';
      usersforpath[query.path][query.user].lastcopy = data.data;
      var util = require('util');
      console.log(util.inspect(Camp.Server.listeners('gotfiledata')));
      Camp.Server.emit ('gotfiledata');
    });
  });
  return function gotfiledata () { console.error('gotfiledata'); return data; }
}, 'gotfiledata');


// Removing a user.
Camp.add ('kill', function (query) {
  if (usersforpath[query.path] && usersforpath[query.path][query.user]) {
    delete usersforpath[query.path][query.user];
  }
});


// We receive incoming deltas on the 'new' channel.
// query = { user: 12345, delta: "=42+ =12", rev: 1 }

Camp.add ('new', function addnewstuff (query) {
  console.log ('--receiving from', query.user, JSON.stringify (query.delta));///
  
  // Does the user already exist?
  if (!usersforpath[query.path][query.user]) {
    console.log ('--nonexisting user [' + query.user + ']');
    return {};
  }

  // Caching for users temporarily not listening to dispatch.
  var users = usersforpath[query.path];
  for (var user in users) {
    if (users[user].bufferhim && user != query.user) {
      console.log ('--caching',query.delta,'for user',user);
      users[user].buffer.push (query);
    }
  }
  
  // Change our copy.
  console.log ('--sync', query.delta);
  var newdelta = query.delta;
  //try {
    // The file content must be in memory here
    // (indeed, the file.usercount is non-negative).
    var filecontent = arbor.fsfiles[query.path]._content;
    sync (users[query.user], query.delta, filecontent, function(patch) {
      return arbor.fsfiles[query.path]._content = dmp.patch_apply (patch, filecontent) [0];
    }, function(delta) {
      newdelta = delta;
    });
  //} catch (e) { console.error(e.message); console.trace(e); return {error:1};}
  var newresp = {user: query.user, delta: newdelta, rev: query.rev};
  Camp.Server.emit ('modif', newresp);

  return {};
});


// We send outgoing deltas through the 'dispatch' channel.

Camp.add ('dispatch', function (query) {
  console.log ('--connect dispatch [' + query.user + ']', query.path, usersforpath);

  var users = usersforpath[query.path];

  // Return userbuffer if there was information to send while dispatch was off.
  var userbuffer = users[query.user].buffer;
  if (userbuffer.bufferhim && userbuffer.length > 0) {
    console.log ('--returning cached content to',query.user);
    return userbuffer.shift();      // Don't wait, give the stuff.
  } else {
    userbuffer.bufferhim = false;   // and now, userbuffer.buffer is [].
    clearTimeout (users[query.user].timeout);
  }

  // "A wise sufi monk once said,
  // If what you have to say is not as pleasant as silence, do not talk."
  // We wait till we have something to say.
  return function modif (resp) {
    var modifier = resp.user;  // The guy that did the modification.
    if (modifier !== query.user) {

      // The modification was not made by the one that sent it.
      console.log ('--sending to', query.user, JSON.stringify (resp.delta));///
      console.log ('--hence closing dispatch for', query.user);///

      // Since we send it, it will be synced.
      users[query.user].lastcopy = arbor.fsfiles[query.path]._content;

      // Timeout adjustments.
      users[query.user].bufferhim = true;
      if (users[query.user].timeout > 0) {
        clearTimeout (users[query.user].timeout);
      }
      users[query.user].timeout = setTimeout (function activatebuffer () {
        delete users[query.user];  // Forget about this guy. Not worth it.
      }, TimeoutBetweenDispatches);

      return resp;             // Send the modification to the client.

    } else {
      return undefined;        // The user mustn't receive his own modification.
    }
  };
}, 'modif');


// Chat
Camp.add('talk', function(data) {
    Camp.Server.emit('incoming', data);
});
Camp.add('chat', function() {
  return function incoming(data){
    return data;
  };
}, 'incoming');


// Time to serve the meal!
Camp.Server.start (port, debug);
console.log('tree is live! http://localhost' + (port!==80 ? ':'+port : '') + '/');
