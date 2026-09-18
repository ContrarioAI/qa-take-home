# Seeded QA Defects

This branch contains the frontend QA surface, a baseline hardening commit, and eleven intentionally seeded defects. The defects are cumulative and are designed to be reproduced through the browser UI using the recruiter/role selectors, candidate fields, repeatable screening answers, concurrent-submit control, and QA inspection controls.

## Commit history

| Commit | Purpose |
|---|---|
| `e6069b9` | Expand the frontend for QA flow coverage |
| `fcf0d31` | Harden pre-existing collision and bypass-quota races |
| `4f33c9b` through `f3efe05` | One commit per seeded defect |
| This commit | Add this story, acceptance-criteria, impact, and fix guide |

The baseline hardening commit is intentional: the original reference implementation allowed two concurrent bypass submissions with one remaining quota and allowed concurrent duplicates. Those behaviors were corrected before the corresponding seeded regressions were added.

## Difficulty notation

Each defect uses `Identify / Recreate / Fix` difficulty:

- **Easy** — a direct UI assertion exposes a localized defect.
- **Medium** — the candidate must correlate UI output with persisted state or recorder data.
- **Hard** — the defect depends on timing, concurrency, or multiple state transitions.

## Canonical user stories and acceptance criteria

### Story 1 — Submit a candidate through the recruiter form

**Requirement:** As an authorized recruiter, I want to submit a candidate to an active role, so that the candidate enters the recruiting workflow.

**Acceptance criteria:**

- The selected recruiter is sent as `x-user-id`.
- The selected role is sent as `jobId`.
- A valid submission returns `200` with candidate, submission, and RecruiterCandidate identifiers.
- The initial submission status is `PENDING_ADMIN_APPROVAL`.

### Story 2 — Resolve an existing candidate by ID

**Requirement:** As a recruiter, I want to submit an existing recruiter candidate by ID, so that stored identity and résumé information are reused.

**Acceptance criteria:**

- A recruiter-owned candidate ID resolves the existing RecruiterCandidate.
- Stored candidate identity is used for the new profile.
- A duplicate RecruiterCandidate is not created.

### Story 3 — Resolve or create a candidate by LinkedIn

**Requirement:** As a recruiter, I want the system to find a candidate by LinkedIn URL or create one when no match exists, so that candidate records remain reusable.

**Acceptance criteria:**

- LinkedIn lookup is scoped to the current recruiter.
- An unmatched LinkedIn URL creates a candidate owned by the submitting recruiter.
- The submission uses the resolved or newly created candidate.

### Story 4 — Enforce candidate and résumé validation

**Requirement:** As a recruiter, I want invalid candidate submissions rejected before processing, so that incomplete data does not enter the workflow.

**Acceptance criteria:**

- Answers over 5,000 characters return `400`.
- A candidate without a résumé on file or a temporary résumé key returns `400`.
- Invalid requests do not create a submission.

### Story 5 — Persist only relevant screening answers

**Requirement:** As a recruiter, I want screening answers stored according to their type, so that informational answers do not pollute persisted screening data.

**Acceptance criteria:**

- `QUESTION` answers are persisted.
- `INFORMATION` answers are excluded from `filteredAnswers`.
- Answer order and content are preserved for retained answers.

### Story 6 — Normalize candidate identity and agency context

**Requirement:** As a recruiter, I want identity and agency context persisted consistently, so that downstream systems receive normalized data.

**Acceptance criteria:**

- Profile email is lowercase.
- Matched candidate identity comes from the RecruiterCandidate record.
- Successful submissions use the submitting recruiter’s `agencyId`.

### Story 7 — Restrict submissions to recruiters

**Requirement:** As the system, I want only recruiters to submit candidates, so that unauthorized users cannot initiate recruiting activity.

**Acceptance criteria:**

- Non-recruiters and unknown users receive `403`.
- No candidate side effects occur for rejected callers.
- `api_candidate_submission_failed` is recorded.

### Story 8 — Reject unavailable roles before access evaluation

**Requirement:** As a recruiter, I want unavailable roles rejected consistently, so that inactive or deleted jobs cannot receive submissions.

**Acceptance criteria:**

- Unknown, inactive, and deleted jobs return `404`.
- Job availability is evaluated before direct access, exclusivity, or bypass.

### Story 9 — Honor direct role access

**Requirement:** As a recruiter with direct access to a role, I want to submit candidates to that role, so that explicitly authorized recruiters are not blocked.

**Acceptance criteria:**

- Direct access is scoped to a recruiter/job pair.
- Direct access allows an active role.
- Direct access allows an active exclusivity period.
- Direct submissions are not marked as bypass submissions.

### Story 10 — Enforce self-serve and agency access

**Requirement:** As the system, I want recruiters without direct access or bypass permission rejected with the correct explanation, so that role access rules are transparent.

**Acceptance criteria:**

- Self-serve recruiters receive the self-serve access message.
- Agency recruiters receive the agency access message.
- Rejected requests do not create submissions.

### Story 11 — Enforce exclusivity before bypass

**Requirement:** As the system, I want active exclusivity periods to take precedence over approval bypasses, so that exclusive roles cannot be accessed through a quota shortcut.

**Acceptance criteria:**

- A recruiter without direct access receives `403` for an exclusive role.
- An available bypass does not override exclusivity.
- Bypass quota remains unchanged after the rejection.
- Direct access still wins over exclusivity.

### Story 12 — Consume role-approval bypass quotas correctly

**Requirement:** As a recruiter with bypass permission, I want to use one available bypass quota to submit to an otherwise inaccessible role, so that approved exceptions can proceed.

**Acceptance criteria:**

- An available quota allows one non-exclusive submission.
- The submission is marked `isRoleApprovalBypass=true`.
- The quota decreases exactly once.
- Concurrent requests cannot consume the same quota twice.

### Story 13 — Prevent duplicate submissions

**Requirement:** As the system, I want to prevent the same candidate from being submitted to the same role more than once, so that duplicate applications are not created.

**Acceptance criteria:**

- A duplicate candidate email plus role returns `409`.
- Concurrent duplicate requests create at most one submission.
- Collision analytics is attributed to the submitting recruiter.

### Story 14 — Persist atomically and create workflow records

**Requirement:** As a recruiter, I want a successful submission to create a consistent set of records, so that the candidate can proceed reliably.

**Acceptance criteria:**

- CandidateProfile and CandidateSubmission are created transactionally.
- The initial status is `PENDING_ADMIN_APPROVAL`.
- `Application Review` is created.
- RecruiterCandidate status changes to `submitted`.
- A profile is not orphaned if submission persistence fails.

### Story 15 — Execute asynchronous auto-approval and integrations

**Requirement:** As an auto-approve recruiter, I want authorized submissions to progress through downstream approval, so that eligible candidates reach the company without manual intervention.

**Acceptance criteria:**

- The initial response remains non-blocking and reports `PENDING_ADMIN_APPROVAL`.
- The cascade advances the status and creates `Company Review`.
- Kombo and Slack side effects are recorded when applicable.
- Slack action buttons match the company’s auto-approval setting.
- `awaitPending=true` waits until scheduled work has settled.

## Seeded defect catalog

### BUG-01 — `INFORMATION` screening answers are persisted

- **Commit:** `4f33c9b`
- **User story:** Story 5 — Persist only relevant screening answers
- **Category:** API/data transformation
- **Difficulty:** Easy / Easy / Easy
- **Introduced at:** `src/ats/submission-creation.service.ts:224-225`
- **Frontend reproduction:** Add one `QUESTION` answer and one `INFORMATION` answer, submit, and inspect the response or submission details.
- **Expected:** `filteredAnswers` contains only the `QUESTION` answer.
- **Actual:** Both answer types are persisted.
- **Impact:** Internal informational content is stored as if it were a screening response.
- **Fix:** Restore filtering before serialization:

  ```ts
  return answers.filter((answer) => answer.type !== 'INFORMATION');
  ```

### BUG-02 — Agency recruiters receive the self-serve error

- **Commit:** `0eb45c0`
- **User story:** Story 10 — Enforce self-serve and agency access
- **Category:** API/error contract
- **Difficulty:** Easy / Easy / Easy
- **Introduced at:** `src/ats/submission-creation.service.ts:106`
- **Frontend reproduction:** Select `u_recruiter_agency`, select `job_active`, and submit a valid candidate.
- **Expected:** `403` with `Your agency does not have access to this role.`
- **Actual:** `403` with `You do not have access to this role.`
- **Impact:** Agency-specific access guidance is lost.
- **Fix:** Select the message based on `user.agencyId`:

  ```ts
  user.agencyId ? MESSAGES.NO_ACCESS_AGENCY : MESSAGES.NO_ACCESS_SELF
  ```

### BUG-03 — Bypass quota overrides role exclusivity

- **Commit:** `ffa4c72`
- **User story:** Story 11 — Enforce exclusivity before bypass
- **Category:** Authorization/business rule
- **Difficulty:** Easy / Easy / Easy
- **Introduced at:** `src/ats/submission-creation.service.ts:95-106`
- **Frontend reproduction:** Select `u_recruiter_bypass1`, select `job_exclusive`, and submit a valid candidate.
- **Expected:** `403` with the exclusivity message and unchanged quota.
- **Actual:** Submission succeeds and uses the bypass quota.
- **Impact:** Exclusive roles can be accessed through a bypass that should not apply.
- **Fix:** Evaluate the exclusivity guard before the bypass branch whenever the recruiter lacks direct access.

### BUG-04 — Slack action buttons are reversed

- **Commit:** `f7cfe2e`
- **User story:** Story 15 — Execute asynchronous auto-approval and integrations
- **Category:** Integration payload
- **Difficulty:** Medium / Easy / Easy
- **Introduced at:** `src/ats/cascade.service.ts:79`
- **Frontend reproduction:** Select `u_recruiter_autoapprove`, select `job_kombo`, submit, wait briefly, then click **Refresh recorders and wait**.
- **Expected:** The auto-approving company receives `hasActionButtons=false`.
- **Actual:** The recorder shows `hasActionButtons=true`.
- **Impact:** Slack presents actions that should not be available for automatically approving companies.
- **Fix:** Set `hasActionButtons` to the inverse of `autoApproveAfterAdminApproval`.

### BUG-05 — Request identity overrides stored candidate identity

- **Commit:** `365b93f`
- **User story:** Story 2 — Resolve an existing candidate by ID; secondary impact on Story 6
- **Category:** Data integrity
- **Difficulty:** Medium / Easy / Easy
- **Introduced at:** `src/ats/submission-creation.service.ts:76-78`
- **Frontend reproduction:** Enter `rc_with_resume` as Candidate ID, change the name/email/LinkedIn fields, and submit.
- **Expected:** The response uses the stored Ada Lovelace candidate identity.
- **Actual:** The response uses the request fields instead.
- **Impact:** A submission snapshot can disagree with the recruiter’s stored candidate record.
- **Fix:** Build `identity` from `rc.name`, `rc.email`, and `rc.linkedin`; only use request fields when creating a new RecruiterCandidate.

### BUG-06 — LinkedIn lookup crosses recruiter boundaries

- **Commit:** `9df48bb`
- **User story:** Story 3 — Resolve or create a candidate by LinkedIn; secondary impact on Story 7
- **Category:** Access/data isolation
- **Difficulty:** Medium / Medium / Medium
- **Introduced at:** `src/ats/submission-creation.service.ts:239-242`
- **Frontend reproduction:** Select `u_recruiter_bypass1`, leave Candidate ID blank, enter the seeded Ada LinkedIn URL, and submit to `job_active`.
- **Expected:** A candidate owned by the submitting recruiter is resolved or created.
- **Actual:** `rc_with_resume`, owned by another recruiter, is returned as `recruiterCandidateId`.
- **Impact:** Candidate records and post-persist updates can cross recruiter ownership boundaries.
- **Fix:** Include `recruiterId` in the LinkedIn lookup predicate.

### BUG-07 — Application Review stage is skipped

- **Commit:** `f7801ca`
- **User story:** Story 14 — Persist atomically and create workflow records
- **Category:** Persistence/workflow
- **Difficulty:** Medium / Easy / Easy
- **Introduced at:** `src/ats/submission-creation.service.ts:172-176`
- **Frontend reproduction:** Submit a valid candidate, then click **Inspect submission**.
- **Expected:** The stages include `Application Review`.
- **Actual:** The submission has no `Application Review` stage.
- **Impact:** Successful submissions do not enter the expected initial workflow stage.
- **Fix:** Restore the `candidateStage.create` call with `stageName: 'Application Review'`.

### BUG-08 — Collision analytics is attributed to the candidate owner

- **Commit:** `6f82478`
- **User story:** Story 13 — Prevent duplicate submissions; secondary impact on Story 7
- **Category:** Analytics/authorization context
- **Difficulty:** Medium / Medium / Easy
- **Introduced at:** `src/ats/submission-creation.service.ts:115`
- **Frontend reproduction:** First submit Ada as `u_recruiter_direct`. Then select `u_recruiter_bypass1`, use Ada’s LinkedIn/email, submit again, and inspect recorders.
- **Expected:** The collision event is attributed to `u_recruiter_bypass1`, the recruiter making the rejected request.
- **Actual:** It is attributed to `u_recruiter_direct`, the RecruiterCandidate owner.
- **Impact:** Collision reporting and recruiter-level metrics identify the wrong actor.
- **Fix:** Pass `user.id` to the collision analytics call.

### BUG-09 — Concurrent requests reuse one bypass quota

- **Commit:** `62c8b6f`
- **User story:** Story 12 — Consume role-approval bypass quotas correctly
- **Category:** Concurrency/access control
- **Difficulty:** Hard / Hard / Medium
- **Introduced at:** `src/ats/submission-creation.service.ts:152-157`
- **Frontend reproduction:** Open two browser tabs, select `u_recruiter_bypass1` and `job_active`, use different candidate emails, and submit both at nearly the same time.
- **Expected:** Only one submission succeeds using the single bypass quota.
- **Actual:** Both submissions can succeed and the quota can be consumed twice.
- **Impact:** Bypass limits can be exceeded under concurrent use.
- **Fix:** Perform the conditional quota decrement inside the same transaction as submission creation and reject when the affected-row count is not one.

### BUG-10 — Concurrent duplicate submissions both succeed

- **Commit:** `39a2fd1`
- **User story:** Story 13 — Prevent duplicate submissions
- **Category:** Concurrency/data integrity
- **Difficulty:** Hard / Hard / Medium
- **Introduced at:** `src/ats/submission-creation.service.ts:110-119`; `prisma/schema.prisma:85-105`
- **Frontend reproduction:** Fill one candidate form and click **Submit twice concurrently**.
- **Expected:** Exactly one request succeeds and the other returns `409`.
- **Actual:** Both requests can return `200` and create separate submissions.
- **Impact:** The same candidate can be submitted multiple times to the same role.
- **Fix:** Keep collision detection and insertion in one transaction and restore a database-level unique constraint on `(jobId, candidateEmail)`.

### BUG-11 — `awaitPending=true` returns before cascade work settles

- **Commit:** `f3efe05`
- **User story:** Story 15 — Execute asynchronous auto-approval and integrations
- **Category:** Async workflow/testability
- **Difficulty:** Hard / Medium / Medium
- **Introduced at:** `src/ats/cascade.service.ts:31-34`
- **Frontend reproduction:** Submit with `u_recruiter_autoapprove` to `job_kombo`, then immediately click **Refresh recorders and wait**.
- **Expected:** The response includes completed Kombo, Slack, status, and stage effects.
- **Actual:** The recorder response can arrive before those effects are visible; a later refresh shows them.
- **Impact:** QA assertions can race the auto-approval cascade and produce false failures.
- **Fix:** Capture pending promises, clear the queue, and await `Promise.allSettled(inflight)` before returning.

## Verification performed

- `npm test` passes the frontend contract tests.
- `npm run build` succeeds.
- `git diff --check` passes.
- Each BUG-01 through BUG-11 was reproduced using browser-shaped request payloads and the frontend-supported controls.
- The database was reset to the deterministic seed after smoke verification.
