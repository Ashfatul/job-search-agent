# JobPilot AI — Autonomous Job Search & Application Bot ($0/Month Stack)

An end-to-end autonomous job search, matching, outreach, and tracking platform powered by **Vercel AI SDK (`ToolLoopAgent`)**, **Supabase**, a **24/7 VPS Worker**, **Gmail/Brevo**, **Telegram**, and a **Chrome Extension**.

## Architecture

- **`packages/shared`**: Vercel AI SDK free-tier LLM provider chain (Google AI Studio Gemini Flash → Groq → OpenRouter `:free`), structured resume parsing, job scoring, human-like outreach + follow-up drafting, URL normalization, and email extraction.
- **`apps/web`**: Next.js App Router dashboard with Supabase Auth + RLS authorization, Command Center KPIs, **"Somewhat Search"** already-applied checker (`pg_trgm` + `pgvector`), Application Tracker, Resume uploader (PDF/text), and Settings.
- **`apps/worker`**: Scheduled VPS worker (`node-cron`) running multiple times per day even when you are offline. Scrapes free job APIs/RSS/ATS boards (RemoteOK, Remotive, Arbeitnow, The Muse, HN Who's Hiring, Greenhouse, Lever, Ashby, Adzuna) + `ToolLoopAgent` web explorer, sends human-like initial & follow-up emails via Gmail, keeps Supabase active, and sends **Telegram** + **Summary Email** reports.
- **`apps/extension`**: Manifest V3 Chrome Extension that automatically checks any job tab against your applied history via "Somewhat Search", saves jobs, marks applied, and drafts human-like apply emails.
- **`supabase/migrations/001_initial_schema.sql`**: Full PostgreSQL schema with Row Level Security (RLS), `pg_trgm`, `pgvector`, and `search_applied_jobs` RPC.

---

## $0/Month Setup Guide

### 1. Supabase Setup (Free Tier)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and execute the entire contents of `supabase/migrations/001_initial_schema.sql`.
3. Copy your **Project URL**, **Anon Key**, and **Service Role Key** into `.env`.

### 2. Free LLM Keys (Configure at least one)
- **Google AI Studio (Recommended primary + embeddings)**: Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → `GOOGLE_GENERATIVE_AI_API_KEY`.
- **Groq (Free fallback)**: [console.groq.com/keys](https://console.groq.com/keys) → `GROQ_API_KEY`.
- **OpenRouter (Free `:free` fallback)**: [openrouter.ai/keys](https://openrouter.ai/keys) → `OPENROUTER_API_KEY`.

### 3. Gmail & Telegram Setup (100% Free)
- **Gmail App Password**: Enable 2FA on your Google account → generate an App Password → set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env`.
- **Telegram Bot**: Message `@BotFather` on Telegram → `/newbot` → copy token to `TELEGRAM_BOT_TOKEN`. Message `@userinfobot` to get your numeric `TELEGRAM_CHAT_ID`.

### 4. Local Development
```bash
cp .env.example .env
# Fill in your keys in .env, and copy NEXT_PUBLIC_* vars to apps/web/.env.local
npm install
npm run build
npm run test
npm run dev:web
# In another terminal:
npm run dev:worker
```

> Start with `DRY_RUN=true` in `.env` so you can verify job discovery, AI drafts, and Telegram summaries before sending real emails. Once ready, set `DRY_RUN=false` and `NEXT_PUBLIC_ALLOW_SIGNUP=false` (after creating your account).

### 5. Load Chrome Extension
1. Run `npm --workspace=apps/extension run build`.
2. Open `chrome://extensions` in Chrome, enable **Developer mode**, click **Load unpacked**, and select `apps/extension/dist`.
3. Open the extension popup → **Settings** → enter your Web App URL, Supabase URL, Supabase Anon Key, and sign in.

### 6. Deploy on Your Small VPS (24/7 Offline Execution)
```bash
# Worker only (pair with Vercel Free for apps/web):
docker compose up -d --build worker

# Or run BOTH web + worker on your VPS:
docker compose --profile full-vps up -d --build
```
Alternatively, with PM2:
```bash
npm install && npm run build
pm2 start ecosystem.config.cjs
pm2 save
```
