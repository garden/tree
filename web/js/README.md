WALK THROUGH /web/js/
=====================

- `diff_match_patch.js` contains fancy algorithms to extract the difference
  between two textual files.  It is a Neil Fraser project.  It is needed by
  `plugger.js`.  More information at
  <http://code.google.com/p/google-diff-match-patch/wiki/API>
- `plugger.js` contains an API that allows seamless textual synchronization for
  plugs, and an interface to created plugs.
- `fuzzy.js` is a node.js program (run it through `node fuzzy.js`!) whose
  purpose is to experiment with the rating function in the fuzzy completion
  algorithm.  This algorithm is run for real in `gateway.js`.
- `gateway.js` contains the JS code that is run in web/gateway.html.
- `scout.js` is a JS library to ease the development effort behind Ajax
  requests.  More information is available at
  <http://espadrine.github.com/ScoutCamp/doc/manual.html>
- `split.js` is an ongoing effort to build some sort of windowing system.



plugger.js
----------


### The API

This file encapsulates all textual synchronization that the plug may want to do.
It has the following API that the plug may use:

    // `path` is the path (from the root of The File Tree), not including the
    // initial slash, to locate the file you want synchronized.
    var plug = getplug ( path, function onnewcontent ( content ) {
      // This function is fired when you need to update
      // the whole file data at once (eg, on startup).
    }, function onnewdiff ( diff ) {
      // This function is fired when we get modifications from another user on
      // the server.  Update the working copy to reflect the contents
      // of the diff.
    });

Now, `plug` is a function that you call `plug ( content )`, to send new content
to the server, whenever you see fit.

The `onnewdiff` function is the toughest piece of meat you need to take care of.
The diff is a complex structure that encapsulates all the data you need to
modify, and no more.  It is an Array that contains a sequence of Array elements,
each containing two fields.  These fields have of the following forms:

- [ 0, 'text that did not change' ]
- [ 1, 'text that was inserted' ]
- [ -1, 'text that was deleted' ]

Usually, you will skip the text that did not change, insert the text that was
inserted, and remove the text that was deleted, in a single `for` loop.


### How it works

Textual synchronization uses the `diff` algorithm.

Each file can have multiple editors at the same time.  Each editor has a working
copy (which he modifies; it is handled by the plug), and a shadow copy (called
`client.lastcopy` in `plugger.js`).  Every time we have information to send, the
`diff` algorithm is run between the working copy and the shadow copy.  The
result is the changes that he just made.  Those modifications are sent in a
compressed delta to the server, which has its own working copy and one shadow
copy for each user.  He dispatches those modifications to each user.

When a user receives modifications, there is a small "stop the world" process.
A `diff` is made between the shadow copy and the modifications.  The shadow copy
then gets patched with this diff.  That same patch is then applied to the
working copy.  Immediately after that, we generate a diff between the working
copy and the shadow copy, which we send to the wire.  Then, we decide to update
the shadow copy to the state of the working copy.

