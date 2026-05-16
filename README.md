# Lead Finder CR (AK Studio / Arquinautas CR)

Real lead discovery app focused on **individual person-intent leads** in Costa Rica (build/remodel/buy land + build).

## Features
- Vite + React frontend, Vercel serverless backend.
- Public search pipeline using SerpAPI (`SEARCH_API_KEY`).
- Strict intent validation from source evidence text.
- Hard rejection of provider/showcase/architecture-content pages.
- 6-month freshness filter by default (`maxAgeDays=180`).
- Filters, CSV export, source verification links, and outreach copy button.
- Debug counters for filtered provider and irrelevant pages.

## Required environment variables
- `APP_PASSWORD`
- `SEARCH_API_KEY`

## Optional environment variables
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

## Local setup
```bash
npm install
cp .env.example .env.local
npm run dev
