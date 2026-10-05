# Project audit — 2026-10-05

Reviewed backend authentication, resource ownership, startup behavior, GridFS
storage, AI wrappers, frontend recording and review flows, dependency advisories,
and build/deployment configuration.

## Fixed

- Removed destructive startup deletion of pre-album sessions.
- Removed the known JWT fallback; load backend environment configuration before
  auth settings, require a strong configured secret, require token claims, and
  reject invalid MongoDB subjects with 401 instead of a server error.
- Added unique email indexing and duplicate-key handling for concurrent signup.
  Moved password hashing/verification off the event loop and reject passwords
  exceeding bcrypt's 72-byte limit instead of silently truncating them.
- Scoped embedded ideations and re-review context to the session owner, and reject
  invalid or unowned ideation references at upload time.
- Bound upload reads to the size limit, reject empty videos, clean up stored videos
  after failed session inserts, and handle missing video files with 404.
- Preserve old reviews on AI re-review failure and keep upstream error details out
  of API responses. Give concurrent AI requests separate agent instances.
- Preserve storage references on deletion errors so cleanup can be retried.
  Mark albums during deletion and clean up recordings that finish uploading after
  their album is removed.
- Return 404 for an empty update against a missing session.
- Preserve the actual MediaRecorder MIME type and filename, stop devices on
  unmount without uploading abandoned takes, handle unsupported browsers and
  recorder errors, and enforce a recording timer without React updater side effects.
- Display validation, video, rename and re-review errors; preserve unstructured
  feedback; cancel stale loads; handle unknown WebM duration; prevent rename
  responses from overwriting edits made while saving.
- Added configurable frontend API origin, database indexes, setup instructions,
  regression tests, and GitHub Actions checks.
- Updated vulnerable Python and JavaScript dependencies. Frontend upgrades follow
  the [Vite migration guide](https://vite.dev/guide/migration).

## Verification

- Backend regression suite and real MongoDB API lifecycle test. The integration
  test creates a temporary database and checks signup/login, ownership, GridFS
  round trips, renaming, re-review and cascade deletion.
- Frontend component tests cover recording container metadata, teardown, timed
  stopping, review/rename failures and API validation handling.
- Production frontend build, Python dependency compatibility check, npm audit,
  and pip-audit of the installed environment.
- Browser smoke check: homepage and login render and navigate without captured
  console warnings or errors.
- Synthetic MP4 thumbnail extraction through the installed ffmpeg binary, plus
  AI-wrapper retry and temporary-file cleanup tests.

## Limits and deployment considerations

Live Gemini calls and physical camera/microphone capture were not exercised.
AI responses are stubbed in API tests. Automated MediaRecorder coverage does not
replace device testing across Safari, Firefox and Chrome. Deployment itself was
not performed.

Use the secure JWT and Node runtime settings described in README before deploying.
Existing duplicate emails require manual reconciliation; legacy sessions without
albums are preserved but are not automatically assigned to dashboard albums.

Public deployment still needs ingress rate limits and an upload request-body limit;
the application checks the video size after multipart parsing. Collection list
endpoints remain unpaginated and album counts use per-album queries, so large
accounts need a separate pagination/performance change. GridFS and session writes
are not a distributed transaction: process termination or database failure during
compensating cleanup can still require orphan reconciliation. Token storage remains
in localStorage; protecting against XSS and configuring an appropriate CSP remain
deployment responsibilities. Placeholder pricing is still explicitly marked as
such; no billing or subscription enforcement exists.
