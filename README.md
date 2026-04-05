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
DATABASE_URL=postgresql://collab:collab@localhost:5432/collabdb?schema=public
SHADOW_DATABASE_URL=postgresql://collab:collab@localhost:5432/collabdb_shadow?schema=public

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

### Email Configuration (Gmail)

We use Gmail as a simple and free email provider for this MVP.

To configure email sending:

1. Enable **2-Step Verification** on your Google account
2. Go to: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Generate a new **App Password** (select "Mail")
4. Use this value as `GMAIL_APP_PASSWORD` in your `.env`

> Do NOT use your regular Gmail password. Use an App Password instead.

> Email configuration is optional. If not set, email-related features may not work.

---

### AI Service (`apps/ai-service/.env`)

```env
PORT=4002

LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://127.0.0.1:1234
LLM_MODEL=your_model
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

> ℹ️ The `JWT_SECRET` and `REALTIME_INTERNAL_SECRET` must be the same across services to ensure proper authentication and internal communication.

---

## Database Setup (IMPORTANT)

### 0. Install & Start Docker

* Install Docker Desktop: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
* Open Docker Desktop and make sure it is running

---

### 1. Start PostgreSQL with Docker

From the repository root, run:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

---

###

```bash
docker ps
```

You should see a container named:

```
collab_postgres
```

---

### 2. Create shadow database (required)

```bash
docker exec -it collab_postgres psql -U collab -d postgres -c "CREATE DATABASE collabdb_shadow;"
```

---

### 3. Run Prisma setup

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

## Running the System

From repo root:

```bash
pnpm dev
```

Services:

* API: [http://localhost:4000](http://localhost:4000)
* Realtime: [http://localhost:4001](http://localhost:4001)
* AI Service: [http://localhost:4002](http://localhost:4002)
* Web: [http://localhost:5173](http://localhost:5173)
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
