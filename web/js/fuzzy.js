// Directory primitives.

/// `types` is a map of types (ie, a symbol namespace).
var Enum = function (elements) {
  for (var i=0; i<elements.length; i++) {
    this[elements[i]] = i;
  }
};
var types = new Enum (
['notfound'
,'dir'                // contains a JSON string of files.
,'text/plain'
]);

/// `type` is a string taken from the `types` enumeration.
/// `getcontent` is a function returning string information.
var file = function (type, name, getcontent) {
  return {type:types[type] || types['text/plain'], name:name, getcontent:getcontent};
};

/// `files` returns a list of `file`s.
/// `filesdata` is a list of
/// [String type, String name, String content] arrays.
var files = function (filesdata) {
  var filelist = [];
  for (var i in files) {
    filelist.push (file (files[i][0], files[i][1], files[i][2]));
  }
  return filelist;
};

/// Getting all the files of a directory. See `files`.
var filesindir = function (directory) {
  return JSON.parse (directory.getcontent);
};
/// Getting one file from the directory.
var fileindir = function (directory, file) {
  for (var file in filesindir (directory)) {
    if (file.name === file) {
      return file;
    }
  }
  return file ('notfound', '', '');
};

/// These functions are only useful for quick creation of plain files.
var plainfile = function (name, content) {
  return file ('text/plain', name, content);
};
var voidfile = function (name) {
  return plainfile (name, '');
};

/// This function is only useful for quick creation of directories.
/// `name` is a string.
/// `files` is a list of files, as returned by `files`.
/// See `file` and `files` for more information on files.
var dir = function (name, files) {
  return file ('dir', name, JSON.stringify (files));
};


var path = dir ('root',
[dir ('i',
  [dir ('am',
    [dir ('coming',
      [voidfile ('home')
      ])
    ])
  ])
,dir ('home-coming',
  [dir ('is',
    [voidfile ('around')
    ])
  ])
,dir ('halves',
  [dir ('on',
    [dir ('the',
      [voidfile ('garden')
      ])
    ])
  ])
]);


//console.log (JSON.stringify (path.getcontent ()));

// Fuzzy matching.

var fuzzy = function (rootdir, query, depth) {

  // Given a string filename and a list of characters chars, 
  // returns a list containing a qualitative number of stars, and a
  // variable that is true if the query has been fully parsed.
  var score = function (filename, query) {
    var stars = 0;
    var afternonalpha = false;
    var alpha = /[a-zA-Z0-9]/;
    var consecmatch = 0;

    for (var i=0; i<filename.length; i++) {
      if (filename[i] === query[0]) {
        stars++;            // match!
        stars += depth;     // Counts more if closer to cwd.
        if (i === 0) {
          stars += 2;       // Counts more if start of filename.
        } else if (i === 1) {
          stars++;
        }
        var isalpha = alpha.test (filename[i]);
        if (isalpha && afternonalpha) {
          stars += 2; // Counts more if after nonalpha.
        }
        afternonalpha = !isalpha;
        stars += consecmatch;  // Numerous consecutive matches.
        consecmatch++;

        // Treat the query.
        query = query.slice(1);
        if (query.length === 0) { break; }
      } else if (query[0] === '/') {
        query = query.slice(1);
        break;
      } else {
        consecmatch = 0;
      }
    }

    // Never leave a / at the beginning.
    if (query[0] === '/') { query = query.slice (1); }
    return [stars, query];
  };

  var files = filesindir (rootdir);

  // scoredpath is a list of [string path, int score, string consumed]
  // which determines how well the path is ranked and if it
  // contains all characters in the query.
  var scoredpath = [];
  for (var i=0; i<files.length; i++) {
    var filescore = score (files[i].name, query);
    if (filescore[1].length === 0 || (depth === 0 || files[i].type !== types['dir'])) {
      scoredpath.push ([files[i].name, filescore[0], filescore[1]]);
    } else {
      // More to be seen in depth...
      var inside = fuzzy (files[i], filescore[1], depth - 1);
      for (var j=0; j<inside.length; j++) {
        scoredpath.push ([files[i].name + '/' + inside[j][0], filescore[0] + inside[j][1], inside[j][2]]);
      }
    }
  }

  var sorter = function (file1, file2) {
    return file2[1] - file1[1];
  };
  scoredpath.sort (sorter);
  return scoredpath;
};


// testing.

query = ''

process.stdin.resume()
console.log(JSON.stringify(fuzzy(path, query, 5)));
process.stdout.write('> ')
process.stdin.on('data', function(chunk) {
  query += chunk
  if(query[query.length-1] == '\n') {
    query = query.slice (0, query.length - 1);
    console.log(JSON.stringify(fuzzy(path, query, 5)));
    query = ''
    process.stdout.write('> ')
  }
})
