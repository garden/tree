#!/bin/sh

mkdir camp web web/js ScoutCamp
git clone http://github.com/espadrine/ScoutCamp.git
cp -rf ScoutCamp/* .
rm -rf ScoutCamp

