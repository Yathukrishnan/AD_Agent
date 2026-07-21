# Gulf Ad Intelligence

Competitor ad-intelligence for the Arab/GCC region. You enter **your product**; the
app discovers your competitors, gathers their ads from **Facebook, Instagram, X, Google and
YouTube**, understands them (Arabic + English), and shows how they advertise.

> **It never generates ads.** It only gathers and analyses competitors' existing ads.

It runs **today on mock data** — plug in the APIs/DB/model when you have them.

```
gulf-ad-intelligence/
├── backend/     FastAPI (Python) — API, competitor discovery, ad data, model calls
└── frontend/    React + Vite (TypeScript) — animated landing + dashboard
```

## 1. Backend (Python / FastAPI)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health:   http://localhost:8000/api/health  → shows `data: mock` until keys are set

## 2. Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173  (landing page → "Launch app" → dashboard)
- `/api` is proxied to the backend on :8000 (see `vite.config.ts`)

## 3. Plugging in the real services (later)

Copy `backend/.env.example` → `backend/.env` and fill in what you have:

| Variable | What it enables |
|---|---|
| `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` | The flash model for competitor discovery & ad understanding (default `google/gemini-2.5-flash`). When set, `/api/health` flips to `data: live`. |
| `DATABASE_URL` + `DATABASE_TOKEN` | The ad store you'll provide |
| `META_ADLIB_TOKEN`, `LINKEDIN_API_TOKEN`, `GOOGLE_ADS_TOKEN`, `YOUTUBE_API_TOKEN` | The platform data sources |

**Where to wire each:**
- Model calls → `backend/app/services/openrouter.py` (already implemented; used by discovery + analysis)
- Platform gathering → replace the mock in `backend/app/api.py` `list_ads()` with real queries
- Persistence → `backend/app/mock.py` is the seam; swap for DB reads using `DATABASE_URL`

Every endpoint already falls back to mock data on any missing key or error, so the
UI keeps working while you connect things one at a time.

## Design
Dark theme, lime accent (`#A3E635`), Inter + JetBrains Mono, animated connection-node
hero — per the "Integration Platform" design system. Tokens live in
`frontend/src/styles/theme.css`.
