import { useMemo, useState } from "react";

const DEFAULT_QUERIES = [
  "site:reddit.com \"looking for architect\" \"Costa Rica\"",
  "site:reddit.com \"need architect\" \"Costa Rica\"",
  "\"planning to build\" \"Costa Rica\" \"architect\" forum",
  "\"buy land\" \"Costa Rica\" \"build house\" forum",
  "\"retiring in Costa Rica\" \"build home\"",
  "\"build Airbnb\" \"Costa Rica\" \"architect\"",
  "\"recommend architect\" \"Costa Rica\"",
  "\"moving to Costa Rica\" \"build a house\"",
  "\"need help building\" \"Costa Rica\"",
  "\"construction permits\" \"Costa Rica\" \"architect\" forum",
];

const LOCATIONS = ["All","Guanacaste","Tamarindo","Nosara","Uvita","Dominical","Manuel Antonio","San José","Atenas","Escazú","Santa Ana","Caribbean/Limón"];
const LEAD_TYPES = ["All","Expat relocation","Investor/Airbnb","Local homeowner","Developer","Land buyer","Renovation/remodel"];
const CONTACT_STATUS = ["all","has email","has phone","has contact URL","no direct contact"];

const BRAND = {
  deep: "#0C1627",
  deep2: "#13263A",
  gold: "#C7A15A",
  goldSoft: "#E8D3A6",
  ink: "#0F1115",
  text: "#F6F2E9",
  muted: "#A5B0BE",
};

function AKLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="AK Studio logo">
        <rect x="1" y="1" width="44" height="44" rx="10" stroke={BRAND.gold} strokeWidth="1.5" fill="rgba(255,255,255,0.02)" />
        <path d="M11 33L18 13H21L28 33H24.8L23.2 28H15.8L14.2 33H11ZM16.6 25.5H22.3L19.5 17.1L16.6 25.5Z" fill={BRAND.goldSoft} />
        <path d="M30 13V33H33V25.4L38.7 33H42.5L35.8 24.3L42.1 13H38.5L33 22.8V13H30Z" fill={BRAND.gold} />
      </svg>
      <div>
        <div style={{ fontWeight: 700, letterSpacing: 1.5, color: BRAND.goldSoft }}>AK STUDIO</div>
        <div style={{ fontSize: 12, color: BRAND.muted, letterSpacing: 1 }}>Arquinautas CR</div>
      </div>
    </div>
  );
}

export default function App() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [queries, setQueries] = useState(DEFAULT_QUERIES.join("\n"));
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const [locationFilter, setLocationFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [contactFilter, setContactFilter] = useState("all");
  const [minRelevance, setMinRelevance] = useState(1);
  const [maxAgeDays, setMaxAgeDays] = useState(180);
  const [onlyPersonIntent, setOnlyPersonIntent] = useState(true);
  const [filteredProviderCount, setFilteredProviderCount] = useState(0);
  const [filteredIrrelevantCount, setFilteredIrrelevantCount] = useState(0);

  const fetchLeads = async () => {
    setLoading(true); setError(""); setWarning("");
    try {
      const res = await fetch("/api/search-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, queries: queries.split("\n").map((q) => q.trim()).filter(Boolean), maxAgeDays, onlyPersonIntent }),
      });
      const data = await res.json();
      if (res.status === 401) { setAuthed(false); setError("Invalid password."); return; }
      if (!res.ok) { setError(data.error || "Search failed."); return; }
      setLeads(data.leads || []);
      setWarning(data.warning || "");
      setFilteredProviderCount(data.filtered_provider_count || 0);
      setFilteredIrrelevantCount(data.filtered_irrelevant_count || 0);
    } catch {
      setError("Network error.");
    } finally { setLoading(false); }
  };

  const filteredLeads = useMemo(() => leads.filter((l) => {
    if (onlyPersonIntent && l.intent_type === "Company/Provider") return false;
    if ((l.relevance || 0) < minRelevance) return false;
    if (locationFilter !== "All" && !(l.location || "").toLowerCase().includes(locationFilter.toLowerCase().replace("/", " "))) return false;
    if (typeFilter !== "All" && l.lead_type !== typeFilter) return false;
    if (contactFilter === "has email" && !l.email) return false;
    if (contactFilter === "has phone" && !l.phone) return false;
    if (contactFilter === "has contact URL" && !l.contact_url) return false;
    if (contactFilter === "no direct contact" && (l.email || l.phone)) return false;
    return true;
  }), [leads, minRelevance, locationFilter, typeFilter, contactFilter, onlyPersonIntent]);

  const exportCsv = () => {
    const fields = ["name","company_or_profile","lead_type","intent_type","need","location","country_or_origin","email","phone","website","social_url","contact_url","source_platform","source_url","published_at","published_at_source","evidence_text","relevance","confidence","recommended_outreach"];
    const lines = [fields.join(","), ...filteredLeads.map((lead) => fields.map((f) => `"${String(lead[f] || "").replace(/"/g,'""')}"`).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `lead_finder_cr_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const copyOutreach = async (msg) => navigator.clipboard.writeText(msg || "");

  if (!authed) return <div style={styles.page}><div style={styles.wrap}><AKLogo /><h1>Lead Discovery Console</h1><p style={{color:BRAND.muted}}>Private access</p><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="APP_PASSWORD" style={styles.input}/><button style={styles.btn} onClick={()=> password ? setAuthed(true) : setError("Password required")}>Enter</button>{error && <p style={styles.err}>{error}</p>}</div></div>;

  return <div style={styles.page}><div style={styles.wrap}><AKLogo /><h1>Costa Rica Lead Discovery</h1><p style={styles.disclaimer}>Compliance notice: results use public web pages and must be manually verified before outreach. Never assume contact data accuracy without checking the source page.</p>
    <textarea rows={7} style={styles.input} value={queries} onChange={(e)=>setQueries(e.target.value)} />
    <button style={styles.btn} onClick={fetchLeads} disabled={loading}>{loading ? "Searching public sources..." : "Search Leads"}</button>
    {error && <p style={styles.err}>{error}</p>}{warning && <p>{warning}</p>}
    <p style={{color: BRAND.muted, marginTop: 0}}>This tool prioritizes public posts from people showing building/remodeling intent. Contact details are only shown when publicly available.</p>
    <p style={{color: BRAND.muted}}>Provider/company pages filtered out: {filteredProviderCount}</p>
    <p style={{color: BRAND.muted}}>Irrelevant/non-intent pages filtered out: {filteredIrrelevantCount}</p>

    <div style={styles.filters}>
      <select value={locationFilter} onChange={(e)=>setLocationFilter(e.target.value)}>{LOCATIONS.map(v=><option key={v}>{v}</option>)}</select>
      <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)}>{LEAD_TYPES.map(v=><option key={v}>{v}</option>)}</select>
      <select value={contactFilter} onChange={(e)=>setContactFilter(e.target.value)}>{CONTACT_STATUS.map(v=><option key={v}>{v}</option>)}</select>
      <label>Min relevance: {minRelevance}<input type="range" min="1" max="10" value={minRelevance} onChange={(e)=>setMinRelevance(Number(e.target.value))}/></label>
      <label>Max age days<input type="number" min="1" max="3650" value={maxAgeDays} onChange={(e)=>setMaxAgeDays(Number(e.target.value) || 180)} /></label>
      <label style={{display:"flex", alignItems:"center", gap:8}}><input type="checkbox" checked={onlyPersonIntent} onChange={(e)=>setOnlyPersonIntent(e.target.checked)} />Only person-intent leads</label>
      <button style={styles.btnSecondary} onClick={exportCsv}>Export CSV</button>
    </div>

    {filteredLeads.map((lead, i) => <div key={i} style={styles.card}>
      <h3>{lead.name || lead.company_or_profile || "Unnamed public profile"}</h3>
      <p><b>Need:</b> {lead.need}</p><p><b>Type:</b> {lead.lead_type} · <b>Intent:</b> <span style={{padding:"2px 8px", borderRadius:999, border:`1px solid ${lead.intent_type === "Person Intent Lead" ? "#22c55e" : lead.intent_type === "Company/Provider" ? "#ef4444" : "#f59e0b"}`}}>{lead.intent_type === "Person Intent Lead" ? "Intent Lead" : lead.intent_type === "Company/Provider" ? "Provider/Company" : "Unclear"}</span> · <b>Location:</b> {lead.location} · <b>Relevance:</b> {lead.relevance}/10</p>
      <p><b>Email:</b> {lead.email || ""} <b>Phone:</b> {lead.phone || ""}</p>
      <p><b>Website:</b> {lead.website || ""}</p>
      <p><b>Published:</b> {lead.published_at ? new Date(lead.published_at).toLocaleDateString() : "Unknown"} ({lead.published_at_source || "unknown"})</p>
      <p><b>Evidence:</b> {lead.evidence_text}</p>
      <p><b>Recommended outreach:</b> {lead.recommended_outreach}</p>
      <div style={{display:"flex",gap:10}}>
        <button style={styles.btnSecondary} onClick={()=>copyOutreach(lead.recommended_outreach)}>Copy outreach message</button>
        <a href={lead.source_url} target="_blank" rel="noreferrer" style={{color:BRAND.goldSoft}}>Verify source</a>
      </div>
    </div>)}
  </div></div>;
}

const styles = {
  page: { minHeight: "100vh", background: `linear-gradient(135deg,${BRAND.deep},${BRAND.deep2})`, color: BRAND.text, fontFamily: "Inter, Arial", padding: 24 },
  wrap: { maxWidth: 1000, margin: "0 auto" },
  input: { width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: `1px solid ${BRAND.gold}`, background: "rgba(255,255,255,.06)", color: BRAND.text },
  btn: { background: BRAND.gold, color: BRAND.ink, border: 0, padding: "10px 14px", borderRadius: 8, cursor: "pointer", marginBottom: 12, fontWeight: 700 },
  btnSecondary: { background: "#25384A", color: "#fff", border: `1px solid ${BRAND.gold}`, padding: "8px 12px", borderRadius: 8, cursor: "pointer" },
  err: { color: "#ff8b8b" },
  disclaimer: { background: "rgba(255,255,255,.08)", padding: 10, borderRadius: 8, border: `1px solid ${BRAND.gold}` },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, margin: "16px 0" },
  card: { background: "rgba(255,255,255,.06)", border: `1px solid ${BRAND.gold}`, borderRadius: 12, padding: 14, marginBottom: 12 },
};
