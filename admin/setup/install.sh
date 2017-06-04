#!/bin/bash

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

# This script assumes an Ubuntu installation.

# install git, node, npm

if ! which git >/dev/null; then
  sudo apt install git
fi

if ! which node >/dev/null; then
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
  wget -Nq "https://binaries.cockroachdb.com/cockroach-latest.linux-amd64.tgz"
  tar xfz cockroach-latest.linux-amd64.tgz
  sudo cp -i cockroach-latest.linux-amd64/cockroach /usr/local/bin
  rm cockroach-latest.linux-amd64.tgz
  mkdir cockroach

  pushd cockroach

    mkdir certs
    sudo mkdir private-certs
    cockroach cert create-ca \
      --certs-dir=certs --ca-key=private-certs/ca.key
    cockroach cert create-client root \
      --certs-dir=certs --ca-key=private-certs/ca.key
    cockroach cert create-node localhost 127.0.0.1 \
      --certs-dir=certs --ca-key=private-certs/ca.key

    cockroach start --background --certs-dir=certs

  popd
fi

read -p "Do you wish to install systemd service files? " -rn 1
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  # install service scripts
  sudo cp "$DIR"/admin/setup/tree.service /etc/systemd/system/
  sudo cp "$DIR"/admin/setup/redirect.service /etc/systemd/system/
  sudo cp "$DIR"/admin/setup/update.service /etc/systemd/system/
  sudo systemctl daemon-reload

  # start all services
  sudo systemctl start tree.service
  sudo systemctl start redirect.service
  sudo systemctl start update.service
fi
