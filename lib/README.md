THE FILE TREE LIBRARY
=====================


These are the gears of the File Tree.

fs.js
-----

This is our filesystem. Files and folders are loaded from `../root/`.

A word of warning: the apis are in furious development right now. This notice
will be removed when that is no longer so.

### API:

- `type :: Object`
  See the type API.

- `file :: Function (path :: String, callback :: Function (err :: Error, file
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
* `this.isOfType :: Function (mimeType :: String)` checks whether the file is
  of a certain type, or falls back to it (ie, derives from it).
* `this.path :: String` is the path of the file from the root.
* `this.count :: Number` is the number of users that currently read this file.
* `this.driver :: {String: {}}` is a map from common file actions to their
  low-level implementation. See below, at "driver.js".

#### Content

* `this.content :: Object` lets you obtain the contents of the file.
  The content may be `null` (in order not to waste precious memory) unless you
  have opened the file.
* `this.open :: Function ( cb :: Function (err) )`: use it when a user starts
  editing a file.
* `this.close :: Function ()`: use it when a user stops editing a file.
  This function is useful to decide when to write to disk (non-blocking).
* `this.write :: Function (cb)`: if you want to write the file to disk.
* `this.writeMeta :: Function (cb)`: if you want to write metadata to disk.
* `this.subfiles :: Function (cb :: Function(err, subfiles))`: gives all the
  leafs of a folder recursively, as an Array, including folders.
* `this.files :: Function (cb :: Function(err, files))`: gives all the
  children of a folder as an Array of files (whilst its content gives an Array
  of Strings).

#### Extensibility

* `this.rm :: Function(name, cb(err))` lets you remove the file from the tree.
* `this.mkdir :: Function(name, cb(err))` lets you add a directory as a child of
  the current file, which must itself be a directory.
* `this.mkfile :: Function(name, cb(err))` lets you add a file as a child of the
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
- `normalize :: Function(path :: String)` takes a virtual path and returns the
  same path, sanitized. For instance, "../foo.html/../bar.html" becomes
  "/bar.html".
- `absolute :: Function(path :: String)` takes a virtual path and returns the
  real path on the host file system.
- `relative :: Function(path :: String)` takes a virtual path and returns the
  path from the current directory to that file.
- `virtual :: Function(path :: String)` takes a real path and returns the
  corresponding virtual path.
- `loadMeta :: Function(path :: String, cb :: Function)` takes a virtual path
  and returns an error and the metadata (as an Object) in the callback.
- `dumpMeta :: Function(path :: String, metadata :: Object, cb :: Function)`
  takes a virtual path and metadata, writes that metadata to disk, and returns
  an error in the callback.

