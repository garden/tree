#!/bin/sh

mkdir camp web web/js ScoutCamp
git clone git://github.com/espadrine/ScoutCamp.git
cp -rf ScoutCamp/* .
rm -rf ScoutCamp

