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
```

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

> The `JWT_SECRET` and `REALTIME_INTERNAL_SECRET` must be the same across services to ensure proper authentication and internal communication.

---

## Running the System

From repo root:

```bash
./run.sh
```

If needed, make it executable first:

```bash
chmod +x run.sh
./run.sh
```

What `run.sh` does:

- builds the shared `packages/contracts` package first
- starts PostgreSQL with Docker
- generates the Prisma client
- applies committed database migrations automatically
- starts all app services from the repository root
- gives you a single-command local startup flow for the project

How to use it:

1. Make sure the `.env` files are created for each app.
2. Make sure Docker Desktop is installed and running.
3. Run `./run.sh` from the repository root.
4. Leave that terminal open while the app is running.
5. Open the web app at `http://localhost:5173`.

Notes:

- `run.sh` is the recommended reviewer flow.
- It uses `prisma migrate deploy`, so normal local startup does not require a manual shadow-database setup.
- Database seeding is optional and is not required to run the application.
- If any required `.env` file is missing, `run.sh` will stop and tell you which one to create.

If you prefer to start the monorepo directly without the wrapper script, you can also use:

```bash
pnpm dev
```

Services:

* API: [http://localhost:4000](http://localhost:4000)
* Realtime: [http://localhost:4001](http://localhost:4001)
* AI Service: [http://localhost:4002](http://localhost:4002)
* Web: [http://localhost:5173](http://localhost:5173)
---

## Architecture Overview

The application is split into four cooperating services:

- `apps/web`: React + Vite frontend with Tiptap editor, AI suggestion UI, presence UI, and document dashboard.
- `apps/api`: Core authenticated API for auth, documents, sharing, comments, versions, and AI job orchestration.
- `apps/realtime`: Authenticated Socket.IO collaboration service using Yjs for shared document state and awareness.
- `apps/ai-service`: AI execution service that streams model output back to the API and persists job metadata through the API layer.

Shared DTOs and schemas live in `packages/contracts`.

## JWT Lifecycle

- Login/signup issues a short-lived access token and sets a refresh token in an HttpOnly cookie.
- The frontend stores the access token locally and sends it on API requests.
- If an API call returns `401`, the frontend silently calls `/api/auth/refresh`.
- A successful refresh returns a new access token without interrupting the editing session.
- If refresh fails, the client clears session state and redirects to login.

Current defaults:

- Access token TTL: 20 minutes
- Refresh token TTL: 7 days

## Realtime Collaboration Design

- WebSocket authentication is required before joining document rooms.
- Each collaborator joins a document-specific room after the API confirms access.
- Yjs is used for character-level shared state and conflict resolution.
- Presence and cursor awareness are broadcast separately from document content.
- On disconnect, the editor becomes read-only.
- On reconnect, the client re-authenticates, rejoins the room, resyncs Yjs state, and resumes editing.

Main message categories:

- `join_document` / `leave_document`
- `yjs:sync_step1` / `yjs:sync_step2`
- `yjs:update`
- `yjs:awareness_update`
- `presence:update`
- `cursor:batch`

## AI Flow

1. The user selects document text and opens the AI suggestion panel.
2. The frontend sends a streamed AI job request with only the selected text plus operation-specific parameters.
3. The API checks document permissions and AI policy, then creates a persisted AI job.
4. The API forwards the request to the AI service and streams chunks back to the browser over SSE.
5. The user can cancel, edit the generated text, accept, reject, or undo an accepted apply.
6. Accepted suggestions create a new document version and are recorded in AI history.

Implemented AI operations include:

- Rewrite / enhance writing
- Summarize
- Translate
- Reformat

Prompt templates are centralized in `apps/ai-service/src/modules/jobs/promptTemplates.ts`, and the model provider is abstracted behind `apps/ai-service/src/providers/llmProvider.ts`.

## Sharing and Permissions

- Document roles: `Owner`, `Editor`, `Commenter`, `Viewer`
- Owners can share, update permissions, revoke access, and delete documents.
- Editors can modify content and invoke AI.
- Viewers can read but cannot edit or invoke AI.
- Server-side checks are enforced on document, comment, version, and AI routes.
- Sharing supports both email-based invites and direct link creation with role assignment.

## Testing Coverage

- Backend unit tests cover permission logic and AI policy logic.
- Backend integration tests cover auth, documents, admin routes, AI routes, and auth guards.
- Realtime integration tests cover websocket auth, shared updates, reconnect/resync, and presence behavior.
- Frontend integration tests cover login, documents UI, AI history, and AI suggestion flows.
- Playwright journeys cover login, document creation/opening, history panels, and AI suggestion acceptance flow.

## API Documentation

- Request/response schemas are defined in `packages/contracts`.
- A Postman collection is available at `docs/api/postman_collection.json`.
- The main route modules are in `apps/api/src/routes` and `apps/api/src/modules`.

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
