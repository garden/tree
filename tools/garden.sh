#!/bin/bash

git checkout garden &&
git pull garden master &&
git checkout master &&
git merge garden

