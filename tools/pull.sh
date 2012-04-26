#!/bin/bash

# Run this from the root to pull from someone (given as a command-line
# parameter) and test it.

if [ ! -e ./tools/.params ]; then ./tools/setup.sh; fi
gardenbranch=$(cat ./tools/.params | awk '/garden-branch/ { print $2; exit }')

if [ "$1" ]; then
  from=$1
else
  from=cat ./tools/.params | awk '/default-pull-from/ { print $2; exit }'
fi

git checkout "$gardenbranch" &&
git pull "$from" master &&
touch node.log &&
node app 1234

