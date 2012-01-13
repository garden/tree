#!/bin/bash

# Run this from the root to push changes previously pulled, to garden/tree.

if [ ! -e ./tools/.params ]; then ./tools/setup.sh; fi
gardenbranch=$(cat ./tools/.params | awk '/garden-branch/ { print $2; exit }')

git checkout "$gardenbranch" &&
git push "$gardenbranch" master &&
git checkout master

