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
- **AI** — [`agno`](https://github.com/agno-agi/agno) library with Gemini 2.5
  Flash for both ideation (text) and video review (multimodal — picture + audio)

## Project structure

```
gesture/
├── backend/                        FastAPI service
│   ├── main.py                     app entry, CORS, router mount
│   ├── database.py                 motor + GridFS singletons
│   ├── agno_service.py             agno wrapper (ideation + video review)
│   ├── thumbnail_service.py        ffmpeg-based thumbnail extraction
│   ├── auth/                       bcrypt + JWT, register / login / me
│   │   ├── service.py
│   │   └── routes.py
│   ├── ideation/                   ideation CRUD
│   │   ├── routes.py
│   │   └── service.py
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