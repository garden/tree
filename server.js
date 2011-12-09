/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */

// Please look for documentation in `./Server.md`


// SERVER CONFIGURATION
//

// Location of the root. If this is "/root", the fake root
// will be at "http://example.com/root/".
ROOT_PREFIX = '/root';

// Import modules
var camp = require ('./camp/camp'),
    arbor = require ('./lib/fs'),
    prof = require ('./lib/profiler'),
    nodepath = require ('path');



// FILE-SYSTEM ACCESS
//

// Redirection of `http://<DNS>.tld/root/something`
// to look for `/root/something`.
camp.handle (new RegExp(ROOT_PREFIX + '/(.*)'), function (query, path) {

  // Default plug
  path[0] = '/pencil.html';

  // Template data
  var data = {path:path[1]};

  // TODO: in the future, this will be the #plug system.
  // If they want a directory, load gateway.
  ///console.log('SERVER:ROOT: what is %s?', path[1]);
  arbor.getfile (path[1], function (err, file) {
    if (err) {
      console.error(err);
      data.error = err.message;
      camp.Server.emit ('fsplugged', data);
    }
    if (arbor.isoftype(file, 'text/plain')) {
      path[0] = '/pencil.html';
      var mime = arbor.typenamefromtype[file.type];
      data.mime = mime;
      var util = require('util');
      camp.Server.emit ('fsplugged', data);

    } else if (arbor.isoftype(file, 'dir')) {
      ///console.log('SERVER:ROOT: %s is a dir', file);
      path[0] = '/gateway.html';
      data.nav = path[1].split('/').filter(function(e){return e.length > 0;});
      file.content (function (err, content) {
        if (err) console.error(err);
        data.filenames = [];
        for (var file in content) {
          if (arbor.isoftype(content[file],'dir')) file += '/';
          data.filenames.push(file);
        }
        ///console.log('SERVER:ROOT: data sent from dir is', data);
        camp.Server.emit('fsplugged', data);
      });
    }
  });

}, function fsplugged(data) {
  return data;
});


var root;
arbor.getroot (function (err, fsroot) {
  root = fsroot;
});

// Ajax FS API.

camp.add ('fs', function (query) {
  var data = {};
  console.log('SERVER:FS: got query.path', query.path);
  if (query.path) query.path = query.path.slice(ROOT_PREFIX.length);
  switch (query['op']) {
    case 'ls':
      ///console.log('SERVER:FS: doing some ls');
      arbor.getfile (query['path'], function (err, dir) {
        ///console.log('SERVER:FS: got ' + query.path + ' content');
        if (err) { data.err = err;
          ///console.log('SERVER:FS: data sent from dir is', data);
          camp.Server.emit('fs', data); return; }
        dir.content (function (err, content) {
          if (err) { data.err = err; camp.Server.emit('fs', data); return; }
          data.files = [];
          for (var file in content) {
            var filedata = {name:file,
                type:arbor.typenamefromtype[content[file].type]};
            data.files.push(filedata);
          }
          ///console.log('SERVER:FS: data sent from dir is', data);
          camp.Server.emit ('fs', data);
        });
      });
      break;
    case 'cat':
      arbor.getfile (query['path'], function (err, file) {
        if (err) { data.err = err; camp.Server.emit('fs', data); return; }
        data.type = file.type;  // eg, 'text/html'
        data.name = nodepath.basename(query.path);
        file.content (function (err, content) {
          if (err) { data.err = err; camp.Server.emit('fs', data); return; }
          data.content = content;
          camp.Server.emit ('fs', data);
        });
      });
    case 'touch':
      //create file
    case 'rm':
      //delete file
    case 'cp':
      //copy file
    default:
      return {};
  }
}, function fs(data) {
  return data || {};
});


// REAL-TIME COLLABORATION
//


var DMP = require ('./lib/diff_match_patch.js');
var DIFF_EQUAL = DMP.DIFF_EQUAL;
var dmp = new DMP.diff_match_patch ();


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


// First time someone connects, he sends a data request.
camp.add ('data', function (query) {
  // `query` must have user, path.
  (usersforpath[query.path] = usersforpath[query.path] || {})[query.user] = {
    bufferhim: false,
    buffer: [],
    timeout: 0
  };
  console.log('$DATA: usersforpath becomes', usersforpath);

  // `data` is of the form: {data:'', err:''}
  var data = {};
  arbor.getfile (query.path, function (err, file) {
    if (err) { console.error(err); data.err = err.message; }
    else {
      usersforpath[query.path][query.user].file = file;
      file.open();      // Indicate that we edit the file.
      file.content (function (err, content) {
        if (err) { console.error(err); data.err = err.message; }
        // If there is something to send, there we go.
        data.data = content;
        usersforpath[query.path][query.user].lastcopy = data.data;
        var util = require('util');
        camp.Server.emit ('gotfiledata', data);
      });
    }
  });
}, function gotfiledata(data) {
  console.log('$DATA: gotfiledata');
  return data;
});


// Removing a user.
camp.add ('kill', function (query) {
  if (usersforpath[query.path] && usersforpath[query.path][query.user]) {
    // No longer editing this file.
    usersforpath[query.path][query.user].file.close();
    delete usersforpath[query.path][query.user];
  }
});


// We receive incoming deltas on the 'new' channel.
// query = { user: 12345, path: 'path/to/file', delta: "=42+ =12", rev: 1 }

camp.add ('new', function addnewstuff (query) {
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

  camp.Server.emit ('modif', {
    user: query.user,
    path: query.path,
    delta: newdelta,
    rev: query.rev
  });

  return {};
});


// We send outgoing deltas through the 'dispatch' channel.

camp.add ('dispatch', function (query) {
  console.log ('$DISPATCH: connect dispatch [' + query.user + ']');

  var users = usersforpath[query.path];

  // Return userbuffer if there was information to send while dispatch was off.
  var userbuffer = users[query.user].buffer;
  if (userbuffer.bufferhim && userbuffer.length > 0) {
    console.log ('$DISPATCH: returning cached content to', query.user);
    return userbuffer.shift();      // Don't wait, give the stuff.
  } else {
    userbuffer.bufferhim = false;   // and now, userbuffer.buffer is [].
    clearTimeout (users[query.user].timeout);
  }

  return query.user;

  // "A wise sufi monk once said,
  // If what you have to say is not as pleasant as silence, do not talk."
  // We wait till we have something to say.
}, function modif(resp, user) {
  // The modification was not made by the one that sent it.
  //console.log ('--sending to', query.user, JSON.stringify (resp.delta));///
  //console.log ('--hence closing dispatch for', query.user);///
  if (usersforpath[resp.path][user] !== undefined) {
    console.log('$DISPATCH: user', resp.user, 'for path', resp.path);
    console.log('$DISPATCH: usersforpath is', usersforpath);
    return resp;             // Send the modification to the client.
  }
});


// Chat
camp.add('talk', function(data) { camp.Server.emit('incoming', data); });
camp.add('chat', function() {}, function incoming(data) { return data; });


// Options
var options = {
  port: +process.argv[2],
  secure: process.argv[3],
  debug: +process.argv[4]
}

// Let's rock'n'roll!
camp.start (options);

console.log('tree is live! ' + ( options.secure === 'yes' ? 'https' : 'http' )
    + '://localhost' + ( options.port !== 80 ? ':' + options.port : '' ) + '/');


