# 🏠 Lead Finder CR — Buscador de Clientes para Arquitecto

Herramienta privada para encontrar clientes potenciales que buscan construir en Costa Rica.

## Estructura del proyecto

```
lead-finder/
├── api/
│   └── search-leads.js   ← Serverless function (Vercel) — API key NUNCA llega al browser
├── src/
│   ├── App.jsx            ← Frontend React
│   └── main.jsx
├── index.html
├── vite.config.js
├── package.json
└── .env.example
```

## Deploy en Vercel (5 minutos)

### 1. Subir a GitHub
```bash
cd lead-finder
git init
git add .
git commit -m "first commit"
gh repo create lead-finder-cr --private --push --source=.
```

### 2. Importar en Vercel
1. Ir a https://vercel.com/new
2. Importar el repo `lead-finder-cr`
3. Framework: **Vite** (se detecta automático)
4. Click **Deploy**

### 3. Agregar variables de entorno
En Vercel → tu proyecto → **Settings → Environment Variables**:

| Variable | Valor |
|----------|-------|
| `ANTHROPIC_API_KEY` | tu clave de Anthropic |
| `APP_PASSWORD` | contraseña que querés usar para entrar |

4. Después de agregar las variables → **Redeploy**

## Desarrollo local

```bash
npm install
cp .env.example .env.local
# Editá .env.local con tus valores reales
npm run dev
```

## Seguridad implementada

- ✅ API key solo en servidor (variable de entorno)
- ✅ Password para acceder a la app
- ✅ Rate limit: máximo 20 búsquedas por hora por IP
- ✅ Validación de inputs en el servidor
- ✅ Exportar resultados a CSV
