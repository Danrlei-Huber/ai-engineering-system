#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{ "name": "demo", "type": "module", "scripts": { "test": "node --test" } }
EOF
mkdir -p src tests
cat > src/add.js <<'EOF'
export const add = (a, b) => a + b;
EOF
cat > tests/add.test.js <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/add.js';
test('adds', () => assert.equal(add(2, 3), 5));
EOF
git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init
