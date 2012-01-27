#!/bin/bash

# Run this from the root to put the changes in garden in your master branch.

if [ ! -e ./tools/.params ]; then ./tools/setup.sh; fi
gardenbranch=$(cat ./tools/.params | awk '/garden-branch/ { print $2; exit }')
gardenremote=$(cat ./tools/.params | awk '/garden-remote/ { print $2; exit }')

git checkout "$gardenbranch" &&
git pull "$gardenbranch" master &&
git checkout master &&
git merge "$gardenbranch"

