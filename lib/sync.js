/* sync.js: all synchronization (realtime) primitives are here.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

var camp = require ('../camp/camp'),
    arbor = require ('./fs');

// REAL-TIME COLLABORATION
//


var DMP = require ('./diff_match_patch.js'),
    DIFF_EQUAL = DMP.DIFF_EQUAL,
    dmp = new DMP.diff_match_patch ();


// Each path (and the corresponding file) has several users.
//
// Each user is identified by a number, and has an associated file.
// It also has an associated lastcopy, which is used for three-way merges.
//
// eg, users = {'1234': {lastcopy: 'foo bar...',
//                       file: <File object>,
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


// Primitives for handling users.

function addusertopath(user, path) {
  (usersforpath[path] = usersforpath[path] || {})[user] = {
    bufferhim: false,
    buffer: [],
    timeout: 0
  };
}

function userreadsfile(user, path) {
  // `data` is of the form: {data:'', err:''}
  var data = {};
  arbor.getfile (path, function (err, file) {
    if (err) { console.error(err); data.err = err.message; }
    else {
      usersforpath[path][user].file = file;
      file.open();      // Indicate that we edit the file.
      file.content (function (err, content) {
        if (err) { console.error(err); data.err = err.message; }
        // If there is something to send, there we go.
        data.data = content;
        usersforpath[path][user].lastcopy = data.data;
        var util = require('util');
        camp.Server.emit ('gotfiledata', data);
      });
    }
  });
}

function removeuser(user, path) {
  if (usersforpath[path] && usersforpath[path][user]) {
    // No longer editing this file.
    if (usersforpath[path][user].file) usersforpath[path][user].file.close();
    delete usersforpath[path][user];
  }
}

function modifications (query) {
  console.log ('$NEW: receiving from', query.user, JSON.stringify (query.delta));///
  
  // Does the user already exist?
  if (!usersforpath[query.path][query.user]) {
    console.log ('$NEW: nonexisting user [' + query.user + ']');
    return {};
  }

  // Caching for users temporarily not listening to dispatch.
  var users = usersforpath[query.path];
  for (var user in users) {
    if (users[user].bufferhim && user != query.user) {
      console.log ('$NEW: caching',query.delta,'for user',user);
      users[user].buffer.push (query);
    }
  }
  console.log('$NEW: users for path', query.path, 'are', users);
  
  // Change our copy.
  console.log ('$NEW: sync', query.delta);
  var newdelta = query.delta;
  try {
    // The file content must be in memory here
    // (indeed, the file.usercount is non-negative).
    //console.log('$NEW: fsfiles contains', arbor.fsfiles, 'and query.path is', query.path);
    var filecontent = arbor.fsfiles[query.path]._content;
    console.log('$NEW: filecontent ('+filecontent.length+')',filecontent);
    sync (users[query.user], query.delta, filecontent, function(patch) {
      return arbor.fsfiles[query.path]._content = dmp.patch_apply (patch, filecontent) [0];
    }, function(delta) {
      newdelta = delta;
    });
  } catch (e) {
    console.error(e.message);
    console.trace(e);
    return {error:1};
  }

  // For each user, we update all data.
  for (var user in users) {
    // Since we send it, it will be synced.
    users[user].lastcopy = arbor.fsfiles[query.path]._content;

    // Timeout adjustments.
    users[user].bufferhim = true;
    if (users[user].timeout > 0) {
      clearTimeout (users[user].timeout);
    }
    users[user].timeout = setTimeout (function activatebuffer () {
      delete users[user];  // Forget about this guy. Not worth it.
    }, TimeoutBetweenDispatches);
  }

  camp.Server.emit ('dispatchmodif', {
    user: query.user,
    path: query.path,
    delta: newdelta,
    rev: query.rev
  });

  return {};
}

function settledispatch(user, path) {
  console.log ('$DISPATCH: connect dispatch [' + user + ']');

  var users = usersforpath[path];

  // Return userbuffer if there was information to send while dispatch was off.
  var userbuffer = users[user].buffer;
  if (userbuffer.bufferhim && userbuffer.length > 0) {
    console.log ('$DISPATCH: returning cached content to', user);
    return userbuffer.shift();      // Don't wait, give the stuff.
  } else {
    userbuffer.bufferhim = false;   // and now, userbuffer.buffer is [].
    clearTimeout (users[user].timeout);
  }
}

function dispatchmodif(resp, user) {
  // The modification was not made by the one that sent it.
  if (usersforpath[resp.path][user] !== undefined) {
    console.log('$DISPATCH: user', resp.user, 'for path', resp.path);
    console.log('$DISPATCH: usersforpath is', usersforpath);
    return resp;             // Send the modification to the client.
  }
}


// Main entry point.


function launchactions() {
  // First time someone connects, he sends a data request.
  camp.add ('data', function (query) {
    // `query` must have user, path.
    addusertopath(query.user, query.path);
    console.log('$DATA: usersforpath becomes', usersforpath);

    userreadsfile(query.user, query.path);
  }, function gotfiledata(data) {
    console.log('$DATA: gotfiledata');
    return data;
  });


  // Removing a user.
  camp.add ('kill', function (query) { removeuser(query.user, query.path); });


  // We receive incoming deltas on the 'new' channel.
  // query = { user: 12345, path: 'path/to/file', delta: "=42+ =12", rev: 1 }

  camp.add ('new', modifications);


  // We send outgoing deltas through the 'dispatch' channel.

  camp.add ('dispatch', function (query) {
    settledispatch(query.user, query.path);

    return query.user;

    // "A wise sufi monk once said,
    // If what you have to say is not as pleasant as silence, do not talk."
    // We wait till we have something to say.
  }, dispatchmodif);

}


// Exports go here.
//

exports.main = launchactions;

