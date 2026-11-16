import { useEffect, useMemo, useRef, useState } from "react";

// Coordinates are approximate reference points, NOT property boundaries or cadastral positions.
const LOCATIONS = [
  { name:"Tamarindo", zone:"Guanacaste", lat:10.300, lon:-85.839, kind:"playa" },
  { name:"Playa Grande", zone:"Guanacaste", lat:10.334, lon:-85.845, kind:"playa" },
  { name:"Avellanas", zone:"Guanacaste", lat:10.225, lon:-85.839, kind:"playa" },
  { name:"Flamingo", zone:"Guanacaste", lat:10.438, lon:-85.784, kind:"playa" },
  { name:"Sámara", zone:"Guanacaste", lat:9.882, lon:-85.528, kind:"playa" },
  { name:"Nosara", zone:"Guanacaste", lat:9.949, lon:-85.670, kind:"playa" },
  { name:"Jacó", zone:"Puntarenas", lat:9.615, lon:-84.630, kind:"playa" },
  { name:"Playa Hermosa de Jacó", zone:"Puntarenas", lat:9.575, lon:-84.605, kind:"playa" },
  { name:"Herradura", zone:"Puntarenas", lat:9.648, lon:-84.659, kind:"playa" },
  { name:"Esterillos", zone:"Puntarenas", lat:9.527, lon:-84.498, kind:"playa" },
  { name:"Cahuita", zone:"Limón", lat:9.735, lon:-82.838, kind:"playa" },
  { name:"Puerto Viejo", zone:"Limón", lat:9.659, lon:-82.753, kind:"playa" },
  { name:"Cocles", zone:"Limón", lat:9.640, lon:-82.738, kind:"playa" },
  { name:"Punta Uva", zone:"Limón", lat:9.636, lon:-82.697, kind:"playa" },
  { name:"La Fortuna", zone:"San Carlos", lat:10.470, lon:-84.646, kind:"atractivo turístico" },
  { name:"El Castillo, Arenal", zone:"San Carlos", lat:10.426, lon:-84.755, kind:"atractivo turístico" },
  { name:"Chachagua", zone:"San Carlos", lat:10.406, lon:-84.592, kind:"atractivo turístico" }
];
const MAP_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const MAP_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const card = {background:"#192e42",border:"1px solid #465b6e",borderRadius:12,padding:16,marginBottom:14};
const input = {background:"#223b50",color:"#fff",border:"1px solid #728193",borderRadius:8,padding:10,width:"100%",boxSizing:"border-box"};
const button = {background:"#c7a15a",color:"#0c1627",border:0,borderRadius:8,padding:"10px 14px",fontWeight:700,cursor:"pointer"};
function distanceKm(a,b,c,d) {
 const r=Math.PI/180, x=(c-a)*r, y=(d-b)*r;
 const v=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v));
}
function parseCoordinate(value,min,max) {
 if (String(value).trim()==="") return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function searchLinks(place) {
 const q=encodeURIComponent("terreno lote venta "+place.name+" "+place.zone+" Costa Rica");
 const en=encodeURIComponent("land for sale "+place.name+" Costa Rica");
 return [
  {name:"Buscar terrenos en Google",url:"https://www.google.com/search?q="+q},
  {name:"Buscar terrenos en Bing",url:"https://www.bing.com/search?q="+en},
  {name:"Buscar terrenos en Encuentra24",url:"https://www.google.com/search?q="+encodeURIComponent('site:encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-lotes-y-terrenos '+place.name)},
  {name:"Buscar terrenos en Facebook/Google",url:"https://www.google.com/search?q="+encodeURIComponent('site:facebook.com "terreno en venta" "'+place.name+'"')}
 ];
}
function exportCSV(records) {
 const cols=["name","url","lat","lon","price","area","notes","reference","distanceKm","withinRadius"];
 const safe=v=>'"'+String(v??"").replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const lines=[cols.join(","),...records.map(r=>cols.map(k=>safe(r[k])).join(","))];
 const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob), a=document.createElement("a");
 a.href=url;a.download="akstudio_terrenos_evaluados.csv";a.click(); URL.revokeObjectURL(url);
}
function loadLeaflet() {
 return new Promise((resolve,reject)=>{
  if(window.L) return resolve(window.L);
  if(!document.querySelector('link[data-ak-leaflet]')) {
   const link=document.createElement("link");link.rel="stylesheet";link.href=MAP_CSS;link.dataset.akLeaflet="1";document.head.appendChild(link);
  }
  const existing=document.querySelector('script[data-ak-leaflet]');
  if(existing) {
   existing.addEventListener("load",()=>resolve(window.L),{once:true});
   existing.addEventListener("error",reject,{once:true});
   return;
  }
  const script=document.createElement("script");script.src=MAP_JS;script.dataset.akLeaflet="1";
  script.onload=()=>resolve(window.L);script.onerror=reject;document.head.appendChild(script);
 });
}
export default function LandFinder() {
 const [selected,setSelected]=useState("Jacó");
 const [radius,setRadius]=useState(3);
 const [form,setForm]=useState({name:"",url:"",lat:"",lon:"",price:"",area:"",notes:""});
 const [records,setRecords]=useState(()=>{
  try {const v=JSON.parse(localStorage.getItem("ak-land-free-v1")||"[]");return Array.isArray(v)?v:[];}catch{return [];}
 });
 const [error,setError]=useState("");
 const [mapError,setMapError]=useState("");
 const mapEl=useRef(null),map=useRef(null),layers=useRef(null);
 const selectedPlace=LOCATIONS.find(p=>p.name===selected)||LOCATIONS[0];
 const evaluated=useMemo(()=>records.map(r=>{
  const distance=distanceKm(selectedPlace.lat,selectedPlace.lon,Number(r.lat),Number(r.lon));
  return {...r, reference:selectedPlace.name,distanceKm:Number(distance.toFixed(2)),withinRadius:distance<=radius};
 }).sort((a,b)=>a.distanceKm-b.distanceKm),[records,selectedPlace,radius]);
 useEffect(()=>{try{localStorage.setItem("ak-land-free-v1",JSON.stringify(records));}catch{}},[records]);
 useEffect(()=>{
  let cancelled=false;
  loadLeaflet().then(L=>{
   if(cancelled||!mapEl.current)return;
   if(!map.current) {
    map.current=L.map(mapEl.current,{scrollWheelZoom:false}).setView([selectedPlace.lat,selectedPlace.lon],12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      maxZoom:18
    }).addTo(map.current);
    layers.current=L.layerGroup().addTo(map.current);
   }
   layers.current.clearLayers();
   const coords=[selectedPlace.lat,selectedPlace.lon];
   L.circle(coords,{radius:radius*1000,color:"#c7a15a",weight:2,fillColor:"#c7a15a",fillOpacity:.12}).addTo(layers.current);
   L.marker(coords).bindPopup("Referencia aproximada: "+selectedPlace.name).addTo(layers.current);
   evaluated.forEach(r=>{
    L.circleMarker([Number(r.lat),Number(r.lon)],{radius:7,color:r.withinRadius?"#16a34a":"#e59a57",fillOpacity:.85})
     .bindPopup("<b>"+String(r.name).replace(/[&<>"']/g,"")+"</b><br/>"+r.distanceKm+" km en línea recta").addTo(layers.current);
   });
   map.current.setView(coords,radius<=2?13:12);
   setTimeout(()=>map.current?.invalidateSize(),50);
  }).catch(()=>{if(!cancelled)setMapError("No se pudo cargar el mapa. Los enlaces y cálculos siguen disponibles.");});
  return()=>{cancelled=true};
 },[selected,radius,evaluated]);
 function save(e) {
  e.preventDefault();setError("");
  const lat=parseCoordinate(form.lat,8,12),lon=parseCoordinate(form.lon,-86.5,-82);
  if(!form.name.trim()||lat===null||lon===null) return setError("Indicar nombre y coordenadas válidas del terreno en Costa Rica.");
  if(form.url.trim()) {
   try {const u=new URL(form.url);if(!["http:","https:"].includes(u.protocol))throw Error();}catch{return setError("El enlace debe comenzar por https:// o http://");}
  }
  setRecords(r=>[{...form,id:Date.now()+"-"+r.length,name:form.name.trim(),lat,lon},...r]);
  setForm({name:"",url:"",lat:"",lon:"",price:"",area:"",notes:""});
 }
 return <section style={{lineHeight:1.5}}>
  <h1 style={{marginBottom:5}}>AK Land Finder — Airbnb</h1>
  <p style={{color:"#b4c4d4",marginTop:0}}>Edición de costo cero: sin Google Maps API, sin SerpAPI y sin servicios con facturación. Mapa para evaluación manual de oportunidades.</p>
  <div style={card}>
   <h3 style={{marginTop:0}}>1. Elegí la playa o destino</h3>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
    <label>Destino<select style={input} value={selected} onChange={e=>setSelected(e.target.value)}>{["Guanacaste","Puntarenas","Limón","San Carlos"].map(z=><optgroup label={z} key={z}>{LOCATIONS.filter(p=>p.zone===z).map(p=><option key={p.name}>{p.name}</option>)}</optgroup>)}</select></label>
    <label>Radio de búsqueda<select style={input} value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[1,2,3,5].map(k=><option value={k} key={k}>{k} km</option>)}</select></label>
   </div>
   <p style={{color:"#b4c4d4",fontSize:13}}>Centro aproximado de {selectedPlace.name}. El círculo mide {radius} km en línea recta, no recorrido vial. Para una ubicación exacta, confirmar coordenadas de la playa o atractivo.</p>
   <div ref={mapEl} style={{height:420,width:"100%",borderRadius:10,background:"#263b4d"}} role="img" aria-label="Mapa interactivo con radio de búsqueda" />
   {mapError&&<p style={{color:"#ffc5a3"}}>{mapError}</p>}
   <p style={{fontSize:12,color:"#b4c4d4"}}>Cartografía © OpenStreetMap contributors. Servicio público sujeto a políticas de uso, límites y disponibilidad; no realizar descargas masivas.</p>
   <a href={"https://www.google.com/maps/search/?api=1&query="+selectedPlace.lat+"%2C"+selectedPlace.lon} target="_blank" rel="noopener noreferrer" style={{color:"#e9c778"}}>Abrir zona en Google Maps (sin API)</a>
  </div>
  <div style={card}>
   <h3 style={{marginTop:0}}>2. Buscar anuncios gratuitos</h3>
   <p>Estos enlaces abren buscadores públicos. No consultamos APIs de pago ni garantizamos que los anuncios estén disponibles.</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:10}}>{searchLinks(selectedPlace).map(x=><a key={x.name} style={{...button,textDecoration:"none",display:"inline-block",fontSize:13}} href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a>)}</div>
  </div>
  <div style={card}>
   <h3 style={{marginTop:0}}>3. Guardar y medir un terreno</h3>
   <p style={{fontSize:13,color:"#b4c4d4"}}>Abrí un anuncio, comprobá su posición y copiá las coordenadas. Guardaremos tus candidatos en este navegador, sin base de datos externa.</p>
   <form onSubmit={save}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
     {[["name","Nombre del terreno"],["url","Enlace del anuncio"],["lat","Latitud"],["lon","Longitud"],["price","Precio anunciado (USD)"],["area","Área anunciada (m²)"]].map(([key,label])=><label key={key}>{label}<input style={input} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={key==="lat"?"Ej.: 9.615":key==="lon"?"Ej.: -84.630":""}/></label>)}
    </div>
    <label style={{display:"block",margin:"12px 0"}}>Notas, accesos o alertas<textarea style={input} rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></label>
    <button style={button} type="submit">Agregar terreno al mapa</button>
    {error&&<p role="alert" style={{color:"#ffaaaa"}}>{error}</p>}
   </form>
  </div>
  <div style={card}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
    <h3 style={{margin:0}}>4. Terrenos guardados ({records.length})</h3>
    <button style={button} onClick={()=>exportCSV(evaluated)} disabled={!evaluated.length}>Exportar CSV</button>
   </div>
   {evaluated.length===0?<p style={{color:"#b4c4d4"}}>Aún no hay terrenos guardados.</p>:evaluated.map(r=><div key={r.id} style={{padding:"12px 0",borderBottom:"1px solid #40566a"}}>
    <strong>{r.name}</strong> · <span style={{color:r.withinRadius?"#8ee0a8":"#f6c68e"}}>{r.distanceKm} km {r.withinRadius?"(dentro del radio)":"(fuera del radio)"}</span>
    <div style={{color:"#b4c4d4",fontSize:13}}>Precio: {r.price||"Sin dato"} · Área: {r.area||"Sin dato"} · {r.notes}</div>
    {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" style={{color:"#eac47c"}}>Anuncio original</a>}
    <button type="button" style={{marginLeft:12,...button,padding:"4px 10px",background:"#5b687a",color:"white"}} onClick={()=>setRecords(items=>items.filter(v=>v.id!==r.id))}>Eliminar</button>
   </div>)}
  </div>
  <div style={{...card,borderLeft:"3px solid #c7a15a"}}>
   <b>Antes de invertir:</b> Este módulo NO confirma cercanía a ríos, inundaciones, retiros, acceso legal, zonificación, disponibilidad de agua, ZMT, precio ni ocupación Airbnb. Consultar <a href="https://www.snitcr.go.cr/" target="_blank" rel="noopener noreferrer" style={{color:"#eac47c"}}>SNIT</a>, <a href="https://www.cne.go.cr/" target="_blank" rel="noopener noreferrer" style={{color:"#eac47c"}}>CNE</a>, <a href="https://mapas.da.go.cr/" target="_blank" rel="noopener noreferrer" style={{color:"#eac47c"}}>Dirección de Agua</a> y municipio correspondiente. La ubicación en el anuncio debe verificarse individualmente.
  </div>
 </section>;
}
