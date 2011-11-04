// gateway.js: roaming motor behind the gateway system.
// It is used whenever a user hits a directory file.
// Copyright © 2011 Thaddee Tyl, Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.

(function(){



var domfiles,   // DOM list in which we put the files in this directory.
    dompathreq,
    domdirpath;

// Show the list of String files in the domfiles element.
function setfiles(files) {
  var html = '';
  for (var i = 0;  i < files.length;  i++) {
    html += '<li><a href="' + cwd + files[i] + '">' + files[i] + '</a></li>';
  }
  domfiles.innerHTML = html;
}


var cwd = document.location.pathname;  // common working directory.

// Set cwd to what #pathreq holds.
function chdir() {
  cwd = dompathreq.value;
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
    console.log(resp.filenames);  ///DEBUGGING
    if (!resp.err) setfiles(resp.filenames);
    else console.log(resp.err);   ///DEBUGGING
  };
};


window.onload = function (event) {
  domfiles = Scout('#files');
  domdirpath = Scout('#dirpath');
  domdirpath.innerHTML = cwd;
  dompathreq = Scout('#pathreq');
  dompathreq.value = cwd;
  document.title = cwd;

  Scout.send (getfs) ();
  Scout('#req').on('submit', chdir);
};




})()
