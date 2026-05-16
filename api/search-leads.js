const RATE_LIMIT = new Map();
const MAX_REQUESTS_PER_HOUR = 20;
const MAX_RESULTS = 30;
const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_AGE_DAYS = 180;

const DEFAULT_QUERIES = [
  'site:reddit.com/r/costarica "recommend architect"',
  'site:reddit.com/r/expats "Costa Rica" "architect"',
  'site:reddit.com/r/IWantOut "Costa Rica" "build house"',
  'site:reddit.com/r/realestateinvesting "Costa Rica" "build"',
  '"Costa Rica expat forum" "recommend architect"',
  '"Costa Rica expat forum" "build a house"',
  '"Costa Rica forum" "need architect"',
  '"moving to Costa Rica" "build house" "forum"',
  '"bought land in Costa Rica" "build house"',
  '"retiring in Costa Rica" "build home"',
];

const SOURCE_PRIORITIES = ["reddit.com", "forum", "expat", "iwantout", "realestateinvesting"];
const PERSON_INTENT_PATTERNS = [
  /\bi am looking for an architect\b/i,
  /\bwe are looking for an architect\b/i,
  /\bcan anyone recommend an architect\b/i,
  /\bdoes anyone know an architect\b/i,
  /\bi want to build\b/i,
  /\bwe want to build\b/i,
  /\bi am planning to build\b/i,
  /\bwe are planning to build\b/i,
  /\bi bought land and want to build\b/i,
  /\bwe bought land\b/i,
  /\bi need help with permits\b/i,
  /\bwe need (a )?(builder|architect)\b/i,
  /\bmoving to costa rica and want to build\b/i,
  /\bretiring in costa rica and want to build\b/i,
  /\bbuilding an? (airbnb|vacation rental)\b/i,
];

const PROVIDER_SIGNALS = [
  /\bby\s+[a-z0-9\s&-]*(architect|studio|firm)\b/i,
  /\barchitects\b/i,
  /\barchitecture firm\b/i,
  /\bstudio\b/i,
  /\bdesign studio\b/i,
  /\bportfolio\b/i,
  /\bproject\b/i,
  /\bvilla by\b/i,
  /\bhouse by\b/i,
  /\bart villas\b/i,
  /\bour services\b/i,
  /\bcontact us\b/i,
  /\babout us\b/i,
  /\bwe design\b/i,
  /\bwe build\b/i,
  /\baward-winning\b/i,
  /\barchitecture magazine\b/i,
  /\barchdaily\b/i,
  /\bdezeen\b/i,
  /\bamazing_architecture\b/i,
  /\barchviz\b/i,
  /\binterior designer\b/i,
];

const SHOWCASE_DOMAINS = ["archdaily", "dezeen", "amazing_architecture", "archviz", "behance.net", "dribbble.com"];
const LOCATION_KEYWORDS = ["costa rica","guanacaste","tamarindo","nosara","uvita","dominical","manuel antonio","san jose","san josé","atenas","escazu","escazú","santa ana","limon","limón"];

const SAFE_HEADERS = {
  "User-Agent": "AKStudioLeadFinder/1.0 (+https://akstudio.example; respectful crawling)",
  "Accept": "text/html,application/xhtml+xml",
};

const normalize = (s = "") => s.toLowerCase().replace(/\s+/g, " ").trim();

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
  if (lc.includes("house") || lc.includes("home")) return "Local homeowner";
  return "Unknown";
}

function extractNeedFromEvidence(evidenceText) {
  const lc = normalize(evidenceText);
  const snippets = [
    "looking for an architect",
    "need an architect",
    "planning to build",
    "want to build",
    "bought land and want to build",
    "need help with permits",
    "building an airbnb",
    "building a vacation rental",
    "recommend an architect",
  ];
  const found = snippets.find((s) => lc.includes(s));
  return found || "";
}

function isValidPersonIntentLead({ source_url, evidence_text, title, snippet, pageText }) {
  const reasons = [];
  const combined = `${title} ${snippet} ${evidence_text} ${source_url} ${pageText}`;
  const lc = normalize(combined);

  if (!source_url) reasons.push("missing_source_url");
  if (!evidence_text) reasons.push("missing_evidence_text");

  const hasIntent = PERSON_INTENT_PATTERNS.some((re) => re.test(evidence_text));
  if (!hasIntent) reasons.push("missing_strong_person_intent_in_evidence");

  if (PROVIDER_SIGNALS.some((re) => re.test(lc))) reasons.push("provider_signal_detected");
  if (SHOWCASE_DOMAINS.some((d) => lc.includes(d))) reasons.push("showcase_domain_or_subreddit");
  if (/\b(villa|house|project)\s+by\b/i.test(lc)) reasons.push("completed_project_by_studio_pattern");

  return { valid: reasons.length === 0, reasons };
}

function scoreLead({ evidenceText, location, hasContact, sourceUrl }) {
  const hasIntent = PERSON_INTENT_PATTERNS.some((re) => re.test(evidenceText));
  if (!hasIntent) return 0;
  const combined = normalize(`${evidenceText} ${sourceUrl}`);
  if (PROVIDER_SIGNALS.some((re) => re.test(combined))) return 0;
  if (/\b(villa|house|project)\s+by\b/i.test(combined)) return 0;

  let score = 6;
  if (location && location !== "Costa Rica") score += 1;
  if (hasContact) score += 1;
  if (SOURCE_PRIORITIES.some((p) => sourceUrl.toLowerCase().includes(p))) score += 1;
  return Math.min(10, Math.max(1, score));
}

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
  return `Hi ${lead.name || "there"}, I saw your public post about ${lead.need}. AK Studio / Arquinautas CR helps people planning to build in Costa Rica with design, permits, and execution roadmap.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.APP_PASSWORD) return res.status(500).json({ error: "APP_PASSWORD is not configured" });
  if (req.body?.password !== process.env.APP_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").toString().split(",")[0].trim();
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
    const debugRejections = [];
    let filteredProviderCount = 0;
    let filteredIrrelevantCount = 0;

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

      const evidenceText = `${result.snippet || pageText.slice(0, 240)}`.slice(0, 420);
      const validation = isValidPersonIntentLead({
        source_url: result.link,
        evidence_text: evidenceText,
        title: result.title,
        snippet: result.snippet,
        pageText: pageText.slice(0, 1500),
      });

      if (!validation.valid) {
        if (validation.reasons.some((r) => r.includes("provider") || r.includes("showcase") || r.includes("project"))) filteredProviderCount++;
        else filteredIrrelevantCount++;
        if (debugRejections.length < 12) debugRejections.push({ source_url: result.link, reasons: validation.reasons, title: result.title.slice(0, 140) });
        continue;
      }

      const need = extractNeedFromEvidence(evidenceText);
      if (!need) {
        filteredIrrelevantCount++;
        continue;
      }

      const emails = extractEmails(pageText);
      const phones = extractPhones(pageText);
      const location = detectLocation(`${result.title} ${result.snippet} ${pageText.slice(0, 1200)}`);
      const intent_type = "Person Intent Lead";
      const lead_type = getLeadType(`${result.title} ${result.snippet} ${evidenceText}`);

      const combinedLower = normalize(`${result.title} ${result.snippet} ${pageText}`);
      const providerContactPage = PROVIDER_SIGNALS.some((re) => re.test(combinedLower));
      const safeEmail = providerContactPage ? "" : (emails[0] || "");
      const safePhone = providerContactPage ? "" : (phones[0] || "");

      const relevance = scoreLead({ evidenceText, location, hasContact: !!(safeEmail || safePhone || result.link), sourceUrl: result.link });
      if (relevance === 0) {
        filteredIrrelevantCount++;
        continue;
      }

      const lead = {
        name: "",
        company_or_profile: result.title.slice(0, 120),
        lead_type,
        intent_type,
        need,
        location,
        country_or_origin: "",
        email: safeEmail,
        phone: safePhone,
        website: new URL(result.link).origin,
        social_url: SOURCE_PRIORITIES.some((p) => result.link.toLowerCase().includes(p)) ? result.link : "",
        contact_url: "",
        source_platform: result.source_platform,
        source_url: result.link,
        evidence_text: evidenceText,
        relevance,
        confidence: relevance >= 8 ? "high" : relevance >= 6 ? "medium" : "low",
        recommended_outreach: "",
        published_at: publishedAtDate ? publishedAtDate.toISOString() : "",
        published_at_source: publishedAtSource,
      };

      if (onlyPersonIntent && lead.intent_type !== "Person Intent Lead") {
        filteredIrrelevantCount++;
        continue;
      }

      if (lead.email && !pageText.includes(lead.email)) lead.email = "";
      if (lead.phone && !normalize(pageText).includes(normalize(lead.phone))) lead.phone = "";
      lead.recommended_outreach = buildOutreach(lead);
      leads.push(lead);
    }

    const finalLeads = deduplicate(leads).slice(0, Math.max(1, Math.min(maxLeads, 50)));
    return res.status(200).json({
      leads: finalLeads,
      filtered_provider_count: filteredProviderCount,
      filtered_irrelevant_count: filteredIrrelevantCount,
      debug_sample_rejections: debugRejections,
      warning: finalLeads.length ? "" : "No strict person-intent leads found",
    });
  } catch (error) {
    if (String(error.message || "").includes("NO_SEARCH_API_KEY")) return res.status(500).json({ error: "No API key configured for search provider" });
    if (String(error.message || "").includes("SEARCH_PROVIDER_FAILURE")) return res.status(502).json({ error: "Search provider failure" });
    return res.status(500).json({ error: error.message || "Unknown server error" });
  }
}
