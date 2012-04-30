// pencil.js: Some scripting for the Pencil.
// It is used whenever a user edits a file with the Pencil.
// Copyright © 2011 Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.


function stopEvent (e) {
  if (e.preventDefault) { e.preventDefault(); }
  if (e.stopPropagation) { e.stopPropagation(); }
};


// Controls
//

// Undo / Redo buttons
Scout('#undo').onclick = function (e) { cm.undo(); stopEvent(e); };
Scout('#redo').onclick = function (e) { cm.redo(); stopEvent(e); };

var disabledRegex = /(^|\s+)disabled($|\s+)/;

function enable (el) {
  el.className = el.className.replace(disabledRegex, ' ');
}

function disable (el) {
  if (!disabledRegex.test(el.className)) {
    el.className += ' disabled';
  }
}

function maybeEnable(stack, el) {
  if (stack.length === 0) {
    disable(el);
  } else {
    enable(el);
  }
}

// Run button
function runJS() {
  var result;
  try { result = eval(window.cm.getValue()); } catch (e) { result = e; }
  if (result === undefined) result = 'No errors!';
  alert(result);
}

// Theme button
function selectTheme(node) {
  window.cm.setTheme(node.options[node.selectedIndex].innerHTML);
};


// Hot back navigation
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


