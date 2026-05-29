# ClassMind AI — Project Context

## Stack
- Backend: Node.js + Express, SQLite (`better-sqlite3`), JWT auth, bcrypt
- Frontend: Vanilla HTML/CSS/JS, multi-page app in `public/`
- Email: Resend SDK
- AI: Anthropic Claude (direct API)
- Web search: Tavily REST API
- Scheduler: `node-cron`
- Deploy: Railway

## Key Files
- `server.js` — entire backend (routes, middleware, DB schema)
- `public/shared.js` — shared nav, auth helpers, email verification banner
- `public/dashboard.html`, `study.html`, `tasks.html`, `cgpa.html`, `notes.html`, `settings.html`, `feedback.html`, `projects.html`
- `.env` — local secrets (never commit)
- `railway.json` — Railway deploy config

## Monetisation Plan (implement when we have staying customers)

### Basic (Free)
- Manual input and updating of data/resources
- Limited number of AI uses per day/month (caps TBD once we know usage patterns)

### Premium (Paid — one-time or subscription TBD)
- **WhatsApp group plugin**: one-time setup to connect the student's school WhatsApp group
  - App automatically ingests class updates, announcements, and resources from the group
  - Replaces manual weekly update entry entirely
- Higher or unlimited AI usage

> Build the WhatsApp integration feature when we have confirmed paying users to justify the work.

## Dev Notes
- JWT_SECRET must be set in production (`process.exit(1)` guard in server.js)
- AI endpoints (`/api/analyze`, `/api/chat`) require auth — no free API credit burning
- Rate limits: auth routes 10 req/15 min, AI routes 30 req/hr per user
- Weekly course updates cron: Sundays 7 PM UTC (8 PM Nigerian time)
- Projects use Nigerian university format: Title Page, Declaration, Abstract, Ch 1–5, References
