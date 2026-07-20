# ATS Submit-Candidate — QA Take-Home

A self-contained NestJS + Prisma (SQLite) app that mimics a production "submit a
candidate to a role" flow. Your task as the QA candidate is to **write automated
tests** against it — both at the API level and end-to-end against the thin UI.
This repo ships the app, a deterministic seed, and test-support endpoints. It does
**not** ship any tests or a test runner — **choosing and setting up your own
testing stack is part of the exercise** (e.g. Jest + supertest for the API,
Playwright or Cypress for E2E — your call).

The implementation is a clean reference: there are no planted bugs. You're being
evaluated on your choice of tooling and on the coverage, correctness, and clarity
of the tests you write against the spec below.

## Run it

One command sets everything up from a clean clone (installs deps, generates the
Prisma client, creates the SQLite schema, and seeds deterministic data):

```bash
./setup.sh        # or: npm run setup
npm start         # API on http://localhost:3000, form at http://localhost:3000/
```

`npm run db:reset` is destructive (it force-resets + re-seeds the DB). Re-run it any
time to get back to a clean slate from the shell. During tests, use `POST /test/reset`
instead (below) — same deterministic state, no process restart needed.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/ats/submit-candidate` | The flow under test |
| GET | `/ats/submissions/:id` | Read a submission + profile + stages (assert persisted status/stage transitions) |
| POST | `/test/reset` | Truncate + re-seed deterministically, clear recorders |
| GET | `/test/recorders` | Dump all stubbed side effects (add `?awaitPending=true` to flush the cascade) |

### Auth

Header-based. Send `x-user-id: <userId>` to identify the caller. No JWT.

### `POST /ats/submit-candidate` request body

```jsonc
{
  "jobId": "job_active",
  "notes": "optional",
  "candidate": {
    "id": "rc_with_resume",          // optional; enables find-by-id
    "name": "Alan Turing",
    "email": "Alan@Example.com",     // stored lowercased on the profile
    "linkedin": "https://linkedin.com/in/alan",  // optional; enables find-by-linkedin
    "resumeUrl": "https://...",      // optional; a résumé already on file
    "resumeTempKey": "temp/upload-1.pdf", // optional; a freshly uploaded temp key -> triggers S3 move
    "resumeFileName": "resume.pdf"   // optional; used to build the public key
  },
  "screeningAnswers": [
    { "type": "QUESTION", "answer": "..." },
    { "type": "INFORMATION", "answer": "dropped before persistence" }
  ]
}
```

Success returns `{ candidate, submission, recruiterCandidateId }`.

## The flow (this is your spec)

1. **Recruiter gate** — non-recruiter caller → `403`, and an
   `api_candidate_submission_failed` analytics event still fires.
2. **Validate & resolve candidate** — screening answers over 5000 chars → `400`;
   `INFORMATION`-type answers are dropped from what's persisted. The
   RecruiterCandidate is found-or-created by `candidate.id`, then `linkedin`, else
   created. **Résumé guard:** no `resumeTempKey` in the request AND no résumé on
   file → `400`.
3. **Identity + agency** — name/email/linkedin/résumé taken from the RC row; email
   lowercased; `agencyId` from the caller.
4. **Authorization gates, in strict order:**
   - **a.** Job lookup first — job must exist, be active, not soft-deleted, else
     `404`. (404 always precedes any 403.)
   - **b.** Role-exclusivity guard — if the caller has **no** direct role access
     AND the job is in an active exclusivity window → `403` "This role is currently
     in an exclusive access period." This wins even when a bypass quota would
     otherwise let them in.
   - **c.** Standard access — no direct access and no bypass → `403` (agency vs
     self-serve message differs). With bypass enabled, quota exhausted → `403`;
     quota available → allowed and `isRoleApprovalBypass` is set on the insert.
5. **Collision check (DB only)** — an existing submission for this candidate email
   + role → `409`, plus a collision analytics event attributed to the recruiter.
6. **Persist** — create `CandidateProfile` (email lowercased) then
   `CandidateSubmission` (status `PENDING_ADMIN_APPROVAL`) in one transaction; if
   the submission insert fails the profile is rolled back (no orphans).
7. **Post-persist syncs (best-effort)** — RC status set to `submitted`; a
   `CandidateStage` row created. Failures here are logged, not fatal.
8. **Résumé move (stubbed S3)** — if `resumeTempKey` was sent, the résumé is moved
   temp → public and the temp copy deleted; the new public URL is written to both
   `CandidateProfile.resumeUpload` and `RecruiterCandidate.resumeUrl`.
9. **Auto-approve cascade (fire-and-forget)** — only if the recruiter has
   auto-approve. Advances status to `PENDING_COMPANY_APPROVAL` and the stage; for
   Kombo-sourced jobs re-checks eligibility + ATS collision and pushes via the
   stubbed Kombo service (blocks on inactive job / duplicate-in-ATS); sends a
   stubbed Slack company intro (action buttons depend on the company's
   `autoApproveAfterAdminApproval`); if that flag is on, cascades to `APPROVED`.
   **Does not block the HTTP response** — use `GET /test/recorders?awaitPending=true`
   to wait for it in tests.
10. **Analytics + response** — success → `api_candidate_submitted`; any thrown
    error → `api_candidate_submission_failed`.

## Stubbed integrations & recorders

S3, Kombo, Slack, and PostHog are stubbed and never hit real services. Every call
is recorded in memory and exposed via `GET /test/recorders`:

```jsonc
{
  "all": [ { "seq": 0, "service": "s3", "event": "move_resume", "payload": {...}, "timestamp": "..." } ],
  "grouped": {
    "s3":        [ { "payload": { "from": "...", "to": "...", "deletedTemp": true } } ],
    "kombo":     [ { "payload": { "jobId": "...", "candidateId": "...", "blockedReason": null, "pushed": true } } ],
    "slack":     [ { "payload": { "companyId": "...", "candidateId": "...", "hasActionButtons": false } } ],
    "analytics": [ { "payload": { "name": "api_candidate_submitted", "attributedTo": "...", "payload": {} } } ]
  }
}
```

`seq` is monotonic — use it to assert ordering and counts. `POST /test/reset`
clears all of this. For cascade effects (Kombo/Slack/status advance), call
`GET /test/recorders?awaitPending=true` so the fire-and-forget work has landed
before you assert.

## Seeded data (identical every reset)

**Users** (send as `x-user-id`):

| id | traits |
| --- | --- |
| `u_recruiter_direct` | recruiter; direct access to `job_active` and `job_exclusive` |
| `u_recruiter_selfserve` | recruiter; self-serve; no direct access |
| `u_recruiter_agency` | recruiter; agency (`agency_1`); no direct access |
| `u_non_recruiter` | not a recruiter |
| `u_recruiter_autoapprove` | recruiter; auto-approve on; direct access to `job_kombo` |
| `u_recruiter_bypass1` | recruiter; bypass enabled; quota **1** |
| `u_recruiter_bypass0` | recruiter; bypass enabled; quota **0** |

**Jobs:**

| id | traits |
| --- | --- |
| `job_active` | active, internal, company `co_autoapprove_false` |
| `job_inactive` | inactive |
| `job_deleted` | soft-deleted |
| `job_exclusive` | active, in an active exclusivity window |
| `job_kombo` | active, Kombo-sourced, company `co_autoapprove_true` |

**Companies:** `co_autoapprove_false` (buttons on Slack), `co_autoapprove_true`
(no buttons, cascades to APPROVED).

**Recruiter candidates:** `rc_with_resume` (résumé on file, no upload needed),
`rc_no_resume` (needs an upload). Both owned by `u_recruiter_direct`.

## Test matrix (expected outcomes)

Reset before each case. "Candidate" below means a fresh email unless noted.

| # | Caller | Job | Notable input | Expect |
| --- | --- | --- | --- | --- |
| 1 | `u_non_recruiter` | `job_active` | — | `403`; analytics `api_candidate_submission_failed` |
| 2 | `u_recruiter_direct` | `job_active` | answer > 5000 chars | `400` |
| 3 | `u_recruiter_direct` | `job_active` | new candidate, no résumé anywhere | `400` résumé required |
| 4 | `u_recruiter_direct` | `job_active` | `candidate.id=rc_with_resume`, no upload | `200`; no S3 move recorded |
| 5 | `u_recruiter_direct` | `job_missing` (any unknown id) | — | `404` |
| 6 | `u_recruiter_direct` | `job_inactive` | — | `404` |
| 7 | `u_recruiter_direct` | `job_deleted` | — | `404` |
| 8 | `u_recruiter_selfserve` | `job_exclusive` | — | `403` exclusive |
| 9 | `u_recruiter_bypass1` | `job_exclusive` | — | `403` exclusive (bypass does **not** override; quota unchanged) |
| 10 | `u_recruiter_direct` | `job_exclusive` | — | `200` (direct access beats exclusivity) |
| 11 | `u_recruiter_selfserve` | `job_active` | — | `403` self-serve message |
| 12 | `u_recruiter_agency` | `job_active` | — | `403` agency message |
| 13 | `u_recruiter_bypass1` | `job_active` | — | `200`; `isRoleApprovalBypass=true`; quota now 0 |
| 14 | `u_recruiter_bypass0` | `job_active` | — | `403` bypass exhausted |
| 15 | `u_recruiter_direct` | `job_active` | submit same email+job twice | 2nd → `409` + collision analytics |
| 16 | `u_recruiter_direct` | `job_active` | with `resumeTempKey` | `200`; S3 move recorded; profile+RC résumé URL updated |
| 17 | `u_recruiter_direct` | `job_active` | screening incl. `INFORMATION` answer | `200`; persisted `filteredAnswers` excludes it |
| 18 | `u_recruiter_autoapprove` | `job_kombo` | `?awaitPending=true` | `200`; response status is `PENDING_ADMIN_APPROVAL` (cascade is async); after flush, Kombo push + Slack intro (no buttons) recorded and `GET /ats/submissions/:id` shows status `APPROVED` |

Use this matrix as a starting point — add edge cases you think matter.
