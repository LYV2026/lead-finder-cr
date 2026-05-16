# Lead Finder CR (AK Studio / Arquinautas CR)

Real lead discovery app focused on **individual person-intent leads** for Costa Rica architecture/remodel/build projects.

## What this app does
- Uses public web search (SerpAPI via `SEARCH_API_KEY`) to discover relevant public pages/posts.
- Prioritizes people publicly asking for help with building/remodeling/architect needs in Costa Rica.
- Excludes provider/company/service pages by default.
- Extracts public evidence and contact details only when publicly visible.
- Never invents names/emails/phones.
- Includes freshness filtering (default: 180 days), relevance scoring, deduplication, and provider-filter counters.

## Core lead fields
Includes:
- `lead_type`
- `intent_type` (`Person Intent Lead | Company/Provider | Unclear`)
- `source_url`
- `evidence_text`
- `published_at`, `published_at_source`
- `relevance`, `confidence`
- `recommended_outreach`
- plus contact/public profile fields.

## Environment variables
Required:
- `APP_PASSWORD`
- `SEARCH_API_KEY`

Optional:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

## Local development
```bash
npm install
cp .env.example .env.local
npm run dev
