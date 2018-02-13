#!/bin/bash

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd "$DIR"/../..
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

if ! which node >/dev/null; then
  echo "[install] node"
  node_js_version=$(wget -q -O - "https://nodejs.org/dist/index.tab" \
    | tail -n +2 | head -n 1 | cut -f1)
  wget -Nq "https://nodejs.org/dist/${node_js_version}/node-${node_js_version}-linux-x64.tar.xz"
  tar xf node-*.tar.xz
  rm node-*-linux-x64.tar.xz
  sudo mv node-*-linux-x64 /usr/local/nodejs
  for exe in $(ls /usr/local/nodejs/bin); do
    sudo ln -s /usr/local/nodejs/bin/"${exe}" /usr/local/bin/"$exe"
  done
fi

if ! which openssl >/dev/null; then
  echo "[install] openssl"
  sudo apt install openssl
fi

# install cockroachDB

if ! which cockroach >/dev/null; then
  echo "[install] cockroach"
  wget -Nq "https://binaries.cockroachdb.com/cockroach-latest.linux-amd64.tgz"
  tar xfz cockroach-latest.linux-amd64.tgz
  sudo cp -i cockroach-latest.linux-amd64/cockroach /usr/local/bin
  rm -r cockroach-latest.linux-amd64*
fi

if ! [[ -d admin/db ]]; then
  mkdir -p admin/db
  pushd admin/db
    mkdir certs
    mkdir private-certs
    cockroach cert create-ca \
      --certs-dir=certs --ca-key=../private/dbcerts/ca.key
    cockroach cert create-client root \
      --certs-dir=certs --ca-key=../private/dbcerts/ca.key
    cockroach cert create-node localhost 127.0.0.1 \
      --certs-dir=certs --ca-key=../private/dbcerts/ca.key
  popd
fi

if [[ "$ENV" == prod ]]; then
  echo -n "Executing production installation; enter 'yes' to confirm: "
  read confirmation
  if [[ "$confirmation" != yes ]]; then
    exit 0
  fi

  # Cockroach

  # Admin UI: only allow localhost to connect (use with SOCKS).
  sudo iptables -I INPUT -p tcp -s 127.0.0.1 --dport 8080 -j ACCEPT
  sudo iptables -I INPUT -p tcp -s 0.0.0.0/0 --dport 8080 -j DROP
  # Set NTP: FIXME

  # HTTPS (self-signed to bootstrap Let’s encrypt)

  if [[ ! -e admin/private/https/cert.pem ]]; then
    pushd admin/private/https
      openssl genrsa -aes256 -out privkey.pem 1024
      openssl req -new -nodes -key privkey.pem -out fullchain.pem
      openssl x509 -req -days 365 -in fullchain.pem -signkey privkey.pem -out cert.pem
      cp privkey.pem{,.orig}
      openssl rsa -in privkey.pem.orig -out privkey.pem
    popd
  fi

  # Services

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
  fi

  # Let’s encrypt

  if [[ ! -e admin/private/https/letsencrypt ]]; then
    sudo apt-get update
    sudo apt-get install software-properties-common
    sudo add-apt-repository ppa:certbot/certbot
    sudo apt-get update
    sudo apt-get install certbot
    sudo certbot certonly --webroot -d thefiletree.com \
      -w admin/private/https
    touch admin/private/https/letsencrypt
  fi
fi

# start CockroachDB

if ! cockroach node ls --certs-dir=admin/db/certs >/dev/null 2>&1
then
  db_database=$(jq <admin/private/"$ENV".json -r .pg.database)
  db_host=$(jq <admin/private/"$ENV".json -r .pg.host)
  db_cache=$(jq <admin/private/"$ENV".json -r .pg.cache)
  db_max_sql_memory=$(jq <admin/private/"$ENV".json -r .pg.maxSqlMemory)

  pushd admin/db
    cockroach start --host="$db_host" --cache="$db_cache" \
      --max-sql-memory="$db_max_sql_memory"\
      --background --certs-dir=certs
    cockroach sql --execute "CREATE DATABASE IF NOT EXISTS $db_database" \
      --host="$db_host" --certs-dir=certs
  popd
fi
