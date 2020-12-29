# Tree Services

Service scripts for managing a secure [file tree] (https://github.com/garden/tree) instance.

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
# Clone the project.
sudo apt update
sudo apt install git make
git clone https://github.com/garden/tree.git
cd tree
mkdir -p admin/private
```

Back on your local directory:

```bash
scp admin/private/prod.json tree:/home/dom/tree/admin/private/env.json
# If you need to restore data:
scp backup/web*.tar.xz tree:/home/dom/tree/backup/
```

Back in the remote production server in /home/dom/tree:

```
make install
```

## Files

- `rebuild`: reconstruct metadata from files seen on disk. Run without parameters for help.
- `log/`: log files.
- `.well-known/`: files served by the HTTP server under the `/.well-known/` path. Used for Let’s Encrypt.
- `setup/`: installation and systemctl scripts.
  - `tree`: HTTPS server of TheFileTree.
  - `redirect`: HTTP server redirecting to HTTPS.
  - `update`: HTTP server listening for GitHub push events on port 1123 to update your `tree` repo. Deprecated.
- `private/`: folder with the server’s parameters. It typically contains env.json. Also, https certificate files will be in `private/https/`, and the private database root CA keys are in `private/dbcerts`.
- `db/`: database content and certificates, but not the private root CA key.

A typical env.json looks like this:

```json
{
  // Enforce production restrictions.
  "env": "production",
  "http": {
    "host": "thefiletree.com",
    "port": 443,
    "secure": true,
    "key": "/etc/letsencrypt/live/thefiletree.com/privkey.pem",
    "cert": "/etc/letsencrypt/live/thefiletree.com/cert.pem",
    "ca": ["/etc/letsencrypt/live/thefiletree.com/fullchain.pem"],
    "cors": {
      "origin": "https://thefiletree.com"
    }
  },
  "mailer": {
    "secure": true,
    "requireTLS": true,
    "host": "in.mailjet.com",
    "port": 2525,
    "from": "hi@thefiletree.com",
    "auth": {
      // Fake; insert the real ones.
      "user": "d5e5b767ecc46c6f83e0d4a969bccbd3",
      "pass": "44de026d1b312dcfa905225ff3c37d4c"
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

When starting out on a new server, you will first need to use a self-signed TLS
certificate to perform the Let's Encrypt DNS validation and. For that purpose,
you need to change the certificate paths to the ones we generate for you:

```json
{
  "key": "admin/private/https/privkey.pem",
  "cert": "admin/private/https/cert.pem",
  "ca": ["admin/private/https/fullchain.pem"]
}
```
