import { useState, useCallback } from "react";

const SEARCH_SOURCES = [
  { id: "reddit",  label: "Reddit",       icon: "🟠" },
  { id: "expat",   label: "Foros Expats", icon: "🌎" },
  { id: "luxury",  label: "Mercado Lujo", icon: "✨" },
];

const SCALE_COLORS  = { small: "#4ade80", medium: "#facc15", large: "#fb923c", luxury: "#e879f9" };
const SCALE_LABELS  = { small: "Pequeño", medium: "Mediano", large: "Grande",  luxury: "Lujo"    };

export default function LeadFinder() {
  const [password,        setPassword]        = useState("");
  const [authed,          setAuthed]          = useState(false);
  const [authError,       setAuthError]       = useState("");
  const [selectedSources, setSelectedSources] = useState(["reddit", "expat", "luxury"]);
  const [leads,           setLeads]           = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [searched,        setSearched]        = useState(false);

  /* ── Auth ────────────────────────────────────────────────── */
  const handleLogin = () => {
    if (!password.trim()) { setAuthError("Ingresá la contraseña"); return; }
    // We'll verify on first real API call; optimistically unlock UI
    setAuthed(true);
    setAuthError("");
  };

  /* ── Sources ─────────────────────────────────────────────── */
  const toggleSource = (id) =>
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  /* ── Search ──────────────────────────────────────────────── */
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setLeads([]);
    setError("");
    setSearched(false);

    try {
      const res = await fetch("/api/search-leads", {   // ✅ hits our serverless function
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, sources: selectedSources }),
      });

      if (res.status === 401) { setAuthed(false); setAuthError("Contraseña incorrecta"); return; }
      if (res.status === 429) { setError("Límite de búsquedas alcanzado. Intentá en 1 hora."); return; }
      if (!res.ok)            { setError("Error del servidor. Intentá de nuevo."); return; }

      const data = await res.json();
      setLeads(data.leads || []);
    } catch (e) {
      setError("No se pudo conectar. Verificá tu conexión.");
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [password, selectedSources]);

  /* ── Export CSV ──────────────────────────────────────────── */
  const exportCSV = () => {
    const header = "Plataforma,Usuario,Necesidad,Escala,Ubicación,URL,Relevancia\n";
    const rows   = leads
      .map((l) =>
        [l.platform, l.user, l.need, l.scale, l.location || "", l.url || "", l.relevance]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `leads_cr_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Styles ──────────────────────────────────────────────── */
  const s = {
    page:    { minHeight:"100vh", background:"linear-gradient(135deg,#0a0e1a 0%,#0f1e2e 50%,#071218 100%)", fontFamily:"Georgia,serif", color:"#e8dfc8", padding:0 },
    header:  { borderBottom:"1px solid rgba(180,150,80,.25)", padding:"32px 40px 24px", background:"rgba(0,0,0,.3)" },
    h1:      { fontSize:"clamp(26px,5vw,44px)", fontWeight:400, margin:"8px 0 6px", background:"linear-gradient(135deg,#e8dfc8 0%,#b49650 50%,#e8dfc8 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    label:   { fontSize:11, letterSpacing:5, color:"#b49650", textTransform:"uppercase" },
    body:    { maxWidth:900, margin:"0 auto", padding:"32px 24px" },
    input:   { width:"100%", padding:"12px 16px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(180,150,80,.3)", borderRadius:4, color:"#e8dfc8", fontSize:14, outline:"none", boxSizing:"border-box" },
    btn:     (disabled) => ({ width:"100%", padding:"16px", background: disabled ? "rgba(180,150,80,.1)" : "linear-gradient(135deg,rgba(180,150,80,.3),rgba(120,100,50,.4))", border:"1px solid rgba(180,150,80,.5)", borderRadius:6, color: disabled ? "#5a6a7a" : "#e8dfc8", fontSize:14, letterSpacing:3, textTransform:"uppercase", cursor: disabled ? "not-allowed" : "pointer" }),
    chip:    (active) => ({ padding:"10px 20px", border: active ? "1px solid #b49650" : "1px solid rgba(180,150,80,.25)", background: active ? "rgba(180,150,80,.15)" : "rgba(255,255,255,.03)", color: active ? "#e8dfc8" : "#5a6a7a", borderRadius:4, cursor:"pointer", fontSize:13 }),
    card:    (scale) => ({ padding:"20px 24px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(180,150,80,.15)", borderLeft:`3px solid ${SCALE_COLORS[scale]||"#b49650"}`, borderRadius:"0 6px 6px 0", marginBottom:14 }),
    errBox:  { padding:"12px 18px", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", borderRadius:4, color:"#f87171", fontSize:13, marginBottom:20 },
  };

  /* ── Login screen ────────────────────────────────────────── */
  if (!authed) return (
    <div style={s.page}>
      <div style={s.header}><div style={{ maxWidth:900, margin:"0 auto" }}>
        <p style={s.label}>Herramienta Privada</p>
        <h1 style={s.h1}>Buscador de Clientes</h1>
        <p style={{ color:"#8a9ab0", fontSize:14, margin:0 }}>Arquitectura · Costa Rica</p>
      </div></div>

      <div style={{ ...s.body, maxWidth:400 }}>
        <p style={{ ...s.label, marginBottom:14 }}>Acceso</p>
        {authError && <div style={s.errBox}>{authError}</div>}
        <input
          style={{ ...s.input, marginBottom:14 }}
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        <button style={s.btn(false)} onClick={handleLogin}>→ Ingresar</button>
      </div>
    </div>
  );

  /* ── Main app ────────────────────────────────────────────── */
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}><div style={{ maxWidth:900, margin:"0 auto" }}>
        <p style={s.label}>Herramienta de Prospección</p>
        <h1 style={s.h1}>Buscador de Clientes</h1>
        <p style={{ color:"#8a9ab0", fontSize:14, margin:0 }}>Arquitectura · Costa Rica · Generación de Leads con IA</p>
      </div></div>

      <div style={s.body}>
        {/* Source selector */}
        <p style={{ ...s.label, marginBottom:14 }}>Fuentes de Búsqueda</p>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:28 }}>
          {SEARCH_SOURCES.map((src) => (
            <button key={src.id} style={s.chip(selectedSources.includes(src.id))} onClick={() => toggleSource(src.id)}>
              {src.icon} {src.label}
            </button>
          ))}
        </div>

        {/* Search button */}
        <button
          style={{ ...s.btn(loading || selectedSources.length === 0), marginBottom:28 }}
          disabled={loading || selectedSources.length === 0}
          onClick={fetchLeads}
        >
          {loading ? "⟳  Buscando en internet..." : "◈  Buscar Clientes Potenciales"}
        </button>

        {/* Error */}
        {error && <div style={s.errBox}>⚠ {error}</div>}

        {/* Results header */}
        {leads.length > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
            <p style={{ ...s.label, margin:0 }}>Leads Encontrados — {leads.length} resultados</p>
            <button
              onClick={exportCSV}
              style={{ padding:"8px 18px", background:"rgba(180,150,80,.15)", border:"1px solid rgba(180,150,80,.4)", borderRadius:4, color:"#b49650", fontSize:12, cursor:"pointer", letterSpacing:1 }}
            >
              ↓ Exportar CSV
            </button>
          </div>
        )}

        {/* Lead cards */}
        {leads.map((lead, i) => (
          <div key={i} style={s.card(lead.scale)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, flexWrap:"wrap", gap:8 }}>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:11, color:"#5a6a7a" }}>{lead.platform}</span>
                {lead.scale && (
                  <span style={{ fontSize:10, padding:"2px 10px", borderRadius:3, background:`${SCALE_COLORS[lead.scale]}22`, border:`1px solid ${SCALE_COLORS[lead.scale]}55`, color:SCALE_COLORS[lead.scale], letterSpacing:1, textTransform:"uppercase" }}>
                    {SCALE_LABELS[lead.scale] || lead.scale}
                  </span>
                )}
                {lead.location && <span style={{ fontSize:11, color:"#4a8a6a" }}>📍 {lead.location}</span>}
              </div>
              {/* Relevance bar */}
              <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                {[...Array(10)].map((_,j) => (
                  <div key={j} style={{ width:4, height:14, borderRadius:2, background: j < (lead.relevance||0) ? "#b49650" : "rgba(180,150,80,.15)" }} />
                ))}
                <span style={{ fontSize:11, color:"#b49650", marginLeft:6 }}>{lead.relevance}/10</span>
              </div>
            </div>

            {lead.user && <div style={{ fontSize:12, color:"#7a9aaa", marginBottom:8 }}>👤 {lead.user}</div>}
            <p style={{ fontSize:14, color:"#c8bfa8", margin:"0 0 12px", lineHeight:1.6 }}>{lead.need}</p>
            {lead.url?.startsWith("http") && (
              <a href={lead.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize:11, color:"#b49650", textDecoration:"none", borderBottom:"1px solid rgba(180,150,80,.3)" }}>
                → Ver publicación original
              </a>
            )}
          </div>
        ))}

        {/* Empty state */}
        {searched && leads.length === 0 && !loading && (
          <div style={{ textAlign:"center", padding:"60px 20px", border:"1px solid rgba(180,150,80,.15)", borderRadius:8, color:"#5a6a7a" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🌿</div>
            <p>No se encontraron leads en esta búsqueda.</p>
            <p style={{ fontSize:12 }}>Intenta activar más fuentes o busca de nuevo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
