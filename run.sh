#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

echo "Building shared contracts..."
pnpm --filter @repo/contracts build

echo "Starting collaborative editor services..."
pnpm dev
