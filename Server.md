This file is documentation about `server.js`.  Please modify it if you find it
out-of-date or incomplete.

# Rerouted paths

* Paths beginning with /root/ are handled like this:
  - If path is a file, use `web/pencil.html` to display file content.
  - If path is a folder, use `web/gateway.html` to show folder content.

# Ajax actions

* `fs` filesystem primitives
  - `query.path` path to access
  - `query.op` operation ( `ls` or `cat` give content )

* `data` open a file for collaboration
  - `query.path` path of file
  - `query.user` ID timestamp like `+(new Date())`

* `new` commit new changes on a file
  - `query.path` path of file
  - `query.user` ID of author
  - `query.rev` new revision of file
  - `query.delta` changes to file

* `dispatch` subscribe to changes on a file
  - `query.path` path of file
  - `query.user` ID of user

* `kill` close a file
  - `query.path` path of file 
  - `query.user` ID of user

* `chat` subscribe to chat messages

* `talk` send messages on chat
  - `query.nick` nickname
  - `query.message` text

