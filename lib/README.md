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

- `file :: function (path :: String, callback :: function (err :: Error, file
  :: File))`
  Obtain a file, given the "fake" File Tree `path`.

- `fileFromPath :: Object`
  The keys are the "fake" paths of all files we have in memory. The values are
  those files (of type File).
  Ideally, don't use this. I would rather you used file().

### Files:

File objects contain the following functions:

#### Meta

* `this.meta :: Object` contains all meta information, such as the type
  (`this.meta.type`).
* `this.isOfType :: function (mimeType :: String)` checks whether the file is
  of a certain type, or falls back to it (ie, derives from it).
* `this.path :: String` is the path of the file from the root.
* `this.count :: Number` is the number of users that currently read this file.
* `this.driver :: {String: {}}` is a map from common file actions to their
  low-level implementation. See below, at "driver.js".

#### Content

* `this.content :: Object` lets you obtain the contents of the file.
  The content may be `null` (in order not to waste precious memory) unless you
  have opened the file.
* `this.open :: function ( cb :: function (err) )`: use it when a user starts
  editing a file.
* `this.close :: function ()`: use it when a user stops editing a file.
  This function is useful to decide when to write to disk (non-blocking).
* `this.write :: function (cb)`: if you want to write the file to disk.
* `this.writeMeta :: function (cb)`: if you want to write metadata to disk.
* `this.subfiles :: function (cb :: function(err, subfiles))`: gives all the
  leafs of a folder recursively, as an Array, including folders.
* `this.files :: function (cb :: function(err, files))`: gives all the
  children of a folder as an Array of files (whilst its content gives an Array
  of Strings).

#### Extensibility

* `this.rm :: function` lets you remove the file from the tree.
* `this.mkdir :: function(name, cb(err))` lets you add a directory as a child of
  the current file, which must itself be a directory.
* `this.mkfile :: function(name, cb(err))` lets you add a file as a child of the
  current file, which must be a directory.


type.js
-------

This rules the file type system.

- `addType(mimeType :: String, parents :: Array)` adds a new mime type to the
  type system, with fallbacks as a list of types (integers).
- `fromName :: Object` gives the type (a number) from the mime type (String).
- `nameFromType :: Array` gives the mime type from the number type.
- `isCompatible(type :: Number, ancestor :: Number)` is true if `type` is
  compatible with `ancestor`.
- `guessType(path :: String, cb :: Function)` The callback has two parameters,
  an error, and a plausible number type.
- `driver(type :: Number)` yields the driver corresponding to the indicated
  type. Drivers are specified in the `driver.js` file.


driver.js
---------

The need to hide low-level implementation of the different types of file makes
the driver system necessary. It contains all primitive functions that do basic
things with each type of file.

- `primitives :: {String: {}}` is a map from internal types to a list of
  functions like `read`, `write`, `rm`, `mkdir`, `mkfile`, that the file system
  can use. Each file has a `driver` element that points to the primitives
  corresponding to its type.
- `normalize :: function(path :: String)` takes a virtual path and returns the
  same path, sanitized. For instance, "../foo.html/../bar.html" becomes
  "/bar.html".
- `absolute :: function(path :: String)` takes a virtual path and returns the
  real path on the host file system.
- `relative :: function(path :: String)` takes a virtual path and returns the
  path from the current directory to that file.
- `virtual :: function(path :: String)` takes a real path and returns the
  corresponding virtual path.
- `loadMeta :: function(path :: String, cb :: Function)` takes a virtual path
  and returns an error and the metadata (as an Object) in the callback.
- `dumpMeta :: function(path :: String, metadata :: Object, cb :: Function)`
  takes a virtual path and metadata, writes that metadata to disk, and returns
  an error in the callback.

