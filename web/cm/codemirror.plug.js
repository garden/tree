/* codemirror.plug.js: glue between our collaboration engine and CodeMirror2.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */


// Prepare CodeMirror2's syntax highlighting scripts
var importCodeMirrorMode = ( function() {

  /// Mime types supported by CodeMirror2
  var mimes = {
    'text/css': 'css',
    'text/html': 'htmlmixed',
    'text/xml': 'xml',
    'image/svg+xml': 'xml',
    'text/javascript': 'javascript',
    'application/json': 'javascript',
    'text/x-csrc': 'clike',
    'text/x-c++src': 'clike',
    'text/x-java': 'clike',
    'text/x-groovy': 'clike',
    'text/x-clojure': 'clojure',
    'text/x-coffeescript': 'coffeescript',
    'text/x-diff': 'diff',
    'text/x-haskell': 'haskell',
    'text/x-lua': 'lua',
    'text/x-markdown': 'markdown',
    'text/n-triples': 'ntriples',
    'text/x-pascal': 'pascal',
    'text/x-perl': 'perl',
    'text/x-php': 'php',
    'text/x-plsql': 'plsql',
    'text/x-python': 'python',
    'text/x-rsrc': 'r',
    'text/x-rst': 'rst',
    'text/x-ruby': 'ruby',
    'text/x-rustsrc': 'rust',
    'text/x-scheme': 'scheme',
    'text/x-stsrc': 'smalltalk',
    'text/x-sparql-query': 'sparql',
    'text/x-stex': 'stex',
    'text/x-tiddlywiki': 'tiddlywiki',
    'text/velocity': 'velocity',
    'text/x-yaml': 'yaml'
  };

  /// Import CodeMirror2 mode scripts for a given mime type
  return function importCodeMirrorModes ( mime ) {
    var mode;
    if ( mime === 'text/html' ) {
      importCodeMirrorMode('text/css');
      importCodeMirrorMode('text/javascript');
    }
    if ( mime === 'text/html' || mime === 'text/x-markdown' ) { 
      importCodeMirrorMode('text/xml');
    }
    if ( mode = mimes[mime] ) {

      if ( mode === 'diff' || mode === 'tiddlywiki' || mode === 'markdown' || mode === 'rst' ) {
        var link = document.createElement('link');
        link.rel = "stylesheet";
        link.href = "/cm/mode/" + mode + "/" + mode + ".css";
        document.head.appendChild(link);
      }
      document.write("<script src='/cm/mode/" + mode + "/" + mode + ".js'></script>");
      document.addEventListener('DOMContentLoaded', function() {
        console.log('setting mode',mode,'because mime type is',mime);
        editor.setOption("mode",mode);
      });
    }
  };

})();


// Plug CodeMirror2 into TheFileTree for realtime text sync
function CodeMirrorPlug ( path, body, params, update ) { 

  /// Add onChange to the CodeMirror parameters.
  /// Creation of the editor.
  params.onChange = function onChange() {
    console.log('onChange() was triggered, notmychange is',client.notmychange);
    if (update) update(); // the page elements

    if (client.notmychange) {
      client.notmychange = false;
    } else if (plug !== undefined) {
      //// Here, we consider the differences between current text
      //// and the text we had last time we pushed changes.
      plug.newcontent (editor.getValue ());
    }
  };
  var editor = CodeMirror (body, params);

  /// Some useful primitive that talks to the CodeMirror editor.
  client.notmychange = false;
  var extenditor = {
    applydiff : function(change, editor) {
      for ( var i = 0, from = {'line':0,'ch':0}, to = {'line':0,'ch':0} ;
          i < change.length ; i++ ) {
        if ( change[i][0] == 1 ) {
          editor.replaceRange(change[i][1],from);
        }
        //// Find the changed range
        to.ch += change[i][1].length;
        var rest = change[i][1].length - editor.getRange(from,to).length;
        while ( rest > 0 ) {
          if ( to.line++ > editor.lineCount() ) {
            console.log('error: delta length inconsistency');
            break;
          }
          to.ch = rest-1;
          rest = change[i][1].length - editor.getRange(from,to).length;
        }
        if ( change[i][0] == -1 ) {
          editor.replaceRange('',from,to);
          to.line = from.line;
          to.ch = from.ch;
        } else {
          from.line = to.line;
          from.ch = to.ch;
        }
      }
    }
  }

  /// Creation of the plug.
  var plug = getplug (path, function onnewcontent (content) {
    client.notmychange = true;
    editor.setValue (content); // put the data in the editor.
    return editor.getValue ();
  }, function onnewdiff (diff) {
    client.notmychange = true;
    extenditor.applydiff (diff, editor);
    return editor.getValue ();
  });

  return editor;

};
