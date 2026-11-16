// Preliminary land-listing discovery. Results are NOT cadastral, zoning or flood certifications.
const ZONES = {
  guanacaste: { name: "Guanacaste", places: ["Tamarindo", "Playa Grande", "Playa Avellanas", "Flamingo", "Potrero", "Sámara", "Nosara"] },
  puntarenas: { name: "Puntarenas", places: ["Jacó", "Playa Hermosa Jacó", "Herradura", "Esterillos", "Playa Bejuco"] },
  limon: { name: "Limón", places: ["Cahuita", "Puerto Viejo", "Cocles", "Playa Chiquita", "Punta Uva"] },
  fortuna: { name: "San Carlos", places: ["La Fortuna", "El Castillo Arenal", "Chachagua"] },
};
const DEFAULT_MAX = 24;
const BLOCK_RENT = /\b(for rent|rental only|rent per night|vacation rental|alquiler vacacional|se alquila|renta mensual|reservar hospedaje|hotel for sale)\b/i;
const SALE = /\b(for sale|land for sale|lot for sale|property for sale|se vende|venta de|en venta|lote|terreno|finca|parcela|land|lot|lots)\b/i;
const REAL_ESTATE = /\b(terreno|lote|finca|parcela|land|lot|property|propiedad)\b/i;
const HTML_ESCAPE = /<[^>]*>/g;
function plain(t) { return String(t || "").replace(HTML_ESCAPE, " ").replace(/\s+/g, " ").trim(); }
function norm(t) { return plain(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function extractArea(t) {
  const m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{2,7}(?:[.,]\d+)?)\s*(m2|m²|metros cuadrados|sqm|sq\.?\s?m)\b/i);
  if (!m) return null;
  const raw = m[1].replace(/\s/g, "");
  const n = /^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(raw) ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
  return n >= 100 && n < 10000000 ? n : null;
}
function extractPrice(t) {
  const m = t.match(/(?:US\s?\$|USD\s?|[$])\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})(?!\d)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ""));
  return n >= 1000 && n <= 100000000 ? n : null;
}
function parseLatLon(t) {
  const match = t.match(/(?:lat(?:itude)?\s*[:=]\s*)(-?\d{1,2}\.\d+)[,\s;]+(?:lon(?:gitude)?|lng)\s*[:=]\s*(-?\d{1,3}\.\d+)/i);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  if (lat >= 8 && lat <= 12 && lng >= -86.5 && lng <= -82) return { lat, lng };
  return null;
}
function candidateFrom(r, place, zone, maximumPrice) {
  if (!/^https?:\/\//i.test(r.link || "")) return null;
  const title = plain(r.title).slice(0, 180), snippet = plain(r.snippet).slice(0, 800);
  const combined = title + " " + snippet;
  if (!REAL_ESTATE.test(combined) || !SALE.test(combined) || BLOCK_RENT.test(combined)) return null;
  const priceUsd = extractPrice(combined);
  if (maximumPrice && priceUsd && priceUsd > maximumPrice) return null;
  const areaM2 = extractArea(combined);
  const exactLocation = parseLatLon(combined);
  const amenitySignals = ["playa", "beach", "restaurante", "restaurant", "supermercado", "supermarket", "centro", "downtown", "tour", "waterfall", "volcan", "volcano"];
  const count = amenitySignals.filter(a => norm(combined).includes(a)).length;
  const source = new URL(r.link);
  return {
    id: r.link,
    title, snippet, sourceUrl: r.link, sourceHost: source.hostname,
    zone, searchedPlace: place, priceUsd, areaM2, pricePerM2Usd: priceUsd && areaM2 ? Math.round(priceUsd / areaM2) : null,
    coordinates: exactLocation,
    locationPrecision: exactLocation ? "coordinates_extracted_unverified" : "unknown",
    beachDistanceKm: null, riverDistanceM: null, amenityDistanceKm: null,
    beachProximityStatus: "not_verified", riverRiskStatus: "not_verified", zoningStatus: "not_verified",
    amenitiesMentioned: count,
    score: null,
    assessment: "PENDIENTE DE VALIDACIÓN",
    checks: ["Verificar ubicación y acceso con coordenadas catastrales", "Medir distancia real a la playa o atractivo turístico", "Consultar hidrografía y amenaza de inundación en fuentes oficiales", "Validar uso de suelo, ZMT, agua y disponibilidad de servicios"],
  };
}
function dedup(items) {
  const seen = new Set();
  return items.filter(i => {
    const url = new URL(i.sourceUrl);
    const key = url.hostname + url.pathname.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
async function serpSearch(query, key) {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google"); u.searchParams.set("q", query);
  u.searchParams.set("num", "10"); u.searchParams.set("api_key", key);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 9000);
  try {
    const response = await fetch(u, { signal: abort.signal });
    if (!response.ok) throw new Error("Search service error " + response.status);
    return (await response.json()).organic_results || [];
  } finally { clearTimeout(timeout); }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.APP_PASSWORD) return res.status(500).json({ error: "APP_PASSWORD not configured" });
  if (req.body?.password !== process.env.APP_PASSWORD) return res.status(401).json({ error: "Invalid password" });
  if (!process.env.SEARCH_API_KEY) return res.status(500).json({ error: "SEARCH_API_KEY not configured" });
  const ids = Array.isArray(req.body?.zones) ? req.body.zones.filter(v => Object.hasOwn(ZONES, v)).slice(0, 4) : [];
  if (!ids.length) return res.status(400).json({ error: "Select at least one region" });
  const maxPrice = Math.max(0, Math.min(100000000, Number(req.body?.maxPriceUsd) || 0));
  const queries = [];
  for (const id of ids) {
    const places = ZONES[id].places;
    // Two broad discovery queries per zone to cap SerpAPI use.
    for (const term of ["terrenos lotes venta", "land lots for sale"]) {
      queries.push({ zone: id, place: places.slice(0, 4).join(" OR "), query: "(" + places.slice(0, 4).map(p => '"' + p + '"').join(" OR ") + ") " + term + " Costa Rica" });
    }
  }
  try {
    const items = [];
    const errors = [];
    for (const q of queries) {
      try {
        const results = await serpSearch(q.query, process.env.SEARCH_API_KEY);
        for (const r of results) {
          const candidate = candidateFrom(r, q.place, q.zone, maxPrice);
          if (candidate) items.push(candidate);
        }
      } catch (e) { errors.push(e.message); }
    }
    const listings = dedup(items).slice(0, DEFAULT_MAX);
    return res.status(200).json({
      listings, searchedZones: ids, queriesRun: queries.length, searchFailures: errors.length,
      notice: "Anuncios preliminares obtenidos de resultados web. Distancias, riesgos, precios y disponibilidad requieren verificación individual. Ninguna propiedad ha sido aprobada para desarrollo.",
    });
  } catch (err) {
    return res.status(500).json({ error: "Land search failed" });
  }
}
