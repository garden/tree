/* scout.js: Scout is an ajax object.
 * Copyright © 2010 Thaddee Tyl. All rights reserved.
 * Produced under the MIT license.
 *
 * Requires Sizzle.js <http://sizzlejs.com/>
 * Copyright 2010, The Dojo Foundation
 * Released under the MIT, BSD, and GPL licenses.
 *
 * Requires Json2.js by Douglas Crockford. <http://www.json.org/>
 *
 * Requires EventSource.js by Remy Sharp <http://github.com/remy/polyfills/>
 * under the MIT license <http://rem.mit-license.org>.
 */

var Scout = function(){};
Scout = (function Scoutmaker () {

  /* xhr is in a closure. */
  var xhr;
  if (window.XMLHttpRequest) {
    xhr = new XMLHttpRequest();
    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/xml'); /* Old Mozilla browsers. */
    }
  } else {  /* Betting on IE, I know no other implementation. */
    try {
      xhr = new ActiveXObject("Msxml2.XMLHTTP");
    } catch (e) {
      xhr = new ActiveXObject("Microsoft.XMLHTTP");
    }
  }


  /* "On" property (beginning with the default parameters). */

  var params = {
    method: 'POST',
    resp:    function (resp, xhr) {},
    error:   function (status, xhr) {},
    partial: function (raw, resp, xhr) {}
  };

  /* Convert object literal to xhr-sendable. */
  var toxhrsend = function (data) {
    var str = '', start = true;
    var jsondata = '';
    for (var key in data) {
      if (typeof (jsondata = JSON.stringify(data[key])) === 'string') {
        str += (start? '': '&');
        str += encodeURIComponent(key) + '=' + encodeURIComponent(jsondata);
        if (start) { start = false; }
      }
    }
    return str;
  };

  var sendxhr = function (target, params) {
    if (params.action)  { params.url = '/$' + params.action; }
    /* XHR stuff now. */
    if (params.url) {
      /* We have somewhere to go to. */
      xhr.onreadystatechange = function () {
        switch (xhr.readyState) {
          case 3:
            if (params.partial === undefined) {
              var raw = xhr.responseText;
              var resp;
              try {
                resp = JSON.parse(raw);
              } catch (e) {}
              params.partial.apply(target, [raw, resp, xhr]);
            }
            break;
          case 4:
            if (xhr.status === 200) {
              var resp = JSON.parse(xhr.responseText);
              params.resp.apply(target, [resp, xhr]);
            } else {
              params.error.apply(target, [xhr.status, xhr]);
            }
            break;
        }
      };

      // foolproof: POST requests with nothing to send are
      // converted to GET requests.
      if (params.method === 'POST'
         && (params.data === {} || params.data === undefined)) {
        params.method = 'GET';
      }
      xhr.open(params.method,
               params.url + (params.method === 'POST'? '':
                             '?' + toxhrsend(params.data)),
               true,
               params.user,
               params.password);

      if (params.method === 'POST' && params.data !== {}) {
        xhr.setRequestHeader('Content-Type',
                             'application/x-www-form-urlencoded');
        xhr.send(toxhrsend(params.data));
      } else {
        xhr.send(null);
      }
    }
  };

  var onprop = function (eventName, before) {
    /* Defaults. */
    before = before || function (params, e, xhr) {};

    /* Event Listener callback. */
    var listenerfunc = function (e) {
      /* IE wrapper. */
      if (!e && window.event) { e = event; }
      var target = e.target || e.srcElement || undefined;

      /* We must not change page unless otherwise stated. */
      if (eventName === 'submit') {
        if (e.preventDefault) { e.preventDefault(); }
        else { e.returnValue = false; }
      }
      /*window.event.cancelBubble = true;
      if (e.stopPropagation) e.stopPropagation();*/

      /* User action before xhr send. */
      before.apply(target, [params, e, xhr]);

      sendxhr(target, params);
    };

    if (document.addEventListener) {
      this.addEventListener(eventName, listenerfunc, false);
    } else {  /* Hoping only IE lacks addEventListener. */
      this.attachEvent('on' + eventName, listenerfunc);
    }
  };

  /* End of "on" property. */


  var ret = function (id) {
    /* Get the corresponding html element. */
    var domelt = document.querySelector(id);
    if (!domelt) {
      return { on: function () {} };
    }

    /* Now that we have the elt and onprop, assign it. */
    domelt.on = onprop;
    return domelt;
  };
  ret.send = function (before) {
    /* Fool-safe XHR creation if the current XHR object is in use. */
    if (xhr.readyState === 1) { return Scoutmaker().send(before); }

    before = before || function (params, xhr) {};

    return function () {
      before.apply(undefined, [params, xhr]);
      sendxhr(undefined, params);
    };
  };
  ret.maker = Scoutmaker;

  /* Wrapper for EventSource. */
  ret.eventSource = function (channel) {
    var es = new EventSource('/$' + channel);
    es.onrecv = function (cb) {
      es.onmessage = function (event) {
        cb(JSON.parse(event.data));
      };
    };
    return es;
  };

  /* Wrapper for socket.io – if downloaded. */
  if (window.io) {
    ret.socket = function (namespace) {
      if (namespace === undefined) {
        namespace = '/';    // Default namespace.
      }
      return io.connect(namespace, {
        resource: '$socket.io'
      });
    };
  }


  return ret;
})();
