// gateway.js: roaming motor behind the gateway system.
// It is used whenever a user hits a directory file.
// Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.


// Navigation code.
//

(function(){

var domfiles,   // DOM list in which we put the files in this directory.
    dompath;

// Show the list of String files in the domfiles element.
function setfiles(files) {
  var html = '';
  for (var i = 0;  i < files.length;  i++) {
    if (files[i].type === 'dir') files[i].name += '/';
    html +=
      // First, the delete button.
      '<li><a href="javascript:void(0)" class="fadedcontrol">&#x26d2;</a>'
      // Now, we want to have the file.
      + '<a class=file href="' + encodeURI(cwd + files[i].name) + '">'
      + files[i].name + '</a></li>';
  }
  if (html.length === 0) {
    html += '<p>Nothing to see here!<br><a href="' + document.referrer +
      '">Go back.</a></p>';
  }
  domfiles.innerHTML = html;
}


// Represent cwd with blocks
function setpath(path) {
  //console.log('setpath',path);
  cwd = path;
  /*document.title = path;
  var blocks = path.split('/'), htmlblocks = '';
  for ( var i in blocks ) {
    if ( blocks[i].length > 0 ) {
      htmlblocks += '&nbsp;<span class=block>' + blocks[i] + '</span>'
    }
  }
  dompath.innerHTML = htmlblocks;*/
}


var cwd = decodeURI(document.location.pathname);  // common working directory.
if (cwd[cwd.length-1] !== '/') cwd += '/';
window.cwd = cwd;

// Set cwd to what #pathreq holds.
function chdir(newdir) {
  //console.log('chdir',newdir);
  setpath(newdir[newdir.length-1] !== '/' ? newdir + '/' : newdir);
  var url = document.location;
  history.pushState(cwd, cwd, url.origin + url.port + cwd);
  Scout.send (getfs) ();
}
window.chdir = chdir;

onpopstate = function (event) {
  //console.log('onpopstate');
  setpath(event.state !== null ? event.state : cwd);
  Scout.send (getfs) ();
};


// Request information about the contents of a directory to the server.
function getfs(params) {
  //console.log('getfs[op:ls,path:' + cwd + ']'); ///DEBUGGING
  params.action = 'fs';
  params.data = {op:'ls', path:cwd};
  params.resp = function (resp) {
    if (!resp.err) setfiles(resp.files);
  };
  params.error = function (err) {
    //console.log('GETFS: error while getting', cwd);
  };
}


addEventListener('DOMContentLoaded', function (event) {
  domfiles = Scout('#files');
  dompath = Scout('#path');
  setpath(cwd);
  Scout('#pathreq').addEventListener('keydown', function(e) {
    //console.log('keydown');
    if ( e.keyCode === 8 && Scout('#pathreq').value.length === 0 ) history.go(-1);
  });
}, false);




})();





// Fuzzy matching.
//


(function () {


var leafs = [];

function sorter (file1, file2) { return file2[1] - file1[1]; };

// Return [leaf, stars, indexes]:
//
// - `leaf` is a String of the path.
// - `stars` is a Number to compare leafs according to the query.
// - `indexes` is the positions of matched letters.
//
// `leaf` is a String of the path from here to the leaf.
// `query` is a String to fuzzy match.
function score(leaf, query) {
  var stars = 0,
      index = query.length - 1,
      indexes = [],             // Position of matched letters.
      countlettersmatched = 0,  // Consecutive letters matched.
      alpha = /[a-zA-Z0-9]/,
      lookingAhead = false;     // Grant one last run and terminate.
  // The idea is to begin with the end of the `query`, and for each letter
  // matched, the letter is captured, its position influences the score, and we
  // go to the next letter.
  for (var i = leaf.length - 1; i >= 0; i--) {
    var l = leaf[i];  // letter

    if (countlettersmatched > 0 && !alpha.test(l)) {
      stars += 2;   // first letter after non-alphanumeric character is good.
    }

    if (l === query[index]) {
      indexes.push(i);
      stars++;      // match!
      stars += countlettersmatched;     // Consecutive matches is good.

      countlettersmatched++;
      index--;
    } else {
      countlettersmatched = 0;
    }
    if (lookingAhead)  break;       // The last run was already granted.
    else if (index < 0)  lookingAhead = true;   // Grant last run now.
  }
  if (lookingAhead)  stars++;
  return [leaf, stars, indexes];
}

// List of [leafpath, stars, indexes], ordered by the stars.
// Leafs that do not match the whole query are discarded.
//
// `leafs` is an Array of Strings of paths from here to the leaf.
// `query` is a String to fuzzy match.
function fuzzy (leafs, query) {
  var fuzzied = [];
  for (var i = 0; i < leafs.length; i++) {
    var sc = score(leafs[i], query);
    if (sc[2].length === query.length) {
      fuzzied.push(sc);
    }
  }
  return fuzzied.sort(sorter);
}


// Return an html string that highlights all letters matched in the score by a
// css ".fuzzymatch" class.
function scorify (score) {
  var htmled = score[0],
      offset = 0,
      beforelet = '<span class="fuzzymatch">',
      afterlet = '</span>',
      addition = beforelet.length + afterlet.length;
  for (var i = score[2].length - 1; i >= 0; i--) {
    htmled = htmled.slice(0, score[2][i] + offset) + beforelet
      + htmled[score[2][i] + offset] + afterlet
      + htmled.slice(score[2][i] + offset + 1);
    offset += addition;
  }
  return htmled;
}


addEventListener('load', function () {
  var pathreq = Scout('#pathreq'),
      depth = 3;        // default recursion level.

  // The very first time, we wait to load all leafs.
  pathreq.addEventListener('input', function firstfuzzy() {
    Scout.send(function(q) {
      q.action = 'fs';
      q.data = {op:'fuzzy', path:cwd, depth:depth};
      q.resp = function (r) {
        leafs = r.leafs;
        pathreq.removeEventListener('input', firstfuzzy, false);
        pathreq.addEventListener('input', showfuzzy, false);
        showfuzzy();
      };
    })();
  }, false);

  function showfuzzy () {
    var html = '',
        query = pathreq.value,
        scores = fuzzy(leafs, query);
    for (var i = 0;  i < scores.length;  i++) {
      // There is no remaining query (if the query is not complete, it is
      // not shown).
      var path = scorify(scores[i]);
      html += '<li><a href="' + scores[i][0] + '">'
        + '<div class="cursor">&nbsp;</div>'
        + path + '</a></li>';
    }
    Scout('#fuzzy').innerHTML = html;
    selectionInit();
  }
}, false);




})();



// Manual selection
//


(function() {


// Constants.
var req, res;

addEventListener('load', function () {
  req = Scout('#pathreq');
  res = Scout('#fuzzy').children;
  init();
}, false);

// State.
var pointer = -1,   // Item selected (-1 means "none").
    slots;          // DOM slots wherein you may show a cursor, or a space.
                    // (Those are initialized by the `init` function).

// Initialization occurs when the drop down entries are reset (or started). The
// entries already have the cursor.
function init () {
  // If there is an entry, set the pointer to the first entry.
  if (res.length > 0) { // If there is at least one entry...
    pointer = 0;        // ... set the pointer to the first item.
  }
  
  // Populate slots.
  slots = document.querySelectorAll('#fuzzy>li>a');
  
  setCursor(0);     // Put the cursor on the first entry.

  // Set the event listener.
  req.addEventListener('keydown', keyListener, false);
}

// Set the cursor to the entry specified.
//
// `entry` is a Number.
function setCursor (entry) {
  if (entry < 0 || entry >= slots.length)  return;
  if (pointer >= 0)  { slots[pointer].firstChild.innerHTML = '&nbsp;'; }
  pointer = entry;
  slots[pointer].firstChild.textContent = '>';
}

function nextEntry () { setCursor(pointer + 1); }

function prevEntry () { setCursor(pointer - 1); }


// When the search widget is focused, if the user presses up/down keys, and
// the enter key.
function keyListener (e) {
  if (e.keyCode === 40) {
    // Down.
    nextEntry();
    e.preventDefault();
  } else if (e.keyCode === 38) {
    // Up.
    prevEntry();
    e.preventDefault();
  } else if (e.keyCode === 13) {
    // Enter.
    window.location = slots[pointer].href;
  }
}

window.selectionInit = init;

})();


