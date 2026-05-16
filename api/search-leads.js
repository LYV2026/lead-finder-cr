// api/search-leads.js
const RATE_LIMIT = new Map();
const MAX_REQUESTS_PER_HOUR = 20;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password, sources } = req.body;
  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  if (!RATE_LIMIT.has(ip)) RATE_LIMIT.set(ip, []);
  const timestamps = RATE_LIMIT.get(ip).filter((t) => t > windowStart);
  if (timestamps.length >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({ error: "Límite de búsquedas alcanzado. Intenta en 1 hora." });
  }
  timestamps.push(now);
  RATE_LIMIT.set(ip, timestamps);

  const sourcesSelected = sources || ["reddit", "expat", "luxury"];

  const PROMPT = `You are a lead-generation assistant for a licensed architect based in Costa Rica who designs and builds custom homes.

Generate a list of 10 realistic potential client profiles who would be looking to hire an architect to build a home in Costa Rica. These should represent real types of people who commonly search for this service.

Include a mix of:
- American/Canadian/European retirees wanting to build a dream home
- Expats relocating to Costa Rica
- Investors wanting to build vacation rentals or Airbnb properties
- Local Costa Ricans wanting a custom home

For each profile, create realistic details. Vary the locations (Guanacaste, Tamarindo, Manuel Antonio, Uvita, San José, Nosara, Ojochal, Atenas, Dominical).

Return ONLY a JSON array, no markdown, no backticks, no explanation:
[
  {
    "platform": "Reddit r/CostaRicaExpats",
    "user": "realistic_username",
    "need": "Specific description of what they want to build and why (2 sentences)",
    "scale": "small|medium|large|luxury",
    "location": "Specific location in Costa Rica",
    "url": "https://www.reddit.com/r/CostaRicaExpats/",
    "relevance": 9
  }
]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: PROMPT }],
      }),
    });

    console.log("Anthropic status:", response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error body:", errText);
      return res.status(500).json({ error: `API error ${response.status}: ${errText}` });
    }

    const data = await response.json();
    const raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    console.log("Raw response:", raw.slice(0, 200));

    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");

    if (start === -1 || end === -1) {
      return res.status(200).json({ leads: [] });
    }

    const leads = JSON.parse(clean.slice(start, end + 1));
    leads.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    return res.status(200).json({ leads });

  } catch (error) {
    console.error("Handler error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
