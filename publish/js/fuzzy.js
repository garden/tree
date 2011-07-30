
var Enum=function(elements){for(var i=0;i<elements.length;i++){this[elements[i]]=i;}};var types=new Enum(['notfound','dir','text/plain']);var file=function(type,name,getcontent){return{type:types[type]||'text/plain',name:name,getcontent:getcontent};};var files=function(filesdata){var filelist=[];for(var i in files){filelist.push(file(files[i][0],files[i][1],files[i][2]));}
return filelist;};var filesindir=function(directory){return JSON.parse(directory.getcontent);};var fileindir=function(directory,file){for(var file in filesindir(directory)){if(file.name===file){return file;}}
return file('notfound','','');};var plainfile=function(name,content){return file('text/plain',name,content);};var voidfile=function(name){return plainfile(name,'');};var dir=function(name,files){return file('dir',name,JSON.stringify(files));};var path=dir('root',[dir('i',[dir('am',[dir('coming',[voidfile('home')])])]),dir('home-coming',[dir('is',[voidfile('around')])]),dir('halves',[dir('on',[dir('the',[voidfile('garden')])])])]);var fuzzy=function(rootdir,query,depth){var score=function(filename,query){var stars=0;var afternonalpha=false;var alpha=/[a-zA-Z0-9]/;var consecmatch=0;for(var i=0;i<filename.length;i++){if(filename[i]===query[0]){stars++;stars+=depth;if(i===0){stars+=2;}else if(i===1){stars++;}
var isalpha=alpha.test(filename[i]);if(isalpha&&afternonalpha){stars+=2;}
afternonalpha=!isalpha;stars+=consecmatch;consecmatch++;query=query.slice(1);if(query.length===0){break;}}else if(query[0]==='/'){query=query.slice(1);break;}else{consecmatch=0;}}
if(query[0]==='/'){query=query.slice(1);}
return[stars,query];};var files=filesindir(rootdir);var scoredpath=[];for(var i=0;i<files.length;i++){var filescore=score(files[i].name,query);if(filescore[1].length===0||(depth===0||files[i].type!==types['dir'])){scoredpath.push([files[i].name,filescore[0],filescore[1]]);}else{var inside=fuzzy(files[i],filescore[1],depth-1);for(var j=0;j<inside.length;j++){scoredpath.push([files[i].name+'/'+inside[j][0],filescore[0]+inside[j][1],inside[j][2]]);}}}
var sorter=function(file1,file2){return file2[1]-file1[1];};scoredpath.sort(sorter);return scoredpath;};query=''
process.stdin.resume()
console.log(JSON.stringify(fuzzy(path,query,5)));process.stdout.write('> ')
process.stdin.on('data',function(chunk){query+=chunk
if(query[query.length-1]=='\n'){query=query.slice(0,query.length-1);console.log(JSON.stringify(fuzzy(path,query,5)));query=''
process.stdout.write('> ')}})