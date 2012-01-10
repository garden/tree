#!/bin/bash

from=jan

if [ "$1" ]; then
  from=$1
fi

git checkout garden &&
git pull "$from" master &&
touch node.log &&
make debug DEBUG=10

