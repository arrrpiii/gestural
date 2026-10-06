# Gestural

A focused practice tool for content creators: pair every script idea with a body
movement, rehearse on camera, and get an AI coach to tell you what to fix in
seconds.

## Ideation

The product is built around a single loop:

1. **Describe your topic** → AI returns a short script with each line paired
   with a gesture, movement, or pitch idea (e.g. *"Lean forward, open palms"*)
2. **Record yourself on camera** (webcam + mic, in-browser)
3. **Get a coach-style review** — strengths, specific drills, and a
   **timestamped timeline** with red markers at every moment that needs work.
   Hover a marker to read the note, click to jump the video.

The script↔gesture pair and the timestamped review are the two pieces of
feedback that make the loop useful — everything else (auth, history,
thumbnails) is plumbing around them.

## Tech stack

- **Frontend** — React 18 + Vite + plain CSS + Framer Motion
- **Backend** — FastAPI + Motor (async MongoDB) + GridFS for video storage
- **Database** — MongoDB (WiredTiger storage engine)
- **AI** — [LangGraph](https://docs.langchain.com/oss/python/langgraph/graph-api) workflows with Gemini 2.5
  Flash for both ideation (text) and video review (multimodal — picture + audio)

## Project structure

```
gestural/
├── backend/                        FastAPI service
│   ├── main.py                     app entry, CORS, router mount
│   ├── database.py                 motor + GridFS singletons
│   ├── ai_service.py               LangGraph workflows (ideation + video review)
│   ├── thumbnail_service.py        ffmpeg-based thumbnail extraction
│   ├── auth/                       bcrypt + JWT, register / login / me
│   │   ├── service.py
│   │   └── routes.py
│   ├── ideation/                   ideation CRUD
│   │   ├── routes.py
│   ├── practice/                   video upload, GridFS, session CRUD
│   │   └── routes.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/                       Vite + React
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx                root, AuthProvider, BrowserRouter
        ├── App.jsx                 routes + ProtectedRoute + page transitions
        ├── api.js                  fetch wrapper, JWT, session endpoints
        ├── context/
        │   └── AuthContext.jsx     login / register / logout / hydrate
        ├── components/
        │   ├── Nav.jsx
        │   ├── Footer.jsx
        │   ├── FloatingPlus.jsx    fixed centre-bottom "+" with pulse
        │   ├── IdeationItem.jsx    text → arrow → gesture cards
        │   └── SessionCard.jsx     thumbnail + name + date
        ├── pages/
        │   ├── Home.jsx            public + signed-in variants
        │   ├── About.jsx
        │   ├── WhyUs.jsx
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx       ideation prompt + sessions grid
        │   ├── Practice.jsx        webcam + recorder + reference column
        │   ├── History.jsx         video + timestamped timeline + actions
        │   └── IdeationList.jsx    card grid → modal detail
        └── styles/
            ├── theme.css           CSS variables, neumorphism palette
            ├── base.css            reset, layout, buttons, inputs
            └── pages.css           page-specific layouts
```
## Local setup

Use Python 3.12, Node.js 24 LTS (minimum 22.12), and MongoDB 8.

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env
```

Set `JWT_SECRET` in `backend/.env` to a random secret of at least 32 bytes
(generate one with `python3 -c 'import secrets; print(secrets.token_hex(32))'`).
The server intentionally refuses to start with a missing or example secret.
Set `GOOGLE_API_KEY` for Gemini; `GEMINI_MODEL` optionally overrides
`gemini-2.5-flash`. Never commit credentials.

Start MongoDB, then run the API from the repository root:

```sh
.venv/bin/uvicorn main:app --app-dir backend --reload
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Register, create an album on the dashboard,
then open Practice. Camera capture requires localhost or HTTPS. Recordings
are limited to 120 seconds and 50 MiB. ffmpeg is provided by imageio-ffmpeg;
if unavailable on your platform, install ffmpeg or set `IMAGEIO_FFMPEG_EXE`.

## Verification

```sh
.venv/bin/pytest -q backend/tests
npm --prefix frontend test
npm --prefix frontend run build
```

To include real MongoDB integration coverage, set `TEST_MONGO_URL` to a local
test server when running pytest. The test creates a uniquely named database
and removes only that database afterward. Gemini and thumbnail generation are
stubbed in the API integration test; it does not make paid AI calls.

```sh
TEST_MONGO_URL=mongodb://localhost:27017 .venv/bin/pytest -q backend/tests
.venv/bin/pip-audit -r backend/requirements.txt
cd frontend && npm audit
```

GitHub Actions runs both suites, the production build, and dependency audits.

## Deployment configuration

The supplied Vercel rewrite forwards `/api` to `gestural.onrender.com`.
Change that destination for a different backend, or set `VITE_API_BASE_URL`
at frontend build time (for example `https://api.example.com`). Set
`CORS_ORIGIN` on the API to your frontend origin when using separate origins.
Serve production traffic over HTTPS and configure your reverse proxy with
an upload-body limit near 51 MiB (50 MiB video plus multipart overhead),
a request timeout sufficient for AI review, and rate limits for authentication
and AI endpoints.

Startup creates a unique email index. Existing duplicate email records need
manual reconciliation before deploying this version; no account is silently
deleted. Existing sessions are preserved, including legacy sessions without
an album. Those legacy sessions remain available via the sessions API and
should be assigned albums in a deliberate migration to show in the dashboard.
If you previously used the default JWT secret, rotate it; existing logins
will need to authenticate again.

See [AUDIT.md](AUDIT.md) for the fixes and verification limits.


## AI workflows

`backend/ai_service.py` uses two compiled LangGraph graphs:

- Ideation: generate JSON with Gemini → validate script/gesture pairs → retry
  once if no usable items were returned → finish.
- Video review: prepare the coaching prompt → upload the original video with
  Google's Files API, wait for processing, generate feedback, and delete the
  temporary Google upload in a `finally` block. Reviews use a validated JSON
  schema with required timestamped notes, then render to the existing markdown
  format. Incomplete output or transient generation errors receive one automatic
  retry using the same upload.

Gemini calls use the official `google-genai` SDK inside graph nodes. LangGraph
controls workflow execution; Gemini remains the model provider. No LangGraph
server, LangSmith account, extra API key, or database migration is required.
`GOOGLE_API_KEY` and `GEMINI_MODEL` retain their existing meanings. Graphs have
request-local state and no checkpointer; videos remain stored in MongoDB GridFS.
Blocking SDK work runs in worker threads. HTTP calls and file-processing waits
are bounded. Live model output requires testing with a configured Gemini key.

Video upload/processing follows the [Gemini video documentation](https://ai.google.dev/gemini-api/docs/video-understanding).
