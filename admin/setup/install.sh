#!/bin/bash

dir=$(cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)
cd "$dir"/../..
mkdir -p admin/log admin/private/https admin/private/dbcerts

# This script assumes an Ubuntu installation.

# install git, curl, jq, node, npm

if ! which git >/dev/null; then
  echo "[install] git"
  sudo apt install git
fi

if ! which curl >/dev/null; then
  echo "[install] curl"
  sudo apt install curl
fi

if ! which jq >/dev/null; then
  echo "[install] jq"
  sudo apt install jq
fi

if ! which g++ >/dev/null; then
  echo "[install] g++"
  sudo apt install g++
fi

if ! which node >/dev/null; then
  echo "[install] node"
  node_js_version=$(wget -q -O - "https://nodejs.org/dist/index.tab" \
    | tail -n +2 | head -n 1 | cut -f1)
  (set -x
    wget -Nq "https://nodejs.org/dist/${node_js_version}/node-${node_js_version}-linux-x64.tar.xz"
    tar xf node-*.tar.xz
    rm node-*-linux-x64.tar.xz
    sudo mv node-*-linux-x64 /usr/local/nodejs
    for exe in $(ls /usr/local/nodejs/bin); do
      sudo ln -s /usr/local/nodejs/bin/"${exe}" /usr/local/bin/"$exe"
    done
  )
fi

if ! which openssl >/dev/null; then
  echo "[install] openssl"
  sudo apt install openssl
fi

# install CockroachDB

if ! which cockroach >/dev/null; then
  echo "[install] cockroach: binary"
  (set -x
    wget -Nq "https://binaries.cockroachdb.com/cockroach-latest.linux-amd64.tgz"
    tar xfz cockroach-*.linux-amd64.tgz
    sudo cp -i cockroach-*.linux-amd64/cockroach /usr/local/bin
    rm -r cockroach-*.linux-amd64*
  )
fi

host=$(<admin/private/env.json jq -r .http.host)
env=$(<admin/private/env.json jq -r .env)
export COCKROACH_CERTS_DIR="$(realpath admin/db/certs)"
ca_key="$(realpath admin/private/dbcerts/ca.key)"

if ! [[ -d admin/db ]]; then
  mkdir -p admin/db
  pushd admin/db
    mkdir certs
    mkdir private-certs
    export COCKROACH_CERTS_DIR="$(realpath certs)"
    (set -x
      cockroach cert create-ca --ca-key="$ca_key"
      cockroach cert create-node localhost 127.0.0.1 --ca-key="$ca_key"
      cockroach cert create-client root --ca-key="$ca_key"
    )
  popd
fi

if [[ "$env" == production ]]; then

  # Cockroach

  # Admin UI: only allow localhost to connect.
  # To use it, build an SSH tunnel: ssh -L 8080:127.0.0.1:8080 tree -N
  echo "[install] cockroach: limit admin UI access"
  (set -x
    sudo iptables -I INPUT -p tcp -s 127.0.0.1 --dport 8080 -j ACCEPT
    sudo iptables -I INPUT -p tcp -s 0.0.0.0/0 --dport 8080 -j DROP
    # Set NTP: FIXME
  )

    # HTTPS (self-signed to bootstrap Let’s encrypt)

  echo "[install] tls: self-signed"
  (set -x
    if [[ ! -e admin/private/https/cert.pem ]]; then
      pushd admin/private/https
        openssl genrsa -aes256 -out privkey.pem 1024
        openssl req -new -nodes -key privkey.pem -out fullchain.pem
        openssl x509 -req -days 365 -in fullchain.pem -signkey privkey.pem -out cert.pem
        cp privkey.pem{,.orig}
        openssl rsa -in privkey.pem.orig -out privkey.pem
      popd
    fi
  )

  # Services

  echo "[install] systemd: services for auto restart"
  (set -x
    if [[ ! -e /etc/systemd/system/tree.service ]]; then
      # install service scripts
      sudo cp admin/setup/tree.service /etc/systemd/system/
      sudo cp admin/setup/redirect.service /etc/systemd/system/
      sudo cp admin/setup/update.service /etc/systemd/system/
      sudo cp admin/setup/renew-cert.service /etc/systemd/system/
      sudo cp admin/setup/renew-cert.timer /etc/systemd/system/
      sudo systemctl daemon-reload

      # start all services
      sudo systemctl start tree.service
      sudo systemctl start redirect.service
      sudo systemctl start update.service
      sudo systemctl start renew-cert.timer
      sudo systemctl enable tree.service
      sudo systemctl enable redirect.service
    fi
  )

  # Let’s encrypt

  if [[ ! -e admin/private/https/letsencrypt ]]; then
    echo "[install] tls: let’s encrypt setup"
    if ! which certbot >/dev/null; then
      echo "[install] tls: certbot"
      (set -x
        sudo apt-get update
        sudo apt-get install software-properties-common
        sudo add-apt-repository ppa:certbot/certbot
        sudo apt-get update
        sudo apt-get install certbot
      )
    fi
    (set -x
      sudo certbot certonly --webroot -d "$host" -w admin && \
      touch admin/private/https/letsencrypt
    )
  fi
fi

# start CockroachDB

if ! cockroach node ls >/dev/null 2>&1
then
  db_database=$(jq <admin/private/env.json -r .pg.database)
  db_host=$(jq <admin/private/env.json -r .pg.host)
  db_port=$(jq <admin/private/env.json -r .pg.port)
  db_leader=$(jq <admin/private/env.json -r .pg.leader)
  db_cache=$(jq <admin/private/env.json -r .pg.cache)
  db_max_sql_memory=$(jq <admin/private/env.json -r .pg.maxSqlMemory)

  pushd admin/db
    cockroach version
    (set -x
      cockroach start --host="$db_host" --join="$db_leader" \
        --listen-addr=localhost:"$db_port" \
        --cache="$db_cache" --max-sql-memory="$db_max_sql_memory" \
        --certs-dir="$COCKROACH_CERTS_DIR" --background
      cockroach init --host="$db_leader"
      cockroach sql --host="$db_host" \
        --execute "CREATE DATABASE IF NOT EXISTS $db_database"
    )
  popd
fi
