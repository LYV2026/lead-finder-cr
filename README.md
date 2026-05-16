# Lead Finder CR (AK Studio / Arquinautas CR)

Real lead discovery app for Costa Rica architecture, remodeling, relocation and investment intent.

## Features
- Vite + React frontend, Vercel serverless backend.
- `/api/search-leads` uses public web search results (SerpAPI via `SEARCH_API_KEY`).
- Pulls public pages/snippets, extracts visible evidence and contact details only when found in source text.
- Never invents contacts: if not verifiable from source text, contact fields stay blank.
- Rate limiting, deduplication, relevance scoring, and 6-month freshness filter (180 days default).
- UI filters: location, lead type, minimum relevance, contact status, max age days.
- CSV export includes full lead schema (including publication metadata).
- Lead cards include source verification and copyable outreach message.

## Environment variables
- `APP_PASSWORD` (required)
- `SEARCH_API_KEY` (required)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (optional)

## Local development
```bash
npm install
cp .env.example .env.local
npm run dev
