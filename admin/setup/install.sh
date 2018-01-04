#!/bin/bash

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
mkdir -p "$DIR"/admin/log
mkdir -p "$DIR"/admin/private/https

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
  mkdir bin
  local node_js_version=$(wget -q -O - "https://nodejs.org/dist/index.tab" \
    | tail -n +2 | head -n 1 | cut -f1)
  wget -Nq "https://nodejs.org/dist/${node_js_version}/node-${node_js_version}-linux-x64.tar.xz"
  tar xf node-*.tar.xz
  rm node-*-linux-x64.tar.xz
  local nodejs_folder=$(ls node-*-linux-x64)
  mv node-*-linux-x64 nodejs
  for exe in $(ls "${nodejs_folder}"/bin); do
    sudo mv "${nodejs_folder}/bin/${exe}" /usr/local/bin/"$exe"
  done
  rm -rf "${nodejs_folder}"
fi

# install cockroachDB

if ! which cockroach >/dev/null; then
  echo "[install] cockroach"
  wget -Nq "https://binaries.cockroachdb.com/cockroach-latest.linux-amd64.tgz"
  tar xfz cockroach-latest.linux-amd64.tgz
  sudo cp -i cockroach-latest.linux-amd64/cockroach /usr/local/bin
  rm cockroach-latest.linux-amd64.tgz
fi

if ! [[ -d cockroach ]]; then
  mkdir cockroach

  pushd cockroach
    mkdir certs
    mkdir private-certs
    cockroach cert create-ca \
      --certs-dir=certs --ca-key=private-certs/ca.key
    cockroach cert create-client root \
      --certs-dir=certs --ca-key=private-certs/ca.key
    cockroach cert create-node localhost 127.0.0.1 \
      --certs-dir=certs --ca-key=private-certs/ca.key
  popd
fi

if ! cockroach node ls --certs-dir=cockroach/certs >/dev/null 2>&1; then
  db_database=$(jq <admin/private/"$ENV".json -r .pg.database)
  db_host=$(jq <admin/private/"$ENV".json -r .pg.host)

  pushd cockroach
    cockroach start --background --certs-dir=certs --host="$db_host"
    cockroach sql --certs-dir=certs --host="$db_host" \
      --execute "CREATE DATABASE IF NOT EXISTS $db_database"
  popd
fi

if [[ "$ENV" == prod ]]; then
  echo -n "Executing production installation; enter 'yes' to confirm: "
  read confirmation
  if [[ "$confirmation" != yes ]]; then
    exit 0
  fi

  # Let’s encrypt

  if [[ ! -e "$DIR"/https.crt ]]; then
    sudo apt-get update
    sudo apt-get install software-properties-common
    sudo add-apt-repository ppa:certbot/certbot
    sudo apt-get update
    sudo apt-get install certbot
    sudo certbot certonly --webroot -d thefiletree.com \
      -w "$DIR"/admin/well-known
  fi

  # Services

  if [[ ! -e /etc/systemd/system/tree.service ]]; then
    # install service scripts
    sudo cp "$DIR"/admin/setup/tree.service /etc/systemd/system/
    sudo cp "$DIR"/admin/setup/redirect.service /etc/systemd/system/
    sudo cp "$DIR"/admin/setup/update.service /etc/systemd/system/
    sudo cp "$DIR"/admin/setup/renew-cert.service /etc/systemd/system/
    sudo cp "$DIR"/admin/setup/renew-cert.timer /etc/systemd/system/
    sudo systemctl daemon-reload

    # start all services
    sudo systemctl start tree.service
    sudo systemctl start redirect.service
    sudo systemctl start update.service
    sudo systemctl start renew-cert.timer
  fi
fi
