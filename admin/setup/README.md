# Tree Services

Service scripts for managing a secure [file tree] (https://github.com/garden/tree) instance.

## Description

- `redirect` This service redirects HTTP requests to HTTPS.
- `tree` This service runs a secure [file tree] (https://github.com/garden/tree) server.
- `warden` This service watches the `tree` service, and restarts it when needed.
- `update` This service listens for GitHub push events on port 1123 to update your `tree` repo.

## Installation

- Make sure you have `node`, `git` and `curl`.
- Create a user called `dom`.
- `bash -c "$(curl https://raw.github.com/garden/services/master/install.sh)"`

## Usage

- `sudo service redirect start` This will redirect HTTP traffic to HTTPS on your server.
- `sudo service warden start` This will automatically start and watch the `tree` service for you.
- `sudo service update start` This will update your `tree` repo on each GitHub push request.
