// split screen
function split(url, vertical) {
  var head = document.head,
      body = document.body,
      frame1 = document.createElement('iframe'),
      frame2 = document.createElement('iframe'),
      height = (vertical ? '50%' : '100%' ),
      width = (vertical ? '100%' : '50%' );

  document.head = document.createElement('head');
  document.body = document.createElement('body');

  document.body.style.margin = '0px';
  document.body.style.position = 'fixed';
  document.body.style.height = '100%';
  document.body.style.width = '100%';

  document.body.appendChild(frame1);
  frame1.contentDocument.head.appendChild(head);
  frame1.contentDocument.body.appendChild(body);

  document.body.appendChild(frame2);
  frame2.src = url;

  frame1.style.height = frame2.style.height = height;
  frame1.style.width = frame2.style.width = width;
  frame1.style.border = frame2.style.border = '0px';
}
