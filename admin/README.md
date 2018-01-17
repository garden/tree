# Tree Services

Service scripts for managing a secure [file tree] (https://github.com/garden/tree) instance.

The default environment is dev; in production, do the following: `export ENV=prod`.

- `make install`: provision a new computer.
- `make start`: launch the HTTP server (and associated services, if needed, like the database).
- `make stop`: stop the HTTP server.

In production, when freshly into a new server, you need to do the following:

```bash
# Change the root password to something very secure.
passwd
# Create the dom user.
useradd --create-home --user-group --key UMASK=022 dom
passwd dom
usermod -aG sudo dom
cd /home/dom
echo export ENV=prod >>.bashrc
source .bashrc
# Clone the project.
sudo apt update
sudo apt install git
git clone https://github.com/garden/tree.git
cd tree
make install
```

## Files

- `rebuild`: reconstruct metadata from files seen on disk. Run without parameters for help.
- `log/`: log files.
- `well-known/`: files served by the HTTP server under the `/.well-known/` path. Used for Let’s Encrypt.
- `setup/`: installation and systemctl scripts.
  - `tree`: HTTPS server of TheFileTree.
  - `redirect`: HTTP server redirecting to HTTPS.
  - `update`: HTTP server listening for GitHub push events on port 1123 to update your `tree` repo. Deprecated.
- `private/`: folder with the server’s parameters. It typically contains dev.json for local work and prod.json for production. Also, https certificate files will be in `private/https/`, and the private database root CA keys are in `private/dbcerts`.
- `db/`: database content and certificates, but not the private root CA key.

A typical prod.json looks like this:

```json
{
  "port": 443,
  "tls": true,
  "mailer": {
    "secure": true,
    "host": "mail.provider.net",
    "from": "hi@example.com",
    "auth": {
      "user": "hi@example.com",
      "pass": "2gjc5N7FJV4dFd3kV5qLIZs"
    }
  },
  "pg": {
    "user": "root",
    "host": "localhost",
    "port": "26257",
    "database": "tree",
    "ssl": {
      "rejectUnauthorized": true,
      "ca": "./admin/db/certs/ca.crt",
      "key": "./admin/db/certs/client.root.key",
      "cert": "./admin/db/certs/client.root.crt"
    },
    "cache": "20%",
    "maxSqlMemory": "20%"
  }
}
```
