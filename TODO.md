# Those are the things we need to get right before getting public.


## /

When the file system is mature enough, its root will be accessed directly by /
instead of /root/.  In order to achieve this, some key elements of the tree will
have to be self-hosted, like the Pencil and the Gateway.  This means we will
have figured out a way to know when to send files directly and when to open them
through file tree plugins.


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
