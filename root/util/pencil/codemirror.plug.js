/* codemirror.plug.js: glue between our collaboration engine and CodeMirror2.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * The following code is covered by the GPLv2 license. */


// Plug CodeMirror2 into TheFileTree for realtime text sync
function CodeMirrorPlug ( path, body, params, update ) { 

  /// Add onChange to the CodeMirror parameters.
  /// Creation of the editor.
  params.onChange = function onChange(ed, change) {
    console.log('onChange change: ', change);
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

  editor.setTheme = function(theme) {
    editor.setOption("theme", theme);
    document.body.className = document.body.className.replace(/cm-s-\w+/, "cm-s-"+theme);
  }

  /// Temporary mime type fix for `+xml`
  if (params.mode.indexOf('+xml') == params.mode.length - 4) editor.setOption('mode','xml');
  if (params.theme && params.theme.length > 0) editor.setTheme(params.theme);

  /// CodeMirror extension for content syncing.
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

