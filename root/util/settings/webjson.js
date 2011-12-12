/* json2all.js: display json.
 * Copyright (c) 2010 Thaddee Tyl. All rights reserved.
 */

JSON.getweb = {};
JSON.web = function (obj, id, opts) {
  /* Display json object obj in html structure of id id.
   * If obj is a string, it is the location of a json file.
   * The optional parameters include opts.rewrite, which
   * activates the possibility to change it, and
   * opts.reviver, which is a function to filter the object.
   * Example of use:
   *  <html>
   *   <body id="locat"></body>
   *   <script>
   *    var locat = JSON.web({hello:'world'}, 'locat', {template:'rewrite'});
   *    if( locat() ) {  // if it has changed...
   *      alert( JSON.getweb['locat'] );
   *    }
   *   </script>
   *  </html>  */
  if (typeof obj === 'string') {
    obj = JSON.parse(obj, opts.reviver);
  }

  /* Where is data located? */
  var hasChanged = false;
  JSON.getweb[id] = obj;
  
  /* Display in struct. */
  var html = JSON._parseObj(JSON.getweb[id], '', id, opts.template);
  var struct = document.getElementById(id);
  struct.innerHTML = html;

  /* Return a function to check changes. */
  return function () {
    if (hasChanged) {
      /* Data has changed. */
      hasChanged = false;
      return true;
    } else {
      /* Data has not changed. */
      hasChanged = false;
      return false;
    }
  };
}

JSON._parseObj = function(obj, path, id, template) {
  /* Parse obj and return an html string. */
  /* First, let's treat the template. */
  var deal;
  if (template === undefined) {
    deal = JSON._plates.readonly;
  } else {
    deal = JSON._plates[template];
  }
  /* We put it all in html. */
  var html = '';
  if (typeof obj === 'object') {
    if (obj === null) {
      /* Here, obj is null. */
      html += deal['null'](obj);
    } else if (obj.indexOf !== undefined) {
      /* Here, obj is a list. */
      html += deal.list(obj, path, id, template);
    } else {
      /* Here, obj is an object. */
      html += deal.obj(obj, path, id, template);
    }
  } else if (typeof obj === 'string') {
    /* Here, obj is a string. */
    html += deal.str(obj, path, id);
  } else if (typeof obj === 'number') {
    /* Here, obj is a number. */
    html += deal.num(obj, path, id);
  } else if (typeof obj === 'boolean') {
    /* Here, obj is a boolean. */
    html += deal.bool(obj, path, id);
  }
  return html;
};

JSON._plates = {};
JSON._plates.readonly = {
  'obj': function(obj, path, id, template) {
    var html = '';
    html += '<dl>';
    var i;
    for (i in obj) {
      html += '<dt>' + i + ':<dd>' + JSON._parseObj(obj[i], '', id, template);
    }
    if (i === undefined) {
      html += '<dd>Empty object here.';
    }
    html += '</dl>';
    return html;
  },
  'list': function(obj, path, id, template) {
    var html = '';
    html += '<ul>';
    for (var i=0; i<obj.length; i++) {
      html += '<li>' + JSON._parseObj(obj[i], '', id, template);
    }
    if (i == 0) {
      html += '<li>Empty list here.';
    }
    html += '</ul>';
    return html;
  },
  'str': function(obj) {
    return obj;
  },
  'num': function(obj) {
    return obj;
  },
  'bool': function(obj) {
    return (obj? 'true': 'false');
  },
  'null':function(obj) {
    return 'null';
  }
};
JSON._plates.rewrite = {
  'objdt': function(path, id, key) {
    return '<span style="border:1px solid black">%</span>' +
        /* Remove: 1. Data; 2. Graphics. */
        '<button onclick="delete JSON.getweb[\'' + id + '\']' +
        path + '[\''+key+'\']; ' +
        'this.parentNode.parentNode.removeChild(' +
            'this.parentNode.nextSibling);' +
        'this.parentNode.parentNode.removeChild(this.parentNode);' +
        '">x</button>' +
        /* Modification of a key! 1. Copy key; 2. Remove old key. */
        /*  TODO
        '<input value="' + key + '" ' +
        'oninput="JSON.getweb[\'' + id + '\']' +
        path + '[this.value] = JSON.getweb[\'' + id + '\']' +
        path + '[\''+key+'\']; delete JSON.getweb[\'' + id + '\']' +
        path + '[\''+key+'\']"' +
        '/>:</dt><dd>' +
        */
        key + ':</dt>'
  },
  'obj': function(obj, path, id, template) {
    /* This function uses the path of the current object to alter
     * the value of its elements. */
    /* path: string, eg, '["hello"][4][2]'. */
    /* id: string of container id, eg, 'show'. */
    var html = '';
    html += '<dl>';
    var i;
    for (i in obj) {
      html += '<dt>' + JSON._plates.rewrite.objdt(path, id, i);
      html += '<dd>' +
      /* The subpath is updated. */
      JSON._parseObj(obj[i], path + '[\''+i+'\']', id, template) + '</dd>';
    }
    html += '<dt><span style="border:1px solid black">%</span>' +
      /* Value. */
      '<input placeholder="New key">' +
      /* add button. */
      '<button onclick="' +
       'JSON._plates.rewrite.addObjBut(this,&quot;' + path + '&quot;,\'' + id +
           '\', this.previousSibling.value)' +
       '">+</button></dt>';
    html += '</dl>';
    return html;
  },
  'listdt': function(path, id, index) {
    return '<span style="border:1px solid black">::</span>' +
      /* Remove: 1. Data; 2. Graphics. */
      '<button onclick="delete JSON.getweb[\'' + id + '\']' +
      path + '[' + index + ']; ' +
      'this.parentNode.parentNode.removeChild(this.parentNode)' +
      '">x</button>';
      /* The subpath is updated. */
  },
  'list': function(obj, path, id, template) {
    var html = '';
    html += '<ul>';
    for (var i=0; i<obj.length; i++) {
      html += '<li>' + JSON._plates.rewrite.listdt(path, id, i);
      html += JSON._parseObj(obj[i], path + '['+i+']', id, template) + '</li>';
    }
    html += '<li><button ' +
      /* add button */
      'onclick="JSON._plates.rewrite.addListBut(this,&quot;' +
        path + '&quot;, \'' + id + '\', ' +
        'JSON.getweb[\'' + id + '\']' + path + '.length);"' +
      '>+</button></li>';
    html += '</ul>';
    return html;
  },
  'str': function(obj, path, id) {
    return '<input value="' + obj + '" ' +
      /* Change the string. */
      'oninput="JSON.getweb[\'' + id + '\']' +
      path + ' = this.value;"/>';
  },
  'num': function(obj, path, id) {
    return '<input type="number" value="' + obj + '" ' +
      /* Change a number. */
      'oninput="JSON.getweb[\'' + id + '\']' +
      path + ' = parseInt(this.value,10);"/>';
  },
  'bool': function(obj, path, id) {
    return '<select ' +
      /* Change the value. */
      'onchange="JSON.getweb[\'' + id + '\']' +
      path + ' = this.value==\'true\'?true:false;">' +
      '<option' + (obj?' selected':'') + '>true</option>' +
      '<option' + (!obj?' selected':'') +'>false</option></select>';
  },
  'null':function(obj) {
    return 'null';
  },
  'addButAsk': function(path, id, key, updatedb) {
    return '<div><label>' +
     'Type:<select>' +
      '<option value="0" selected>Object</option>' +
      '<option value="1">List</option>' +
      '<option value="2">String</option>' +
      '<option value="3">Number</option>' +
      '<option value="4">Boolean</option>' +
      '<option value="5">Null </option>' +
     '</select></label>' +
     /* Careful there! JS use in the event attr of an event attr. */
     '<button onclick="(function(that){' +
       'var o;' +
       'switch(that.previousSibling.firstChild.nextSibling.value){' +
       'case \'0\': o = {};   break;' +
       'case \'1\': o = [];   break;' +
       'case \'2\': o = \'\'; break;' +
       'case \'3\': o = 0;    break;' +
       'case \'4\': o = false;break;' +
       'case \'5\': o = null; break;' +
       '};' + updatedb(path,id,key) +
      '})(this);">Add</button></div>';
  },
  'addObjBut': function(button, path, id, key) {
    /* add button */
    var dd = document.createElement('dd');
    dd.innerHTML = JSON._plates.rewrite.addButAsk(path,id,key,
      function(path,id,key) {
        return '' +
         /* Graphical update */
         'var dt = document.createElement(&quot;dt&quot;);' +
         'dt.innerHTML = JSON._plates.rewrite.objdt(&quot;' + path +
           '&quot;, &quot;' + id +'&quot;, &quot;' + key + '&quot;);' +
         'that.parentNode.parentNode.parentNode.insertBefore(dt, ' +
           'that.parentNode.parentNode);' +
         'that.parentNode.parentNode.innerHTML = ' +
           'JSON._parseObj(o,&quot;' + path + '[\'' + key + '\']' + '&quot;,' +
             '\'' + id + '\',\'rewrite\');' +
         /* Data update */
         'JSON.getweb[\'' + id + '\']' + path + '[\'' + key + '\'] = o;';
      });

    /* Add the selector to the dom tree. */
    button.parentNode.parentNode.insertBefore(dd, button.parentNode);

    /* Void the key name input widget. */
    button.previousSibling.value = '';
  },
  'addListBut': function(button, path, id, index) {
    /* add button */
    var li = document.createElement('li');
    li.innerHTML = JSON._plates.rewrite.addButAsk(path, id, undefined,
      function(path, id, key) {
        return '' +
       /* Graphical update */
       'that.parentNode.parentNode.innerHTML = ' +
         'JSON._plates.rewrite.listdt(&quot;' + path + '&quot;,' +
           '&quot;' + id + '&quot;,' + index + ') +' +
         'JSON._parseObj(o,&quot;' + path +
           /* The object being parsed is at index length. */
           '[&quot; + (JSON.getweb[\'' + id + '\']' +
               path + '.length) + &quot;]&quot;' +
           ',\'' + id + '\',\'rewrite\');' +
       /* Data update */
       'JSON.getweb[\'' + id + '\']' + path + '.push(o);';
      });

    /* Add the selector to the dom tree. */
    button.parentNode.parentNode.insertBefore(li, button.parentNode);
  }
};

