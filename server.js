/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright (c) 2011 Jan Keromnes, Yann Tyl. All rights reserved.
 * Code covered by the LGPL license. */

var COPY = "<!doctype html>\n<title><\/title>\n\n<body>\n  <canvas id=tutorial width=150 height=150><\/canvas>\n\n  <script>\n    var canvas = document.getElementById('tutorial');\n    var context = canvas.getContext('2d');\n\n    context.fillStyle = 'rgb(250,0,0)';\n    context.fillRect(10, 10, 55, 50);\n\n    context.fillStyle = 'rgba(0, 0, 250, 0.5)';\n    context.fillRect(30, 30, 55, 50);\n  <\/script>\n<\/body>";

var DMP = require ('./lib/diff_match_patch.js');
var DIFF_EQUAL = DMP.DIFF_EQUAL;
var dmp = new DMP.diff_match_patch ();


// Each user is identified by a number, and has an associated lastcopy.
// eg, users = {'1234': {lastcopy: 'foo bar...',
//                       bufferhim: false, // Do we need to buffer for him?
//                       buffer: [],       // Deltas to be sent on dispatch.
//                       timeout: 0}}      // Time before we forget this user.
var users = {};


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



/* Lauching the server. */

var Camp = require ('./lib/camp.js');


// Buffering modifications.
var TimeoutBetweenDispatches = 60 * 40000;  // 4 min.
var userbuffer = {};
var usertimeouts = {};


// First time someone connects, he sends a data request.
Camp.add ('data', function (query) {
  users[query.user] = {
    lastcopy: COPY,
    bufferhim: false,
    buffer: [],
    timeout: 0
  };
  return {data: COPY? COPY: '\n'}; // If there is something to be sent, send it.
});


// Removing a user.
Camp.add ('kill', function (query) { delete users[query.user]; });


// We receive incoming deltas on the 'new' channel.
// query = { user: 12345, delta: "=42+ =12", rev: 1 }

Camp.add ('new', function addnewstuff (query) {
  console.log ('--receiving from', query.user, JSON.stringify (query.delta));///
  
  // Does the user already exist?
  if (!users[query.user]) {
    console.log ('--nonexisting user [' + query.user + ']');
    return {};
  }
  
  // Caching for users temporarily not listening to dispatch.
  for (var user in users) {
    if (users[user].bufferhim && user != query.user) {
      console.log ('--caching',query.delta,'for user',user);
      users[user].buffer.push (query);
    }
  }
  
  // Change our copy.
  console.log ('--sync', query.delta);
  var newdelta = query.delta;
  sync (users[query.user], query.delta, COPY, function(patch) {
    return COPY = dmp.patch_apply (patch, COPY) [0];
  }, function(delta) {
    newdelta = delta;
  });
  var newresp = {user: query.user, delta: newdelta, rev: query.rev};
  Camp.Server.emit ('modif', newresp);

  return {};
});


// We send outgoing deltas through the 'dispatch' channel.

Camp.add ('dispatch', function (query) {
  console.log ('--connect dispatch [' + query.user + ']');

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
      users[query.user].lastcopy = COPY;

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
});


// Time to serve the meal!
Camp.Server.start (80, true);
console.log('dev is live! http://localhost/');
