/* codemirror.plug.js: glue between our collaboration engine and CodeMirror2.
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */
 
function CodeMirrorPlug ( body, cm_params, uiactions ) { 

// Add onChange to the CodeMirror parameters.
// Creation of the editor.
cm_params.onChange = function onChange() {
  uiactions();  // Page elements

  if (client.notmychange) {
    client.notmychange = false;
  } else if (plug !== undefined) {
    // Here, we consider the differences between current text
    // and the text we had last time we pushed changes.
    
    plug.newcontent (editor.getValue ());
  }
};
var editor = CodeMirror (body, cm_params);


// Some useful primitive that talks to the CodeMirror editor.
client.notmychange = false;
var extenditor = {
  applydiff : function(change, editor) {
    for ( var i = 0, from = {'line':0,'ch':0}, to = {'line':0,'ch':0} ;
        i < change.length ; i++ ) {
      if ( change[i][0] == 1 ) {
        editor.replaceRange(change[i][1],from);
      }
      // find the changed range
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

// Creation of the plugger.
var plug = getPlugger (function onnewcontent (content) {
  client.notmychange = true;
  editor.setValue (content);     // Put the data in the editor.
  return editor.getValue ();
}, function onnewdiff (diff) {
  client.notmychange = true;
  extenditor.applydiff (diff, editor);
  return editor.getValue ();
});

return editor;

}
