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

- `type :: Object`  
  See the type API.

- `File :: function (typename :: String, name :: String, getcontent :: function
  (whengot :: function (err :: Error, content :: Buffer)))`  
  Constructor of the File object. Do not use. Use `getfile` instead.
  File objects contain the following functions:

  * `this.type :: Number` is the file type.
  * `this.isOfType :: function (mimeType :: String)` checks whether the file is
    of a certain type, or falls back to it (ie, derives from it).
  * `this.name :: String` is the name of the file in the directory.
  * `this.usercount :: Number` is the number of users that currently read this
    file.
  * `this.content :: function (dowithcontent :: function (err :: Error, content
    :: Buffer))` lets you obtain the contents of the file.
  * `this.open :: function ()`: use it when a user starts editing a file.
  * `this.close :: function ()`: use it when a user stops editing a file.
    This function is useful to decide when to write to disk.
  * `this.subfiles :: function ()`: gives all the leafs of a folder recursively,
    as an Array, including folders.

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


type.js
-------

This rules the file type system.

### API

- `addType(mimeType :: String, parents :: Array)` adds a new mime type to the
  type system, with fallbacks as a list of types (integers).
- `fromName(mimeType :: String)` gives the type (a number) from the mime type.
- `nameFromType(type :: Number)` gives the mime type from the number type.
- `isCompatible(type :: Number, ancestor :: Number)` is true if `type` is
  compatible with `ancestor`.


