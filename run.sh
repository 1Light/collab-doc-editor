#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

required_envs=(
  "apps/api/.env"
  "apps/ai-service/.env"
  "apps/realtime/.env"
  "apps/web/.env"
)

for env_file in "${required_envs[@]}"; do
  if [[ ! -f "$env_file" ]]; then
    echo "Missing required env file: $env_file"
    echo "Create it from the matching .env.example before running ./run.sh"
    exit 1
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to start PostgreSQL. Please install Docker Desktop and try again."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed, but the Docker daemon is not running."
  echo "Start Docker Desktop (or your Docker service) and try ./run.sh again."
  exit 1
fi

echo "Building shared contracts..."
pnpm --filter @repo/contracts build

echo "Starting PostgreSQL..."
docker compose -f infra/docker/docker-compose.yml up -d

echo "Generating Prisma client..."
pnpm prisma:generate

echo "Applying database migrations..."
pnpm prisma:deploy

echo "Starting collaborative editor services..."
pnpm dev
