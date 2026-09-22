#!/usr/bin/env bash
set -euo pipefail
mkdir -p config
printf 'export const settings = {};\n' > config/settings.js
