/* plugger.js: allows plugs to have an api into the nifty collaboration engine.
 * Copyright (c) 2011 Thaddee Tyl & Jan Keromnes. All rights reserved.
 * */
 
(function () {


var debug = true;
// IE doesn't have a console, but we avoid a crash thanks to this.
//alert(window.console);
var console = (window.console && debug)? window.console: {
  log: function(){
    for (var arg in arguments)
      console.data = (console.data?console.data:'') + arg + ' ';
    console.data += '\n';
  }
};


// We need all the power of diff, match and patch.
var dmp = new diff_match_patch ();



///  Application Programming Interface.
//



// Information we keep on the state of the content of the editor.
window.client = {
  user: +(new Date()),
  rev: 0,
  copy: '',
  lastcopy: ''
};


var plug = {
  newcontent: function (content) {
    // Here, we consider the differences between current text
    // and the text we had last time we pushed changes.

    // Create the patch that we want to send to the wire.
    var newdiff = dmp.diff_main (client.lastcopy, content);
    if (newdiff.length > 2) {
      dmp.diff_cleanupSemantic (newdiff);
      dmp.diff_cleanupEfficiency (newdiff);
    }

    // Send back the new diff if there is something to it.
    if (newdiff.length !== 1 || newdiff[0][0] !== DIFF_EQUAL) {

      // Update the last copy.
      client.copy = client.lastcopy = content;

      // Send the new diff.
      Scout.send (sending (decodeURI(dmp.diff_toDelta (newdiff))
            .replace ('%','%25'))) ();
    }
  }
};

var givePlug = function (onnewcontent, onnewdiff) {
  if (onnewcontent) {
    plug.onnewcontent = onnewcontent;
    client.copy = onnewcontent (client.copy);

    plug.onnewdiff = onnewdiff;
  }
  return plug;
};



///  Synchronization components.
//



// We need this instance of scout to avoid conflicts.
var Scout2 = Scout.maker ();

// client: { lastcopy: 'content before last sync' }
// delta: patch (in delta form) to apply to our copy.
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
    // Send the new delta.
    send (decodeURI (dmp.diff_toDelta (newdiff)).replace('%','%25'));
  }
}


//1. This place is specifically designed to receive information from the server.

// Whenever we load the page, we shall send nothing to
// the "in" action of the server.
function getmodif (xhr, params) {

  params.open.url = '/$dispatch';
  params.data.user = client.user;
  console.log ('dispatched');
  
  params.resp = function receiving (xhr, resp) {
    // We received new information from a collaborator!
    // (this can be fired a long time after the enclosing function.)

    console.log ('received rev : ' + resp.rev + 
                 ', delta : ' + JSON.stringify(resp.delta));
    
    // We sync it to our copy.
    sync (client, resp.delta, client.copy, function applylocally(patch) {
      // Get what our content should look like after this function runs.
      var futurecontent = dmp.patch_apply (patch, client.copy) [0];
      // Figure out the difference w.r.t our working copy.
      var change = dmp.diff_main (client.copy, futurecontent);

      // Consult plug.
      client.copy = (plug.onnewdiff? plug.onnewdiff (change):
        plug.onnewcontent (futurecontent));

      return client.copy;
    }, function sendnewdelta (delta) {
      Scout.send (sending (delta)) ();
    });
    
    Scout2.send (getmodif) ();   // We relaunch the connection.
  };

  params.error = function receiveerror(xhr, status) {
    console.log('getmodif xhr error: status',status);
    var now = +new Date ();
    if (status === 0 && now - lastnetworkissue > 5000) {
      // Network issues are not too frequent.
      lastnetworkissue = now;
      Scout2 = Scout.maker();
      Scout2.send (getmodif) ();   // We relaunch the connection.
    } else {
      console.log ('connection lost.');
    }
  };
}
var lastnetworkissue = 0;


//2. This place is specifically designed to send information to the server.

// We want to listen to the event of code modification.
function sending (delta) {
  return function (xhr, params) {

    // If there was no modification, we do not do anything.
    if (delta.length === 0) { return; }

    params.data = {
      rev: client.rev++,      // Newly sent delta begets new revision.
      user: client.user,
      delta: delta
    };

    params.open.url = '/$new';
    
    // DEBUG
    console.log('sending: ' + JSON.stringify(params.data));
    params.resp = function () {
      console.log ('sent');
    };
    
    params.error = function senderror (xhr, status) {
      console.log('send error: status',JSON.stringify(status));
    };

  };
}


//3. This place handles getting it all the first time... and death.


// Get the data.
// WARNING: If there's a delay with codemirror, this might cause a problem.
// Best is to place this call in an onLoad function.
Scout.send (function (xhr, params) {
  params.open.url = '/$data';
  params.data.user = client.user;
  params.resp = function (xhr, resp) {
    console.log ('got content');///

    client.copy = client.lastcopy = resp.data;
    plug.onnewcontent (client.copy);

    Scout2.send (getmodif) ();      // Make the first dispatch link.
  };
}) ();

// When we leave, tell the server.
window.onunload = function () {
  Scout.send (function (xhr, params) {
    params.open.url = '/$kill';
    params.data.user = client.user;
  }) ();
};




///  Exports.
//


//   getPlugger ( onnewcontent, onnewdiff )
//
// The onnewcontent ( content ) function is fired every time there is new
// content, and we need to clean all content up.
// The optional onnewdiff ( diff ) function is fired when there is new content
// to take into account, and the onnewdiff function exists.
// Those functions must both return the current content of the data.
//
// The result has a method newcontent ( content ) that sends the new content to
// the server.
//
window.getPlugger = givePlug;

}) ();
