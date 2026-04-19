# Change 001 - Assignment 2 Platform Deviations

Date: 2026-04-17
Status: accepted

SRS baseline:
- Assignment 1 established a multi-service collaborative editor architecture with separate web, API, realtime, and AI responsibilities.

New decision:
- The final implementation keeps the existing Node/TypeScript multi-service architecture instead of rewriting the backend into FastAPI for Assignment 2.
- JWT refresh uses an HttpOnly cookie.
- AI generation streams over SSE while preserving the existing AI job persistence model.

Reason:
- The current architecture already matches the Assignment 1 design well and was approved for continued use.
- Rewriting the backend stack would add risk without improving the implemented product.
- Silent refresh and SSE streaming better satisfy the Assignment 2 runtime requirements.

Affected areas:
- `apps/api`
- `apps/ai-service`
- `apps/web`
- `DEVIATIONS.md`

Follow-up for final SRS update:
- Document the approved framework choice, token lifecycle, and streaming design in the final report/README.
