// pencil.js: Some scripting for the Pencil.
// It is used whenever a user edits a file with the Pencil.
// Copyright © 2011 Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.



// UI
//

// CodeMirror theme
function selectTheme(node) {
  window.cm.setTheme(node.options[node.selectedIndex].innerHTML);
};

// Code execution
function runCode() {

  var lang = document.runform.lang.value;
  console.log(lang);

  // In browser
  if (lang === 'JavaScript') {
    setTimeout(runJS, 0);
    return false;
  }

  // Validators
  if (lang === 'HTML' || lang === 'XHTML' || lang === 'CSS' || lang === 'XML') {
    document.runform.action = 'http://validator.w3.org/unicorn/check#validate-by-input';
    document.runform.ucn_text.value = window.cm.getValue();
    switch (lang) {
      case 'HTML': document.runform.ucn_text_mime.value = 'text/html'; break;
      case 'XHTML': document.runform.ucn_text_mime.value = 'application/xhtml+xml'; break;
      case 'CSS': document.runform.ucn_text_mime.value = 'text/css'; break;
      case 'XML': document.runform.ucn_text_mime.value = 'text/xml'; break;
    }
    return true;
  }

  // CodePad.org
  document.runform.action = 'http://codepad.org/';
  document.runform.code.value = window.cm.getValue();
  return true;
};

// Run JavaScript
function runJS() {
  var result;
  try {
    result = eval(window.cm.getValue());
  } catch (e) {
    result = e;
  }
  if (result === undefined) result = 'No errors!';
  alert(result);
}


// Navigation
//

(function() {

  // Hot back shortcut is active
  var hotback = true;

  // If a key is pressed...
  addEventListener('keydown', function(e) {

    // If hot back is active and (Backspace or Left), we go back.
    if (hotback && (e.keyCode === 8 || e.keyCode === 37)) {
      //history.go(-1);
      var loc = window.location;
      window.location = loc.protocol + '//' + loc.host +
        loc.pathname.replace(/\/[^\/]+[\/]*$/,'/') + loc.search;
    }

    // If not Right, we deactivate hot back
    else if (e.keyCode !== 39) {
      hotback = false;
    }

  }, false);

  // If the user clicks, deactivate hot back
  addEventListener('mousedown', function() {hotback = false;});

})();


