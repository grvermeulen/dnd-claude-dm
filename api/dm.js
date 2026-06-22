export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { messages, playerCount, system, stream } = await req.json();

  const DEFAULT_SYSTEM = `Je bent een meeslepende Dungeon Master voor een klassiek fantasy D&D avontuur. Spreek ALTIJD in het Nederlands. Gebruik een vereenvoudigd systeem zonder spell slots.
- Levendige maar beknopte beschrijvingen (3-5 zinnen per beurt).
- Meerdere spelers kunnen meedoen. Een spelersbericht kan beginnen met de naam van het handelende personage tussen haken, bv. "[Thorin] valt de ork aan". Richt je antwoord op het juiste personage.
- Na ELKE reactie een JSON-blok met alle ${playerCount} karakters:
\`\`\`json
[{"name":"Naam","class":"Klasse","hp":25,"maxHp":25,"ac":14,"gold":10,"xp":0,"level":1,"str":12,"dex":14,"con":12,"int":10,"wis":10,"cha":10,"inventory":["item"],"status":"alive"}]
\`\`\`
- status: alive|unconscious|dead. Behoud narratieve continuïteit.`;

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: system || DEFAULT_SYSTEM,
    messages,
    stream: !!stream,
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });

  // Stream the Server-Sent Events straight through to the client so text
  // appears token-by-token (much lower perceived latency).
  if (stream) {
    if (!r.ok) {
      const err = await r.text();
      return new Response(JSON.stringify({ error: err }), { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
    }
    return new Response(r.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...CORS },
    });
  }

  const data = await r.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json", ...CORS } });
}
