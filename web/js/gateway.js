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
  document.title = path;
  /*var blocks = path.split('/'), htmlblocks = '';
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

// Return the number of slashes in the path (ie, the depth).
function depth (leaf) {
  var depth = 0;
  for (var i = 0; i < leaf.length; i++) {
    if (leaf[i] === '/')  depth++;
  }
  return depth;
}

// Return [leaf, stars, index]:
//
// - `leaf` is a String of the path.
// - `stars` is a Number to compare leafs according to the query.
// - `index` is the remaining non-processed characters in the query.
//
// `leaf` is a String of the path from here to the leaf.
// `query` is a String to fuzzy match.
function score(leaf, query) {
  var stars = 0,
      index = index || query.length - 1,
      countlettersmatched = 0,  // Consecutive letters matched.
      alpha = /[a-zA-Z0-9]/;
  // The idea is to begin with the end of the `query`, and for each letter
  // matched, the letter is captured, its position influences the score, and we
  // go to the next letter.
  for (var i = leaf.length - 1; i >= 0; i--) {
    var l = leaf[i];  // letter

    if (countlettersmatched > 0 && !alpha.test(l)) {
      stars += 2;   // first letter after non-alphanumeric character is good.
    }

    if (l === query[index]) {
      stars++;      // match!
      //stars -= depth(leaf.slice(0, i)); // Too much depth is bad.
      stars += countlettersmatched;     // Consecutive matches is good.

      countlettersmatched++;
      index--;
      if (index < 0)  break;
    } else {
      countlettersmatched = 0;
    }
  }
  return [leaf, stars, index];
}

// List of [leafpath, stars, index], ordered by the stars.
//
// `leafs` is an Array of Strings of paths from here to the leaf.
// `query` is a String to fuzzy match.
function fuzzy (leafs, query) {
  var fuzzied = [];
  for (var i = 0; i < leafs.length; i++) {
    fuzzied.push(score(leafs[i], query));
  }
  return fuzzied.sort(sorter);
}


addEventListener('DOMContentLoaded', function () {
  var pathreq = Scout('#pathreq'),
      depth = 4;        // default recursion level.

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
      if (scores[i][2] < 0) {
        // There is no remaining query (if the query is not complete, it is
        // not shown).
        var path = scores[i][0] +
            (scores[i][0].type === 'dir'? '/': '');
        html += '<li><a href="' + path + '">' + path + '</a></li>';
      }
    }
    Scout('#fuzzy').innerHTML = html;
  }
}, false);




})();

