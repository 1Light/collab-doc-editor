# Collaborative Document Editor with AI Writing Assistant

This repository contains a monorepo implementation of a real-time collaborative document editor with an integrated AI writing assistant.

---

## Project Structure

```
apps/
api/         Core backend API
ai-service/  AI job execution service
realtime/    Realtime collaboration service
web/         Frontend application

packages/
contracts/   Shared schemas, DTOs, and types

e2e/
tests/       End-to-end tests (Playwright)
```

---

## Prerequisites

* Node.js
* pnpm
* Docker (for running PostgreSQL)
* Playwright browsers

---

## Installation

Run from the repository root:

```bash
pnpm install
```

---

## Environment Configuration

Each service uses environment variables.

All required variables are defined in the `.env.example` file inside each application directory.

Create `.env` files for each service:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/ai-service/.env.example apps/ai-service/.env
cp apps/realtime/.env.example apps/realtime/.env
cp apps/web/.env.example apps/web/.env
```

### API (`apps/api/.env`)

```env
DATABASE_URL=postgresql://collab:collab@localhost:5432/collabdb?schema=public
SHADOW_DATABASE_URL=postgresql://collab:collab@localhost:5432/collabdb_shadow?schema=public
JWT_SECRET=your-secret-key
WEB_ORIGIN=http://localhost:5173
```

### AI Service (`apps/ai-service/.env`)

```env
LLM_PROVIDER=mock
```

### Realtime (`apps/realtime/.env`)

```env
PORT=4001
```

### Web (`apps/web/.env`)

```env
VITE_API_URL=http://localhost:4000
```

---

## Quick Start

### 1. Setup database (API)

#### Start PostgreSQL (Docker - recommended)

From the repository root:

```bash
docker-compose up -d
```

Ensure port `5432` is not already in use on your machine.

---

#### Create shadow database (required for Prisma migrations)

```bash
docker exec -it collab_postgres psql -U collab -c "CREATE DATABASE collabdb_shadow;"
```

---

#### Run migrations

```bash
cd apps/api

# Generate Prisma client
pnpm prisma generate

# Apply migrations (creates all tables)
pnpm prisma migrate dev

# Seed database (optional)
pnpm prisma:seed
```

---

### 2. Start all services (from root)

```bash
pnpm dev
```

---

## Testing

The project supports unit, integration, and end-to-end testing.

---

### Unit Tests

Run within a specific app:

```bash
cd apps/api
pnpm test:unit
```

```bash
cd apps/web
pnpm test:unit
```

```bash
cd apps/ai-service
pnpm test:unit
```

```bash
cd apps/realtime
pnpm test:unit
```

Run all unit tests (from root):

```bash
pnpm test:unit
```

---

### Integration Tests

Run within a specific app:

```bash
cd apps/api
pnpm test:integration
```

```bash
cd apps/web
pnpm test:integration
```

Run all integration tests (from root):

```bash
pnpm test:integration
```

---

### End-to-End Tests

Run from the repository root:

```bash
pnpm test:e2e
```

---

### Run All Tests

```bash
pnpm test:all
```

---

## Testing Strategy

### Unit Testing

* Validates isolated business logic
* Covers:

  * AI retry logic, prompt generation, and job execution
  * permission resolution and AI policy enforcement
  * frontend comment utilities
  * realtime session management
* No external dependencies

---

### Integration Testing

* Validates interaction between components
* Covers:

  * API routes and middleware
  * authentication and validation behavior
  * document lifecycle (create, list, retrieve)
  * frontend components interacting with API modules
* Uses mocked dependencies instead of a live database

---

### End-to-End Testing

* Uses Playwright
* Runs in a real browser environment
* Validates system-level behavior
* Current coverage:

  * unauthenticated user redirection to login

---

## Notes

* Shared contracts are defined in `packages/contracts`
* Tests are organized per application under:

  * `tests/unit`
  * `tests/integration`
* End-to-end tests are located in:

  * `e2e/tests`
* Services are decoupled (API, AI, realtime) for scalability and modularity

---

## Authors

* Ananthicha Vimalkumar
* Mazen Hany Abdelhamid
* Nasir Adem Degu

---

## License

This project is for academic purposes only.
