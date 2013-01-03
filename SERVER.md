This is documentation for the `app.js` server script.  Please edit if you find
it out-of-date or incomplete.

# Routing requests

* Requested resources are templated into plugs if metadata or type require it:
  - If resource is a zip file, serve directly (do not template / route).
  - If resource is a text file, embed its content into a text editor.
  - If resource is a folder, embed a list of its files into a file explorer.
  - If resource metadata require a specific plug, use that plug as template.

# Ajax actions

* `profiler` serves profiling information about the server.

* `fs` filesystem primitives:
  - `create` a new entry (file or folder)
  - `read` an entry (file or folder)
  - `apply` an operation (insert or delete content)
  - `delete` an entry

* `meta-save` mutate metadata of a file system entry

* `upload` import bulk files as new entries

* `join` an IRC channel

* `say` something on an IRC channel
