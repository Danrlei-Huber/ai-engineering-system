#!/usr/bin/env bash
set -euo pipefail
git init -q
echo "committed line" > notes.txt
git add -A && git -c user.name=t -c user.email=t@t commit -qm init
echo "local change that must survive" >> notes.txt
