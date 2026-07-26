#!/bin/bash
# Validate @courtzon/shared package governance rules
# Run from repository root.

set -euo pipefail

SHARED_DIR="packages/shared/src"

echo "=== @courtzon/shared Governance Validation ==="
echo ""

# 1. Check for forbidden framework imports
echo "[1/4] Checking for forbidden framework imports..."
FORBIDDEN_IMPORTS=(
  "from 'react'"
  "from \"react\""
  "from 'fastify'"
  "from \"fastify\""
  "from 'express'"
  "from \"express\""
  "from 'prisma'"
  "from \"prisma\""
  "from 'socket.io'"
  "from \"socket.io\""
  "from 'ioredis'"
  "from \"ioredis\""
  "from 'mysql'"
  "from \"mysql\""
  "from 'pino'"
  "from \"pino\""
)

violations=0
for pattern in "${FORBIDDEN_IMPORTS[@]}"; do
  if grep -r "$pattern" "$SHARED_DIR/" --include="*.ts" 2>/dev/null; then
    echo "  ❌ Forbidden import found: $pattern"
    violations=$((violations + 1))
  fi
done
if [ "$violations" -eq 0 ]; then
  echo "  ✅ No forbidden imports"
fi

# 2. Check for imports from backend/frontend
echo "[2/4] Checking for cross-application imports..."
if grep -r "from '\.\./backend\|from \"\.\./backend\|from '\.\./frontend\|from \"\.\./frontend" "$SHARED_DIR/" --include="*.ts" 2>/dev/null; then
  echo "  ❌ Cross-application imports found"
  violations=$((violations + 1))
else
  echo "  ✅ No cross-application imports"
fi

# 3. Check for node_modules inside shared package
echo "[3/4] Checking for dependencies..."
if [ -d "packages/shared/node_modules" ]; then
  echo "  ❌ node_modules found inside packages/shared"
  violations=$((violations + 1))
else
  echo "  ✅ No node_modules inside packages/shared"
fi

# 4. Verify package.json has zero dependencies
echo "[4/4] Checking package.json dependencies..."
DEPS=$(node -e "const p=require('./packages/shared/package.json'); console.log(Object.keys(p.dependencies||{}).length)")
DEVDEPS=$(node -e "const p=require('./packages/shared/package.json'); console.log(Object.keys(p.devDependencies||{}).length)")
if [ "$DEPS" -gt 0 ] || [ "$DEVDEPS" -gt 0 ]; then
  echo "  ❌ package.json has $DEPS dependencies and $DEVDEPS devDependencies (expected 0)"
  violations=$((violations + 1))
else
  echo "  ✅ package.json has zero dependencies"
fi

echo ""
if [ "$violations" -gt 0 ]; then
  echo "❌ FAILED — $violations violation(s) found"
  exit 1
else
  echo "✅ PASSED — All governance rules satisfied"
fi
