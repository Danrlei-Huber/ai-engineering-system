#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
printf '# demo\n\nConfiguration is loaded from environment variables by src/config.js.\n' > README.md
cat > src/config.js <<'EOF'
export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbUrl: process.env.DATABASE_URL,
};
EOF
