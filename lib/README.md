THE FILE TREE LIBRARY
=====================


These are the gears of the File Tree.

[diff\_match\_patch.js] (http://code.google.com/p/google-diff-match-patch)
------------------------------------------------------------------------

We use this when handling diff and delta changes.
Please see the website for up-to-date API information.

Note: the API defined on the website is clearly not exhaustively described. We
used non-public APIs that optimally compress the delta information in order to
send it to the server.  
We discovered those secret functions by browsing through the code. When in
doubt, may the source be with you.

fs.js
-----

This is our filesystem. Files and folders are loaded from `../root/`.

A word of warning: the apis are in furious development right now. This notice
will be removed when that is no longer so.    

### API:

- `typenamefromtype :: Array`  
  List of all file types as a string (eg, "text/plain").
  Usually, type information comes from the indices used in this array.
  As a result, using this list will let you know the file type corresponding to
  a certain type (given as a number).

- `isoftype :: function (file :: File, typename :: String)`  
  Checks whether a file is of a certain type, or falls back into it (ie, derives
  from it).

- `File :: function (typename :: String, name :: String, getcontent :: function
  (whengot :: function (err :: Error, content :: Buffer)))`  
  Constructor of the File object. Do not use. Use `getfile` instead.
  File objects contain the following functions:

  * `this.type :: Number` is the file type.
  * `this.name :: String` is the name of the file in the directory.
  * `this.usercount :: Number` is the number of users that currently read this
    file.
  * `this.content :: function (dowithcontent :: function (err :: Error, content
    :: Buffer))` lets you obtain the contents of the file.

- `fsfiles :: Object`  
  The keys are the "fake" paths of all files we have in memory. The values are
  those files (of type File).

- `sanitizepath :: function (path :: String)`  
  Given a path on the hard drive, this function returns the corresponding "fake"
  path in the File Tree hierarchy.

- `getfile :: function (path :: String, callback :: function (err :: Error, file
  :: File))`  
  Obtain a file, given the "fake" File Tree `path`.

- `getroot :: function (gotroot :: function (err :: Error, root :: File))`  
  Obtain the root directory, as a File.

