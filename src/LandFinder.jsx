import { useMemo, useState } from "react";

const OPTIONS = [
  { id: "guanacaste", label: "Guanacaste", places: "Tamarindo · Avellanas · Flamingo · Nosara" },
  { id: "puntarenas", label: "Puntarenas", places: "Jacó · Hermosa · Herradura · Esterillos" },
  { id: "limon", label: "Limón", places: "Cahuita · Puerto Viejo · Punta Uva" },
  { id: "fortuna", label: "San Carlos", places: "La Fortuna · El Castillo · Chachagua" },
];
const danger = "#f0c478", muted = "#b6c6d5";
const field = { padding: "11px", background: "#1c3143", border: "1px solid #617183", borderRadius: 8, color: "#f7f4ed", width: "100%", boxSizing: "border-box" };
const btn = { background: "#c7a15a", color: "#0c1627", border: 0, borderRadius: 8, padding: "12px 18px", fontWeight: 700, cursor: "pointer" };
const csvSafe = (v) => {
  const raw = String(v ?? "");
  const escaped = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + escaped.replace(/"/g, '""') + '"';
};
export default function LandFinder({ password }) {
  const [zones, setZones] = useState(["guanacaste", "puntarenas", "limon", "fortuna"]);
  const [maxPrice, setMaxPrice] = useState("");
  const [maxBeachKm, setMaxBeachKm] = useState("3");
  const [filter, setFilter] = useState("");
  const [listings, setListings] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [queryStats, setQueryStats] = useState(null);
  const results = useMemo(() => listings.filter(l => !filter || l.zone === filter), [listings, filter]);
  const toggle = (id) => setZones(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  async function search() {
    if (!zones.length) return setErr("Seleccioná al menos una región.");
    setErr(""); setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/search-land", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, zones, maxPriceUsd: Number(maxPrice) || 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No fue posible buscar.");
      setListings(data.listings || []);
      setQueryStats({ queriesRun: data.queriesRun, searchFailures: data.searchFailures });
      setNotice(data.notice);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  function downloadCsv() {
    const keys = ["title", "zone", "sourceUrl", "sourceHost", "priceUsd", "areaM2", "pricePerM2Usd", "locationPrecision", "beachDistanceKm", "riverRiskStatus", "zoningStatus", "assessment"];
    const rows = [keys.map(csvSafe).join(","), ...results.map(l => keys.map(k => csvSafe(l[k])).join(","))];
    const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "akstudio_airbnb_land_candidates.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  return <section style={{ lineHeight: 1.55 }}>
    <h1 style={{ marginBottom: 6 }}>Airbnb Land Finder</h1>
    <p style={{ color: muted, marginTop: 0 }}>Exploración privada de terrenos con potencial turístico en Costa Rica. Una oportunidad no equivale a un lote apto para construir.</p>
    <div style={{ padding: 18, background: "#172b3d", borderRadius: 14, border: "1px solid #536577", marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>1. Seleccionar zonas</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(195px,1fr))", gap: 12 }}>
        {OPTIONS.map(opt => <label key={opt.id} style={{ background: "#22394e", padding: 12, borderRadius: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={zones.includes(opt.id)} onChange={() => toggle(opt.id)} /> <b>{opt.label}</b>
          <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>{opt.places}</div>
        </label>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, margin: "18px 0" }}>
        <label>Presupuesto máximo (USD)
          <input type="number" min="0" placeholder="Sin límite" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} style={field}/>
        </label>
        <label>Distancia objetivo a playa (km)
          <input type="number" min="0.2" max="30" step="0.1" value={maxBeachKm} onChange={e => setMaxBeachKm(e.target.value)} style={field}/>
        </label>
      </div>
      <p style={{ color: muted, fontSize: 12 }}>Objetivo: playa a ≤ {maxBeachKm || "3"} km; en La Fortuna, atractivos naturales cercanos. El objetivo de distancia es para la fase geográfica: el buscador inicial no afirma ni filtra distancias sin coordenadas verificadas.</p>
      <button onClick={search} disabled={loading || !zones.length} style={{ ...btn, opacity: loading ? 0.7 : 1 }}>{loading ? "Buscando anuncios..." : "Buscar terrenos en venta"}</button>
      {err && <p role="alert" style={{ color: "#ffabab" }}>{err}</p>}
    </div>
    <div style={{ padding: 14, borderLeft: "3px solid #c7a15a", background: "#1a3040", marginBottom: 16 }}>
      <b>Validación crítica pendiente:</b> cercanía a ríos, riesgo de inundación, zona marítimo-terrestre, disponibilidad de agua, acceso público, uso de suelo y permisos municipales. No deducir estas condiciones a partir de un anuncio.
      <div style={{ marginTop: 8, fontSize: 13 }}>
        <a style={{ color: danger }} href="https://www.snitcr.go.cr/" target="_blank" rel="noreferrer">SNIT</a> · <a style={{ color: danger }} href="https://mapas.da.go.cr/" target="_blank" rel="noreferrer">Hidrografía MINAE</a> · <a style={{ color: danger }} href="https://www.cne.go.cr/" target="_blank" rel="noreferrer">CNE</a>
      </div>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div><b>{results.length}</b> resultados preliminares {queryStats && <span style={{ fontSize: 12, color: muted }}>({queryStats.queriesRun} búsquedas, {queryStats.searchFailures} errores)</span>}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <select aria-label="Filtrar región" style={{ ...field, width: "auto" }} value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todas las zonas</option>{OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <button style={{ ...btn, padding: "8px 12px" }} onClick={downloadCsv} disabled={!results.length}>Exportar CSV</button>
      </div>
    </div>
    {notice && <p style={{ color: muted, fontSize: 13 }}>{notice}</p>}
    {results.map(l => <article key={l.id} style={{ background: "#172b3d", padding: 18, borderRadius: 12, marginBottom: 13, border: "1px solid #465d70" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 15, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <b style={{ fontSize: 17 }}>{l.title}</b>
          <p style={{ margin: "6px 0", color: muted, fontSize: 13 }}>{OPTIONS.find(o => o.id === l.zone)?.label} · {l.sourceHost}</p>
        </div>
        <strong style={{ color: danger }}>{l.priceUsd ? "$" + l.priceUsd.toLocaleString("en-US") : "Precio sin verificar"}</strong>
      </div>
      <p style={{ color: "#d7e0e9" }}>{l.snippet}</p>
      <div style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span>Área: {l.areaM2 ? l.areaM2.toLocaleString("en-US") + " m²" : "No identificada"}</span>
        <span>Playa: pendiente de medir</span><span>Ríos: no verificado</span><span>Uso de suelo: no verificado</span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#efc978" }}>Abrir anuncio original</a>
        <button style={{ ...btn, background: saved.includes(l.id) ? "#637787" : "#c7a15a", padding: "7px 12px" }} onClick={() => setSaved(s => s.includes(l.id) ? s.filter(x => x !== l.id) : [...s, l.id])}>{saved.includes(l.id) ? "Quitar de selección" : "Marcar candidato"}</button>
      </div>
    </article>)}
    {saved.length > 0 && <p style={{ color: muted }}>Candidatos marcados en esta sesión: {saved.length}. La selección no se guarda después de recargar la página.</p>}
  </section>;
}
