#!/bin/bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
cd $(dirname $0)
git push origin $BRANCH
Fab dev:$BRANCH
