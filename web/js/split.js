// split.js iframe window manager
// 

window.split = (function(){

  var dock = false,
      deco = true,
      mode = 'vertical',
      modes = {},
      frames = [];

  function open(src) {
    var frame = document.createElement('iframe');
    frame.setAttribute('id','frame'+frames.length);
    frame.setAttribute('src',src);
    frame.style.border = '0px';

    document.body.appendChild(frame);
    frames.push(frame);
    setmode(mode);
  };

  function setmode(name) {
    console.log('setting mode',name);
    mode = name;
    if (modes[name] && frames.length > 0) modes[name]();
  };

  // split all frames from start to end on the y axis
  function ysplit(start, end, xattr, yattr, xmax, ymax) {
    if ( start > end ) return;
    var framecount = ( end - start + 1 ),
        yshare = Math.floor ( ymax / framecount );
    frames[start].setAttribute ( xattr, xmax + '%' );
    frames[start].setAttribute ( yattr, ( ymax - yshare * ( framecount - 1 ) ) + '%' );
    for ( var i = start + 1 ; i <= end ; i++ ) {
      frames[i].setAttribute ( xattr, xmax + '%' );
      frames[i].setAttribute ( yattr, yshare + '%' );
    }
  };

  modes.vertical = function() {
    frames[0].style['float'] = 'left';
    ysplit(0, frames.length - 1, 'height', 'width', 100, 100);
  };

  modes.horizontal = function() {
    frames[0].style['float'] = 'left';
    ysplit(0, frames.length - 1, 'width', 'height', 100, 100);
  };

  modes.right = function() {
    frames[0].setAttribute('height', '100%');
    frames[0].setAttribute('width', '50%');
    frames[0].style['float'] = 'left';
    if (frames.length > 1) ysplit(1,frames.length - 1, 'width', 'height', 50, 100);
  };

  modes.left = function() {
    frames[0].setAttribute('height', '100%');
    frames[0].setAttribute('width', '50%');
    frames[0].style['float'] = 'right';
    if (frames.length > 1) ysplit(1,frames.length - 1, 'width', 'height', 50, 100);
  };

  function showdock(visible) {
    dock = visible;
  };

  function showdeco(visible) {
    deco = visible;
  };

  return {
    open: open,
    setmode: setmode,
    showdock: showdock,
    showdeco: showdeco
  }

})();
