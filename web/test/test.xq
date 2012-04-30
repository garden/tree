 
xquery version "1.0-ml";
(: this is
 : a 
   "comment" :)
let $let := <x attr="value">"test"<func>function() $var {function()} {$var}</func></x>
let $joe:=1
return element element {
    attribute attribute { 1 },
    element test { 'a' }, 
    attribute foo { "bar" },
    fn:doc()[ foo/@bar eq $let ],
    //x }    
 
(: a more 'evil' test :)
(: Modified Blakeley example (: with nested comment :) ... :)
declare private function local:declare() {()};
declare private function local:private() {()};
declare private function local:function() {()};
declare private function local:local() {()};
let $let := <let>let $let := "let"</let>
return element element {
    attribute attribute { try { xdmp:version() } catch($e) { xdmp:log($e) } },
    attribute fn:doc { "bar" castable as xs:string },
    element text { text { "text" } },
    fn:doc()[ child::eq/(@bar | attribute::attribute) eq $let ],
    //fn:doc
}



xquery version "1.0-ml";

(: Copyright 2006-2010 Mark Logic Corporation. :)

(:
 : Licensed under the Apache License, Version 2.0 (the "License");
 : you may not use this file except in compliance with the License.
 : You may obtain a copy of the License at
 :
 :     http://www.apache.org/licenses/LICENSE-2.0
 :
 : Unless required by applicable law or agreed to in writing, software
 : distributed under the License is distributed on an "AS IS" BASIS,
 : WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 : See the License for the specific language governing permissions and
 : limitations under the License.
 :)

module namespace json = "http://marklogic.com/json";
declare default function namespace "http://www.w3.org/2005/xpath-functions";

(: Need to backslash escape any double quotes, backslashes, and newlines :)
declare function json:escape($s as xs:string) as xs:string {
  let $s := replace($s, "\\", "\\\\")
  let $s := replace($s, """", "\\""")
  let $s := replace($s, codepoints-to-string((13, 10)), "\\n")
  let $s := replace($s, codepoints-to-string(13), "\\n")
  let $s := replace($s, codepoints-to-string(10), "\\n")
  return $s
};

declare function json:atomize($x as element()) as xs:string {
  if (count($x/node()) = 0) then 'null'
  else if ($x/@type = "number") then
    let $castable := $x castable as xs:float or
                     $x castable as xs:double or
                     $x castable as xs:decimal
    return
    if ($castable) then xs:string($x)
    else error(concat("Not a number: ", xdmp:describe($x)))
  else if ($x/@type = "boolean") then
    let $castable := $x castable as xs:boolean
    return
    if ($castable) then xs:string(xs:boolean($x))
    else error(concat("Not a boolean: ", xdmp:describe($x)))
  else concat('"', json:escape($x), '"')
};

(: Print the thing that comes after the colon :)
declare function json:print-value($x as element()) as xs:string {
  if (count($x/*) = 0) then
    json:atomize($x)
  else if ($x/@quote = "true") then
    concat('"', json:escape(xdmp:quote($x/node())), '"')
  else
    string-join(('{',
      string-join(for $i in $x/* return json:print-name-value($i), ","),
    '}'), "")
};

(: Print the name and value both :)
declare function json:print-name-value($x as element()) as xs:string? {
  let $name := name($x)
  let $first-in-array :=
    count($x/preceding-sibling::*[name(.) = $name]) = 0 and
    (count($x/following-sibling::*[name(.) = $name]) > 0 or $x/@array = "true")
  let $later-in-array := count($x/preceding-sibling::*[name(.) = $name]) > 0
  return

  if ($later-in-array) then
    ()  (: I was handled previously :)
  else if ($first-in-array) then
    string-join(('"', json:escape($name), '":[',
      string-join((for $i in ($x, $x/following-sibling::*[name(.) = $name]) return json:print-value($i)), ","),
    ']'), "")
   else
     string-join(('"', json:escape($name), '":', json:print-value($x)), "")
};

(:~
  Transforms an XML element into a JSON string representation.  See http://json.org.
  <p/>
  Sample usage:
  <pre>
    xquery version "1.0-ml";
    import module namespace json="http://marklogic.com/json" at "json.xqy";
    json:serialize(&lt;foo&gt;&lt;bar&gt;kid&lt;/bar&gt;&lt;/foo&gt;)
  </pre>
  Sample transformations:
  <pre>
  &lt;e/&gt; becomes {"e":null}
  &lt;e&gt;text&lt;/e&gt; becomes {"e":"text"}
  &lt;e&gt;quote " escaping&lt;/e&gt; becomes {"e":"quote \" escaping"}
  &lt;e&gt;backslash \ escaping&lt;/e&gt; becomes {"e":"backslash \\ escaping"}
  &lt;e&gt;&lt;a&gt;text1&lt;/a&gt;&lt;b&gt;text2&lt;/b&gt;&lt;/e&gt; becomes {"e":{"a":"text1","b":"text2"}}
  &lt;e&gt;&lt;a&gt;text1&lt;/a&gt;&lt;a&gt;text2&lt;/a&gt;&lt;/e&gt; becomes {"e":{"a":["text1","text2"]}}
  &lt;e&gt;&lt;a array="true"&gt;text1&lt;/a&gt;&lt;/e&gt; becomes {"e":{"a":["text1"]}}
  &lt;e&gt;&lt;a type="boolean"&gt;false&lt;/a&gt;&lt;/e&gt; becomes {"e":{"a":false}}
  &lt;e&gt;&lt;a type="number"&gt;123.5&lt;/a&gt;&lt;/e&gt; becomes {"e":{"a":123.5}}
  &lt;e quote="true"&gt;&lt;div attrib="value"/&gt;&lt;/e&gt; becomes {"e":"&lt;div attrib=\"value\"/&gt;"}
  </pre>
  <p/>
  Namespace URIs are ignored.  Namespace prefixes are included in the JSON name.
  <p/>
  Attributes are ignored, except for the special attribute @array="true" that
  indicates the JSON serialization should write the node, even if single, as an
  array, and the attribute @type that can be set to "boolean" or "number" to
  dictate the value should be written as that type (unquoted).  There's also
  an @quote attribute that when set to true writes the inner content as text
  rather than as structured JSON, useful for sending some XHTML over the
  wire.
  <p/>
  Text nodes within mixed content are ignored.

  @param $x Element node to convert
  @return String holding JSON serialized representation of $x

  @author Jason Hunter
  @version 1.0.1
  
  Ported to xquery 1.0-ml; double escaped backslashes in json:escape
:)
declare function json:serialize($x as element())  as xs:string {
  string-join(('{', json:print-name-value($x), '}'), "")
};
  
