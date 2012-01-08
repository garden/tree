# Those are the things we need to get right before getting public.


## /

When the file system is mature enough, its root will be accessed directly by `/`
instead of by `/root/`.  In order to achieve this, some key elements of the tree
will have to be self-hosted, like the Pencil and the Gateway.  This means we
will have figured out a way to know when to send files directly and when to open
them through file tree plugins.


## OT

The current Operation Transformation in use (apart from being buggy) uses up a
lot of space on the server side (we have to store a copy of the file for each
client editing it, which makes a lot of copies!), and the transformation
operation used (patch) is quite expansive CPU-wise.

We intend to use finer Operation Transformations such as those devised in Xerox
PARC [1]. We may add information as we go, since those algorithms have been more
heavily understood and optimized since then. We will document our effort in
relevant documentation files (probably along `/lib/sync.js`).

  [1] http://delivery.acm.org/10.1145/220000/215706/p111-nichols.pdf


## TLS

We get a salt from the server.  We send a PBKDF2ed SHA256 key from the
passphase the user enters.  On receiving the SHA, the server makes it go
through another PBKDF2, and compares it to its own sha.  If they match, 
it decodes the AES256-ciphered data with the SHA it got (not the one it
computed).  The resulting file is sent in clear to the client.

The reason why the client only sends the SHA256 is to prove that we do not
store keys in the clear.  It is a PR force with no real value, since we
already are under https.

We absolutely need TLS (otherwise the whole security system crumbles down).
We can get it free from StartCom, whose root certificate is in Firefox (and
probably everywhere else, too).

