const RATE_LIMIT = new Map();
const MAX_REQUESTS_PER_HOUR = 20;
const MAX_RESULTS = 30;
const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_AGE_DAYS = 180;

const DEFAULT_QUERIES = [
  'site:reddit.com "looking for architect" "Costa Rica"',
  'site:reddit.com "need architect" "Costa Rica"',
  '"planning to build" "Costa Rica" "architect" forum',
  '"buy land" "Costa Rica" "build house" forum',
  '"retiring in Costa Rica" "build home"',
  '"build Airbnb" "Costa Rica" "architect"',
  '"recommend architect" "Costa Rica"',
  '"moving to Costa Rica" "build a house"',
  '"need help building" "Costa Rica"',
  '"construction permits" "Costa Rica" "architect" forum',
];

const LOCATION_KEYWORDS = [
  "guanacaste","tamarindo","nosara","uvita","dominical","manuel antonio","san jose","san josé","atenas","escazu","escazú","santa ana","limon","limón","caribbean","costa rica"
];
const PERSON_INTENT_PHRASES = [
  "looking for an architect","looking for architect","need an architect","need architect","want to build","planning to build","buying land and building","retiring in costa rica and want to build","building a vacation rental","build an airbnb in costa rica","recommend an architect","need help with permits","need help with design","need help with construction","moving to costa rica build",
];
const PROVIDER_EXCLUSION_PHRASES = [
  "architecture firm","construction company","design studio","real estate agency","brokerage","investment firm","our services","about us","portfolio","team","contact us","projects","listings","architect directory"
];
const SOURCE_PRIORITIES = ["reddit.com", "forum", "boards", "expat", "quora", "tripadvisor"];

const SAFE_HEADERS = {
  "User-Agent": "AKStudioLeadFinder/1.0 (+https://akstudio.example; respectful crawling)",
  "Accept": "text/html,application/xhtml+xml",
};

const normalize = (s = "") => s.toLowerCase().replace(/\s+/g, " ").trim();
const getIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (Array.isArray(xff)) return xff[0];
  return (xff || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
};

function extractEmails(text) {
  return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.trim()))];
}
function extractPhones(text) {
  const candidates = text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g) || [];
  return [...new Set(candidates.map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => {
    const len = p.replace(/\D/g, "").length;
    return len >= 8 && len <= 15;
  }))];
}
function stripHtml(html = "") {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function detectLocation(text) {
  const lc = normalize(text);
  const found = LOCATION_KEYWORDS.find((k) => lc.includes(k));
  return found ? found.replace(/\b\w/g, (m) => m.toUpperCase()) : "Costa Rica";
}
function getLeadType(text) {
  const lc = normalize(text);
  if (lc.includes("airbnb") || lc.includes("vacation rental") || lc.includes("invest")) return "Investor/Airbnb";
  if (lc.includes("retiring") || lc.includes("relocation") || lc.includes("expat") || lc.includes("moving")) return "Expat relocation";
  if (lc.includes("land") || lc.includes("buy land")) return "Land buyer";
  if (lc.includes("remodel") || lc.includes("renovation")) return "Renovation/remodel";
  if (lc.includes("developer")) return "Developer";
  if (lc.includes("homeowner") || lc.includes("house")) return "Local homeowner";
  return "Unknown";
}
function classifyIntent(text, url) {
  const lc = normalize(`${text} ${url}`);
  const intentHits = PERSON_INTENT_PHRASES.filter((p) => lc.includes(p)).length;
  const providerHits = PROVIDER_EXCLUSION_PHRASES.filter((p) => lc.includes(p)).length;
  if (providerHits > 0 && intentHits === 0) return "Company/Provider";
  if (intentHits > 0) return "Person Intent Lead";
  return "Unclear";
}
function scoreLead({ text, location, hasContact, intentType, sourceUrl }) {
  const lc = normalize(text);
  let score = 1;
  const intentHits = PERSON_INTENT_PHRASES.filter((p) => lc.includes(p)).length;
  score += Math.min(5, intentHits * 2);
  if (location && location !== "Costa Rica") score += 2;
  if (hasContact) score += 1;
  if (SOURCE_PRIORITIES.some((p) => sourceUrl.toLowerCase().includes(p))) score += 1;
  if (intentType === "Company/Provider") score = 1;
  if (intentType === "Unclear") score = Math.min(score, 4);
  return Math.max(1, Math.min(10, score));
}

function parseDateCandidate(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function extractPublishedDateFromHtml(html = "") {
  const patterns = [/property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,/name=["']pubdate["'][^>]*content=["']([^"']+)["']/i,/"datePublished"\s*:\s*"([^"]+)"/i,/datetime=["']([^"']+)["']/i];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const d = parseDateCandidate(m[1]);
      if (d) return { date: d, source: "meta_tag" };
    }
  }
  return { date: null, source: "unknown" };
}
const isOlderThanDays = (date, days) => date ? (Date.now() - date.getTime()) > days * 86400000 : false;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
async function searchWeb(query, num = 5) {
  const key = process.env.SEARCH_API_KEY;
  if (!key) throw new Error("NO_SEARCH_API_KEY");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(num));
  url.searchParams.set("api_key", key);
  const res = await fetchWithTimeout(url.toString(), { headers: SAFE_HEADERS });
  if (!res.ok) throw new Error(`SEARCH_PROVIDER_FAILURE_${res.status}`);
  const data = await res.json();
  return (data.organic_results || []).map((r) => ({ title: r.title || "", snippet: r.snippet || "", link: r.link || "", source_platform: "Google/SerpAPI", published_at: r.date || "" }));
}

function deduplicate(leads) {
  const seen = new Set();
  return leads.filter((l) => {
    const key = normalize(l.source_url || l.email || l.phone || l.website || l.evidence_text.slice(0, 120));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function buildOutreach(lead) {
  return `Hi ${lead.name || "there"}, I saw your public post about ${lead.need}. AK Studio / Arquinautas CR supports people planning projects in Costa Rica, from concept and permits to design and build. If useful, we can share a short roadmap tailored to your project.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.APP_PASSWORD) return res.status(500).json({ error: "APP_PASSWORD is not configured" });
  if (req.body?.password !== process.env.APP_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const ip = getIp(req);
  const now = Date.now();
  const windowStart = now - 3600000;
  const timestamps = (RATE_LIMIT.get(ip) || []).filter((t) => t > windowStart);
  if (timestamps.length >= MAX_REQUESTS_PER_HOUR) return res.status(429).json({ error: "Rate limit reached. Try again in 1 hour." });
  timestamps.push(now);
  RATE_LIMIT.set(ip, timestamps);

  const { queries, maxLeads = 20, maxAgeDays = DEFAULT_MAX_AGE_DAYS, onlyPersonIntent = true } = req.body || {};
  const selectedQueries = (Array.isArray(queries) && queries.length ? queries : DEFAULT_QUERIES).slice(0, 8);
  const safeMaxAgeDays = Math.max(1, Math.min(3650, Number(maxAgeDays) || DEFAULT_MAX_AGE_DAYS));

  try {
    if (!process.env.SEARCH_API_KEY) return res.status(500).json({ error: "No SEARCH_API_KEY configured" });
    const rawResults = [];
    for (const q of selectedQueries) {
      await new Promise((r) => setTimeout(r, 300));
      for (const item of await searchWeb(q, 5)) rawResults.push({ query: q, ...item });
    }

    const leads = [];
    let filteredProviderCount = 0;
    for (const result of rawResults.slice(0, MAX_RESULTS)) {
      if (!result.link?.startsWith("http")) continue;
      let pageText = `${result.title} ${result.snippet}`;
      let htmlForDate = "";
      let publishedAtDate = parseDateCandidate(result.published_at);
      let publishedAtSource = publishedAtDate ? "search_result" : "unknown";
      try {
        await new Promise((r) => setTimeout(r, 220));
        const pageRes = await fetchWithTimeout(result.link, { headers: SAFE_HEADERS });
        if (pageRes.ok && pageRes.headers.get("content-type")?.includes("text/html")) {
          htmlForDate = await pageRes.text();
          pageText = stripHtml(htmlForDate).slice(0, 12000);
        }
      } catch {}

      if (!publishedAtDate && htmlForDate) {
        const ex = extractPublishedDateFromHtml(htmlForDate);
        if (ex.date) { publishedAtDate = ex.date; publishedAtSource = ex.source; }
      }
      if (publishedAtDate && isOlderThanDays(publishedAtDate, safeMaxAgeDays)) continue;

      const combined = `${result.title} ${result.snippet} ${pageText}`;
      const intentType = classifyIntent(combined, result.link);
      if (intentType === "Company/Provider") { filteredProviderCount++; if (onlyPersonIntent) continue; }
      if (onlyPersonIntent && intentType !== "Person Intent Lead") continue;

      const emails = extractEmails(pageText);
      const phones = extractPhones(pageText);
      const contactUrl = (pageText.match(/https?:\/\/[^\s"'<>]+contact[^\s"'<>]*/i) || [""])[0];
      const location = detectLocation(combined);
      const lead_type = getLeadType(combined);
      const relevance = scoreLead({ text: combined, location, hasContact: !!(emails[0] || phones[0] || contactUrl), intentType, sourceUrl: result.link });
      if (relevance < 4) continue;

      const lead = {
        name: "",
        company_or_profile: result.title.slice(0, 120),
        lead_type,
        intent_type: intentType,
        need: result.query,
        location,
        country_or_origin: "",
        email: emails[0] || "",
        phone: phones[0] || "",
        website: new URL(result.link).origin,
        social_url: SOURCE_PRIORITIES.some((p) => result.link.toLowerCase().includes(p)) ? result.link : "",
        contact_url: contactUrl,
        source_platform: result.source_platform,
        source_url: result.link,
        evidence_text: `${result.snippet || pageText.slice(0, 220)} | Query: ${result.query}`.slice(0, 420),
        relevance,
        confidence: relevance >= 8 ? "high" : relevance >= 6 ? "medium" : "low",
        recommended_outreach: "",
        published_at: publishedAtDate ? publishedAtDate.toISOString() : "",
        published_at_source: publishedAtSource,
      };

      if (!lead.source_url || !lead.evidence_text) continue;
      if (lead.email && !pageText.includes(lead.email)) lead.email = "";
      if (lead.phone && !normalize(pageText).includes(normalize(lead.phone))) lead.phone = "";
      lead.recommended_outreach = buildOutreach(lead);
      leads.push(lead);
    }

    const finalLeads = deduplicate(leads).slice(0, Math.max(1, Math.min(maxLeads, 50)));
    if (!finalLeads.length) return res.status(200).json({ leads: [], warning: "No person-intent leads found" , filtered_provider_count: filteredProviderCount});
    return res.status(200).json({ leads: finalLeads, filtered_provider_count: filteredProviderCount });
  } catch (error) {
    if (String(error.message || "").includes("NO_SEARCH_API_KEY")) return res.status(500).json({ error: "No API key configured for search provider" });
    if (String(error.message || "").includes("SEARCH_PROVIDER_FAILURE")) return res.status(502).json({ error: "Search provider failure" });
    return res.status(500).json({ error: error.message || "Unknown server error" });
  }
}
