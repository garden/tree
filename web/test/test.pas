(* Example Pascal code *)

while a <> b do writeln('Waiting');
 
if a > b then 
  writeln('Condition met')
else 
  writeln('Condition not met');
 
for i := 1 to 10 do 
  writeln('Iteration: ', i:1);
 
repeat
  a := a + 1
until a = 10;
 
case i of
  0: write('zero');
  1: write('one');
  2: write('two')
end;

