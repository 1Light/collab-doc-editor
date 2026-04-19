# Architecture Deviations

This section highlights the most important differences between the original SRS and the final implementation. It focuses on changes that affect the system’s architecture, security, or user experience, rather than small UI or code-level updates.

Overall, the core design from the SRS was preserved. The changes below are refinements made during implementation to make the system more usable, reliable, and aligned with Assignment 2 expectations.

---

## 1. Backend Platform (Node Instead of FastAPI)

**What changed:**
The assignment suggested using FastAPI, but the system continues to use the Node/TypeScript architecture from Assignment 1, with separate services:

* `apps/api`
* `apps/realtime`
* `apps/ai-service`
* `apps/web`

**Why:**
The system was already designed around this structure. Rewriting everything in FastAPI would have added risk and taken time without improving the final product.
**This decision was also confirmed with the instructors and was approved**.

**Impact:**
The original architecture was preserved, keeping the system consistent and stable.

---

## 2. Improved Authentication Sessions

**What changed:**
Session handling was improved to keep users logged in during long editing sessions.

**How:**

* short-lived access tokens
* refresh tokens stored in secure cookies
* automatic session renewal

**Why:**
The SRS defined authentication but did not fully describe how sessions should persist over time.

**Impact:**
Users are not interrupted while working, and overall security is improved.

---

## 3. AI Interaction Became Live and Interactive

**What changed:**
The AI system moved from a “request and wait” model to a live, interactive experience.

**Added features:**

* streaming responses as they are generated
* ability to cancel requests
* review suggestions before applying
* accept, reject, or edit suggestions
* undo applied changes
* per-document AI history

**Why:**
The original approach worked, but it felt slow and less practical for writing tasks. Assignment 2 also required a more interactive experience.

**Impact:**
The AI assistant is faster, more responsive, and better suited for real-time writing.

---

## 4. Document Ownership Handling

**What changed:**
A clear rule was added for document ownership when users leave or are removed.

**How:**
Documents owned by that user are transferred to the organization owner.

**Why:**
The SRS did not fully define this case, and leaving it undefined could result in documents without owners.

**Impact:**
Improvement: no orphaned documents, and ownership remains clear and consistent.
Compromise: the organization owner may accumulate many transferred documents over time.

---

## 5. Organization Management Became Clear to Users

**What changed:**
Organization management is now a visible and dedicated part of the user experience.

**Users can:**

* view all their organizations
* switch between organizations
* leave organizations
* create new organizations 

**Why:**
The SRS supported this concept, but it was not clearly exposed in the user interface.

**Impact:**
Makes the system easier to understand and manage.

---

## 6. Sharing via Links Fully Implemented

**What changed:**
Link-based sharing was expanded into a complete, consistent feature across the system.

**How it works:**

* users can generate share links
* links are usable only by authenticated members of the same organization
* permissions are enforced like normal access
* works in both API and realtime collaboration
* link permission changes propagate to active sessions without requiring a manual refresh
* still requires organization membership

**Why:**
The concept existed in the SRS, but it needed a full implementation to be useful.

**Impact:**
Improves sharing flexibility without weakening security.

---

## Overall Summary

The system remains faithful to the original SRS:

* multi-service architecture
* real-time collaboration using Yjs
* role-based access control
* document history, comments, and AI support

The differences introduced during development are not changes in direction. They are practical improvements that make the system more usable, more secure, and closer to a real-world product.
