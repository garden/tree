# Those are the things we need to get right before getting public.


## /

When the file system is mature enough, its root will be accessed directly by `/`
instead of by `/root/`.  In order to achieve this, some key elements of the tree
will have to be self-hosted, like the Pencil and the Gateway.  This means we
will have figured out a way to know when to send files directly and when to open
them through file tree plugins.

EDIT: This was done as of 2012-04-04.


## Operational Transformation

The current Operational Transformation in use (apart from being buggy) uses up a
lot of space on the server side (we have to store a copy of the file for each
client editing it, which makes a lot of copies!), and the transformation
operation used (patch) is quite expansive CPU-wise.

We intend to use finer Operation Transformations such as those devised in Xerox
PARC [1]. We may add information as we go, since those algorithms have been more
heavily understood and optimized since then. We will document our effort in
relevant documentation files (probably along `/lib/sync.js`).

  [1] http://delivery.acm.org/10.1145/220000/215706/p111-nichols.pdf

EDIT: This was done as of 2012-04-18. Special thanks to
[Tim Baumann] (https://github.com/timjb/javascript-operational-transformation).


## Security

### Old design.

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

### Reasons that design cannot succeed.

That design isn't aware of the Read/Write access differences that we want,
instead encrypting all the data, even if unnecessary. This results in a lot of
encrypting / decrypting that doesn't need to be there.

Beyond taking a lot of CPU cycles, it also takes a lot of effort to engineer,
mainly because all of the system needs to be implemented at once.

Besides, having the key both encrypted in a PBKDF2 and used in encrypting the
data raises differential cryptanalysis concerns.

Finally, the use of PBKDF2 is slower on a CPU than on a GPU, allowing advanced
code breaking techniques to brute-force the key fast: increasing the number of
iterations makes normal use have an increase in execution time that is a lot
smaller for code breaking use.

### New design.

Metadata access and write access requires the following:

- Put OT support in the File System library.
- Provide deniable access to file system primitives.

Read access requires more engineering (and a little bit more design effort).

#### Metadata access

Users can restrict metadata access by using a passphrase. That passphrase is
stored with bcrypt in the file's metadata, under the name `metakey`.

A request for reading the metadata always succeeds. All passphrases are securely
stored anyway.

A request for editing the metadata will follow these steps:

1. Get the key from the user.
2. Get the bcrypt of that key, using the salt and iteration count indicated in
   `metakey`.
3. If the bcrypt we got is the same as the one that is in `metakey`, the user
   gets write access to metadata. Otherwise, he is granted read-only access.

Bcrypt doesn't have support in node.js' standard library. However, here goes a
link to a great library:
[node.bcrypt.js](https://github.com/ncb000gt/node.bcrypt.js).

Why [bcrypt](http://codahale.com/how-to-safely-store-a-password/)?

#### Write access

Users can restrict write access by using a passphrase. That passphrase is stored
with bcrypt in the file's metadata, under the name `writekey`.

A request for read access always succeeds. That property makes encrypting the
data greatly useless.

A request for write access will follow these steps:

1. Get the key from the user.
2. Get the bcrypt of that key, using the salt and iteration count indicated in
   `writekey`.
3. If the bcrypt we got is the same as the one that is in `writekey`, the user
   gets write access. Otherwise, he is granted read-only access.

#### Read access

Users can restrict read access by using a passphrase. The system knows that a
file has a read access restriction if the file's metadata has an `encryption`
key with a valid value (eg. "OCB3-AES128"). In that case, the data is encrypted
using OCB3-AES128.

Requests for read and write access follow these steps:

1. Get the key from the user.
2. Try to decipher the data. If it succeeds, user has read/write access.
3. If it fails, access is completely denied.

If the `writekey` is set, read/write access requires sending both the writekey
passphrase and the OCB-AES key. Sending only the OCB-AES key will result in
read-only access. Otherwise, read/write access is granted to those that send the
OCB-AES key.

