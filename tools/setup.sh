#!/bin/bash

# Garden branch.

echo -n "What is the name of your remote pointing to garden? "
read garden

echo "garden-remote $garden" >> ./tools/.params

echo -n "What do you want the name of the branch holding garden to be? "
read gardenbranch

git branch "$gardenbranch" "$garden"/master

echo "garden-branch $gardenbranch" >> ./tools/.params

# Default pull requester.

echo -n "Who do you usually pull from (default)? "
read pullrequester

echo "default-pull-from $pullrequester" >> ./tools/.params

