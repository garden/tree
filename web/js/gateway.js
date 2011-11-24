// gateway.js: roaming motor behind the gateway system.
// It is used whenever a user hits a directory file.
// Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.


// Navigation code.
//

(function(){



var domfiles,   // DOM list in which we put the files in this directory.
    domdirpath;

// Show the list of String files in the domfiles element.
function setfiles(files) {
  var html = '';
  for (var i = 0;  i < files.length;  i++) {
    if (files[i].type === 'dir') files[i].name += '/';
    html += '<li><a href="' + encodeURI(cwd + files[i].name) + '">'
        + files[i].name + '</a></li>';
  }
  if (html.length === 0) {
	html += '<p>Nothing to see here!<br><a href="' + document.referrer +
	  '">Go back.</a></p>';
  }
  domfiles.innerHTML = html;
}


var cwd = decodeURI(document.location.pathname);  // common working directory.
if (cwd[cwd.length-1] !== '/') cwd += '/';
window.cwd = cwd;

// Set cwd to what #pathreq holds.
function chdir(newdir) {
  cwd = newdir;
  if (cwd[cwd.length-1] !== '/') cwd += '/';
  domdirpath.innerHTML = cwd;
  var url = document.location;
  history.pushState(cwd, cwd, url.origin + url.port + cwd);
  Scout.send (getfs) ();
}

onpopstate = function (event) {
  cwd = event.state !== null? event.state: cwd;
  domdirpath.innerHTML = cwd;
  Scout.send (getfs) ();
};


// Request information about the contents of a directory to the server.
function getfs(params) {
  console.log('getfs[op:ls,path:' + cwd + ']'); ///DEBUGGING
  params.action = 'fs';
  params.data = {op:'ls', path:cwd};
  params.resp = function (resp) {
    if (!resp.err) setfiles(resp.files);
  };
  params.error = function (err) {
    console.log('GETFS: error while getting', cwd);
  };
}


addEventListener('DOMContentLoaded', function (event) {
  domfiles = Scout('#files');
  domdirpath = Scout('#dirpath');
  domdirpath.innerHTML = cwd;
  document.title = cwd;

  Scout.send (getfs) ();
  //Scout('#req').on('submit', chdir);
}, false);




})();





// Fuzzy matching code.
//


(function () {



// What is a file?
// Mostly, once created, you can:
// - file.name to get its name
// - file.parent to get its parent file (or undefined if root)
// - file.getchildren(function(children){...})
//   to get its children (or an empty array if it doesn't have any).
function File(name, parent, type) {
  this.name = name || '';
  this.parent = parent;     // Root has an undefined parent.
  this.type = type || 'dir';
  this.children = [];
  this.memoized = false;
}

File.prototype.getchildren = function (cb) {
  if (this.memoized) {
    cb(this.children);
  } else {
    var that = this;
    Scout.send(function fuzzyfiles(params) {
      var path = that.fullpath();
      params.action = 'fs';
      params.data = {op:'ls', path:path};
      params.resp = function (resp) {
        if (!resp.err) {
          var children = [], file;
          for (var i = 0; i < resp.files.length; i++) {
            file = resp.files[i];
            children.push (new File (file.name, that, file.type));
          }
          that.children = children;   // Memoize the data.
          that.memoized = true;
          cb(children);
        }
      };
      params.error = function (err) {
        console.log('FILE: error while getting',this.name,'children');
      };
    })();
  }
};

File.prototype.fullpath = function () {
  return (this.parent? this.parent.fullpath() + '/': '') + this.name;
}



// Fuzzy matching


// Given a string filename and a list of characters chars, 
// returns a list containing a qualitative number of stars, and
// the part of the query that remains to be parsed.
function score (filename, query, depth) {
  var stars = 0;
  var afternonalpha = false;
  var alpha = /[a-zA-Z0-9]/;
  var consecmatch = 0;

  for (var i=0; i<filename.length; i++) {
    if (filename[i] === query[0]) {
      stars++;            // match!
      stars += depth;     // Counts more if closer to cwd.
      if (i === 0) {
        stars += 2;       // Counts more if start of filename.
      } else if (i === 1) {
        stars++;
      }
      var isalpha = alpha.test (filename[i]);
      if (isalpha && afternonalpha) {
        stars += 2; // Counts more if after nonalpha.
      }
      afternonalpha = !isalpha;
      stars += consecmatch;  // Numerous consecutive matches.
      consecmatch++;

      // Treat the query.
      query = query.slice(1);
      if (query.length === 0) { break; }
    } else if (query[0] === '/') {
      query = query.slice(1);
      break;
    } else {
      consecmatch = 0;
    }
  }

  // Never leave a / at the beginning.
  if (query[0] === '/') { query = query.slice (1); }
  return [stars, query];
};


function sorter (file1, file2) { return file2[1] - file1[1]; };


// `dir` is {name:'rootdir name', type:'dir'}.
// `query` is a String.
// `depth` is a Number.
// `cb` is a callback that takes the resulting list of
// [path, nbOfStars, remainingQuery].
// `initstars` is the initial number of stars, 0 by default.
function fuzzy (dir, query, depth, cb, initstars) {

  dir.getchildren(function (children) {
 
    // scoredpath is a list of [string path, int score, string consumed]
    // which determines how well the path is ranked and if it
    // contains all characters in the query.
    var scoredpath = [], filescore = 0, processingcount = 0;
    for (var i=0; i<children.length; i++) {
      filescore = score (children[i].name, query, depth);
      filescore[0] += initstars || 0;
      if (filescore[1].length === 0 ||
          (depth === 0 || children[i].type !== 'dir')) {
        scoredpath.push ([children[i], filescore[0], filescore[1]]);
        processingcount++;

        if (processingcount === children.length) {
          scoredpath.sort (sorter);
          cb (scoredpath);
        }
      } else {
        // More to be seen in depth...
        fuzzy (children[i], filescore[1], depth - 1, function (inside) {
          for (var j=0; j<inside.length; j++) {
            scoredpath.push ([inside[j][0], inside[j][1], inside[j][2]]);
          }
          processingcount++;

          if (processingcount === children.length) {
            scoredpath.sort (sorter);
            cb (scoredpath);
          }
        }, filescore[0]);
      }
    }
  });
}


addEventListener('DOMContentLoaded', function () {
  var pathreq = Scout('#pathreq'),
      cwdlen = cwd.length,
      root = new File(cwd[cwdlen-1] === '/'? cwd.slice(0,cwdlen-1): cwd);
  pathreq.addEventListener('input', function () {
    fuzzy(root, pathreq.value, 5, function (scoredpath) {
      var html = '', path;
      for (var i = 0;  i < scoredpath.length;  i++) {
        path = scoredpath[i][0].fullpath() +
            (scoredpath[i][0].type === 'dir'? '/': '');
        html += '<li><a href="' + path + '">' + path + '</a></li>';
      }
      Scout('#fuzzy').innerHTML = html;
    });
  }, false);
  window.root = root;
}, false);




})();

