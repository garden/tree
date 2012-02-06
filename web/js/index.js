// index.js: Some scripting for the index page.
// Copyright © 2011 Jan Keromnes. All rights reserved.
// The following code is covered by the GPLv2 license.


// Navigation code.
//

document.addEventListener('keydown', function(e) {
  if (e.keyCode === 39) {
    // Right).
    window.location = document.getElementById('try').href;
  }
}, false);
