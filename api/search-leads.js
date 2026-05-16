const RATE_LIMIT = new Map();
const MAX_REQUESTS_PER_HOUR = 20;
const MAX_RESULTS = 30;
const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_AGE_DAYS = 180;

const DEFAULT_QUERIES = [
  "looking to build a house in Costa Rica",
  "architect Costa Rica custom home",
  "buy land build home Costa Rica",
  "Costa Rica vacation rental development",
  "build Airbnb Costa Rica",
  "retiring in Costa Rica build home",
  "Guanacaste architect build house",
  "Tamarindo build villa",
  "Nosara custom home",
  "Uvita build rental property",
  "Costa Rica construction permit architect",
];

const ALLOWED_SOURCE_CATEGORIES = [
  "search",
  "real-estate",
  "directories",
  "expat-forums",
  "investment-discussions",
];

const LOCATION_KEYWORDS = [
  "guanacaste","tamarindo","nosara","uvita","dominical","manuel antonio","san jose","san josé","atenas","escazu","escazú","santa ana","limon","limón","caribbean"
];

const INTENT_KEYWORDS = [
  "looking to build","build a house","custom home","architect","construction permit","buy land","relocation","retiring","airbnb","vacation rental","develop property","remodel","renovation","invest"
];

const SAFE_HEADERS = {
  "User-Agent": "AKStudioLeadFinder/1.0 (+https://akstudio.example; respectful crawling)",
  "Accept": "text/html,application/xhtml+xml",
};

function getIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (Array.isArray(xff)) return xff[0];
  return (xff || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function normalize(s = "") {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractEmails(text) {
  return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.trim()))];
}

function extractPhones(text) {
  const candidates = text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g) || [];
  const cleaned = candidates
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.replace(/\D/g, "").length >= 8 && p.replace(/\D/g, "").length <= 15);
  return [...new Set(cleaned)];
}

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLocation(text) {
  const lc = normalize(text);
  const found = LOCATION_KEYWORDS.find((k) => lc.includes(k));
  return found ? found.replace(/\b\w/g, (m) => m.toUpperCase()) : "Costa Rica";
}

function scoreLead(text, hasEmail, hasPhone, hasContactUrl, location) {
  const lc = normalize(text);
  let score = 2;
  let intentHits = 0;
  for (const kw of INTENT_KEYWORDS) if (lc.includes(kw)) intentHits++;
  score += Math.min(4, intentHits);
  if (location && location !== "Costa Rica") score += 2;
  if (hasEmail || hasPhone || hasContactUrl) score += 2;
  if (intentHits <= 1) score -= 1;
  return Math.min(10, Math.max(1, score));
}

function getLeadType(text) {
  const lc = normalize(text);
  if (lc.includes("airbnb") || lc.includes("vacation rental") || lc.includes("invest")) return "Investor/Airbnb";
  if (lc.includes("retiring") || lc.includes("relocation") || lc.includes("expat")) return "Expat relocation";
  if (lc.includes("land") || lc.includes("buy land")) return "Land buyer";
  if (lc.includes("developer") || lc.includes("development")) return "Developer";
  if (lc.includes("remodel") || lc.includes("renovation")) return "Renovation/remodel";
  return "Local homeowner";
}

function parseDateCandidate(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractPublishedDateFromHtml(html = "") {
  const patterns = [
    /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /name=["']pubdate["'][^>]*content=["']([^"']+)["']/i,
    /name=["']date["'][^>]*content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const d = parseDateCandidate(m[1]);
      if (d) return { date: d, source: "meta_tag" };
    }
  }
  return { date: null, source: "unknown" };
}

function isOlderThanDays(date, maxAgeDays) {
  if (!date) return false;
  const ageMs = Date.now() - date.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function searchWeb(query, num = 5) {
  const key = process.env.SEARCH_API_KEY;
  if (!key) throw new Error("NO_SEARCH_API_KEY");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(num));
  url.searchParams.set("api_key", key);
  url.searchParams.set("hl", "en");

  const res = await fetchWithTimeout(url.toString(), { headers: SAFE_HEADERS });
  if (!res.ok) throw new Error(`SEARCH_PROVIDER_FAILURE_${res.status}`);
  const data = await res.json();
  return (data.organic_results || []).map((r) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
    source_platform: "Google/SerpAPI",
    published_at: r.date || "",
  }));
}

function buildOutreach(lead) {
  return `Hi ${lead.name || "there"}, I saw your public post/page about ${lead.need}. AK Studio / Arquinautas CR helps clients in ${lead.location || "Costa Rica"} design and build high-value projects. If useful, we can share a short roadmap for permits, design and budgeting.`;
}

function deduplicate(leads) {
  const seen = new Set();
  return leads.filter((l) => {
    const keys = [l.email, l.phone, l.website, l.source_url].filter(Boolean).map((x) => normalize(x));
    const key = keys[0] || normalize(l.evidence_text).slice(0, 120);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.APP_PASSWORD) return res.status(500).json({ error: "APP_PASSWORD is not configured" });
  if (req.body?.password !== process.env.APP_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const ip = getIp(req);
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const timestamps = (RATE_LIMIT.get(ip) || []).filter((t) => t > windowStart);
  if (timestamps.length >= MAX_REQUESTS_PER_HOUR) return res.status(429).json({ error: "Rate limit reached. Try again in 1 hour." });
  timestamps.push(now);
  RATE_LIMIT.set(ip, timestamps);

  const { queries, sourceCategories = ALLOWED_SOURCE_CATEGORIES, maxLeads = 20, maxAgeDays = DEFAULT_MAX_AGE_DAYS } = req.body || {};
  const selectedQueries = (Array.isArray(queries) && queries.length ? queries : DEFAULT_QUERIES).slice(0, 6);
  const safeMaxAgeDays = Math.max(1, Math.min(3650, Number(maxAgeDays) || DEFAULT_MAX_AGE_DAYS));

  try {
    if (!process.env.SEARCH_API_KEY) return res.status(500).json({ error: "No SEARCH_API_KEY configured" });

    const rawResults = [];
    for (const q of selectedQueries) {
      await new Promise((r) => setTimeout(r, 350));
      const results = await searchWeb(q, 5);
      for (const item of results) rawResults.push({ query: q, ...item });
    }

    const leads = [];
    for (const result of rawResults.slice(0, MAX_RESULTS)) {
      if (!result.link?.startsWith("http")) continue;

      let pageText = `${result.title} ${result.snippet}`;
      let htmlForDate = "";
      let publishedAtDate = parseDateCandidate(result.published_at);
      let publishedAtSource = publishedAtDate ? "search_result" : "unknown";
      try {
        await new Promise((r) => setTimeout(r, 250));
        const pageRes = await fetchWithTimeout(result.link, { headers: SAFE_HEADERS });
        if (pageRes.ok && pageRes.headers.get("content-type")?.includes("text/html")) {
          const html = await pageRes.text();
          htmlForDate = html;
          pageText = stripHtml(html).slice(0, 12000);
        }
      } catch {}

      if (!publishedAtDate && htmlForDate) {
        const extracted = extractPublishedDateFromHtml(htmlForDate);
        if (extracted.date) {
          publishedAtDate = extracted.date;
          publishedAtSource = extracted.source;
        }
      }

      if (publishedAtDate && isOlderThanDays(publishedAtDate, safeMaxAgeDays)) continue;

      const emails = extractEmails(pageText);
      const phones = extractPhones(pageText);
      const contactUrlMatch = pageText.match(/https?:\/\/[^\s"'<>]+contact[^\s"'<>]*/i);
      const website = new URL(result.link).origin;
      const location = detectLocation(`${result.title} ${result.snippet} ${pageText.slice(0, 2000)}`);
      const relevance = scoreLead(pageText, !!emails[0], !!phones[0], !!contactUrlMatch, location);
      if (relevance < 3) continue;

      const evidence = `${result.snippet || pageText.slice(0, 200)} | Query: ${result.query}`.slice(0, 320);
      const lead = {
        name: "",
        company_or_profile: result.title.slice(0, 120),
        lead_type: getLeadType(`${result.query} ${result.title} ${result.snippet}`),
        need: result.query,
        location,
        country_or_origin: "",
        email: emails[0] || "",
        phone: phones[0] || "",
        website,
        social_url: "",
        contact_url: contactUrlMatch ? contactUrlMatch[0] : "",
        source_platform: result.source_platform,
        source_url: result.link,
        evidence_text: evidence,
        relevance,
        confidence: relevance >= 8 ? "high" : relevance >= 5 ? "medium" : "low",
        published_at: publishedAtDate ? publishedAtDate.toISOString() : "",
        published_at_source: publishedAtSource,
        recommended_outreach: "",
      };

      if (lead.email && !pageText.includes(lead.email)) lead.email = "";
      if (lead.phone && !normalize(pageText).includes(normalize(lead.phone))) lead.phone = "";

      lead.recommended_outreach = buildOutreach(lead);
      leads.push(lead);
    }

    const filtered = deduplicate(leads).slice(0, Math.max(1, Math.min(maxLeads, 50)));
    if (!filtered.length) return res.status(200).json({ leads: [], warning: "No leads found" });

    return res.status(200).json({ leads: filtered });
  } catch (error) {
    if (String(error.message || "").includes("NO_SEARCH_API_KEY")) {
      return res.status(500).json({ error: "No API key configured for search provider" });
    }
    if (String(error.message || "").includes("SEARCH_PROVIDER_FAILURE")) {
      return res.status(502).json({ error: "Search provider failure" });
    }
    return res.status(500).json({ error: error.message || "Unknown server error" });
  }
}
