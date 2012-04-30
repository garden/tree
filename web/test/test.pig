-- Apache Pig (Pig Latin Language) Demo
/* 
This is a multiline comment.
*/
a = LOAD "\path\to\input" USING PigStorage('\t') AS (x:long, y:chararray, z:bytearray);
b = GROUP a BY (x,y,3+4);
c = FOREACH b GENERATE flatten(group) as (x,y), SUM(group.$2) as z;
STORE c INTO "\path\to\output";

--

