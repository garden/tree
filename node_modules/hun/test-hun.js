var hun = require ('./hun');
var Test = require ('./test');
var Stream = require ('stream');



// Helper functions.

var t = new Test ();

function test (template, literal, expected, cb) {
  var input = new Stream ();
  var output = new Stream ();
  var text = '';

  output.write = function (data) {
    text += '' + data;
  };
  output.end = function () { output.emit('end'); }
  output.on ('end', function () {
    t.eq (text, expected);
    if (cb) cb ();
  });

  hun (input, output, literal);
  input.emit ('data', template);
  input.emit ('end');
}



// test 1 - 1 level of indentation, escaped {{.

test (
  'There is {{{\\nso much}}} {{=a_man|plain}} can do.\n\n' +
  '{{=us|html}} we have many friends: \n' +
  '{{-friends|friend|i;there is {{=friend|plain}}, }}...',
  {
    'a_man': 'Jan',
    us: 'My friend & I',
    friends: ['Thaddee', 'Serge', 'Marie']
  },
  'There is {{\\nso much}} Jan can do.\n\n' +
  'My friend &amp; I we have many friends: \n' +
  'there is Thaddee, there is Serge, there is Marie, ...');

test (
    'Trying to {{~for|sentence|word|i;{{=word|plain}} }}',
    {
      sentence: ['complete', 'the', 'sentence.']
    },
    'Trying to complete the sentence. ');

test (
  'Escaping {{?pipes|\\| pipes \\|}} ' +
  'and {{?rest|\\; rest \\;...}}',
  {
    pipes: true,
    rest: true
  },
  'Escaping | pipes | and ; rest ;...');

// test 2 - 2 levels of indentation.

test (
  'Your base belongs to {{-us|me|i;\n' +
  '- {{-me|name|j;{{=name|plain}} }}; }}',
  {
    us: [['John', 'Connor'], ['Paul', 'Irish'], ['Ash', 'William']]
  },
  'Your base belongs to \n- John Connor ; \n- Paul Irish ; \n' +
  '- Ash William ; ');

test (
  'Characters:\n{{-protagonists|guy|i; ' +
  '{{=i|plain}}. {{=guy|plain}}\n}}',
  {
    protagonists:['Blondie', 'Angel', 'Tuco']
  },
  'Characters:\n 0. Blondie\n 1. Angel\n 2. Tuco\n');

// compound expressions
test (
  'Thaddee {{?apostles.indexOf(thaddee)!=-1|was|wasn\'t}} an apostle',
  {
    thaddee: 'Thaddaeus',
    apostles:['Simon','Andrew','James','John','Philip','Bartholomew',
              'Matthew','Thomas','James','Simon','Judas','Judas']
  },
  'Thaddee wasn\'t an apostle');

// conditional macro tests.
test (
  'I am{{?present| here. Hello!; out.}} Anyway, how do you do?',
  { present: true },
 'I am here. Hello! Anyway, how do you do?');

test (
  'I am{{?present| here. Hello!; out.}} Anyway, how do you do?',
  { present:false },
  'I am out. Anyway, how do you do?');

// comment macro test.
test (
  'There should be{{# nothing!}}...',
  {},
  'There should be...');

// import macro test.
test (
  'Importing: {{<import.hun}}.',
  { data: 'a template'},
  'Importing: imported a template.\n.');

// macro macro test.
test (
  'First param{{!s; write (params[0]) }}: {{steh; yep...}}!',
  {},
  'First param: teh!');

// macro macro macro test.
test (
  'First param{{!first; write (params[0]) }}: {{~first|teh; yep...}}!',
  {},
  'First param: teh!');

// parser tests.
test ('Plain {{=data|plain}}.', {data:'text'}, 'Plain text.');
test ('Escaping {{=data|plain}}', {data:'{{=data|plain}}'},
      'Escaping {{=data|plain}}');
test ('Html {{=data|html}}.', {data:'<text & stuff>'},
      'Html &lt;text &amp; stuff&gt;.');
test ('Xml {{=data|xml}}.', {data:'<text & stuff>'},
      'Xml &lt;text &amp; stuff&gt;.');
test ('XmlAttr {{=data|xmlattr}}.', {data:'<\'text\' & "stuff">'},
      'XmlAttr &lt;&apos;text&apos; &amp; &quot;stuff&quot;&gt;.');
test ('JsonString "{{=data|jsonstring}}"',
      { data:'file "foo\\bar":\tok\nBody:\r\fdel=\b' },
      'JsonString "file \\"foo\\\\bar\\":\\tok\\nBody:\\r\\fdel=\\b"');
test ('Json "{{=data|json}}"',
      { data:{"foo\\bar": "ok\nBody:\r\fdel=\b"} },
      'Json \"{\"foo\\\\bar\":\"ok\\nBody:\\r\\fdel=\\b\"}\"');
test ('Json "{{=data|json 2}}"',
      { data:{"foo\\bar": "ok\nBody:\r\fdel=\b"} },
      'Json \"{\n  \"foo\\\\bar\": \"ok\\nBody:\\r\\fdel=\\b\"\n}\"');
test ('Uri {{=data|uri}}.', {data:'conversion done'}, 'Uri conversion%20done.');
test ('Non-Uri {{=data|!uri}}.', { data:'conversion%20done' },
      'Non-Uri conversion done.');
test ('Int {{=data|integer}}.', {data:73.6}, 'Int 74.');
test ('Radix {{=data|intradix 2}}.', {data:2}, 'Radix 10.');
test ('Float {{=data|float 2}}.', {data:73.6}, 'Float 73.60.');
test ('Exp {{=data|exp 2}}.', {data:73.6}, 'Exp 7.36e+1.');

test ('http://example.net/{{=data|exp|uri}}', {data:1234},
      'http://example.net/1e%2B3');

// error test.
test ('Nonint {{=data|integer}}.', {data:'hi'}, 'Nonint .');

// tl;dr.
t.tldr ();

// exit.
t.exit();

