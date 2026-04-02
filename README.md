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

````

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
````

---

## Environment Configuration

Each service requires its own `.env` file.

All required variables are defined in the `.env.example` file inside each application directory.

Create `.env` files for each service:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/ai-service/.env.example apps/ai-service/.env
cp apps/realtime/.env.example apps/realtime/.env
cp apps/web/.env.example apps/web/.env
```

---

### API (`apps/api/.env`)

```env
DATABASE_URL=your_database_url
SHADOW_DATABASE_URL=your_shadow_database_url
JWT_SECRET=your_jwt_secret
API_PORT=4000

WEB_ORIGIN=http://localhost:5173
WEB_APP_URL=http://localhost:5173

AI_SERVICE_URL=http://localhost:4002
REALTIME_INTERNAL_URL=http://localhost:4001
REALTIME_INTERNAL_SECRET=your_internal_secret

EMAIL_PROVIDER=gmail
GMAIL_USER=your_email
GMAIL_APP_PASSWORD=your_app_password
EMAIL_FROM=your_email
```

---

### AI Service (`apps/ai-service/.env`)

```env
PORT=4002

LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://127.0.0.1:1234
LLM_MODEL=your_model
LLM_API_KEY=
```

---

### Realtime (`apps/realtime/.env`)

```env
REALTIME_PORT=4001

JWT_SECRET=your_jwt_secret
API_BASE_URL=http://localhost:4000

REALTIME_INTERNAL_SECRET=your_internal_secret
```

---

### Web (`apps/web/.env`)

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_REALTIME_BASE_URL=http://localhost:4001

WEB_PORT=5173
```

---

> ℹ️ Use the same `JWT_SECRET` and `REALTIME_INTERNAL_SECRET` across services.

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
cd apps/api && pnpm test:unit
cd apps/web && pnpm test:unit
cd apps/ai-service && pnpm test:unit
cd apps/realtime && pnpm test:unit
```

Run all unit tests:

```bash
pnpm test:unit
```

---

### Integration Tests

Run within a specific app:

```bash
cd apps/api && pnpm test:integration
cd apps/web && pnpm test:integration
```

Run all integration tests:

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

```

---