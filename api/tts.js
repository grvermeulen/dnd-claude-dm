export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { text, voiceId } = await req.json();
  if (!text?.trim()) return new Response(JSON.stringify({ error: "No text" }), { status: 400 });

  const VOICE = voiceId || "JBFqnCBsd6RMkjVDRZzb";

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: JSON.stringify({
      text: text.slice(0, 4500),
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.35, similarity_boost: 0.85, style: 0.55, use_speaker_boost: true }
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    return new Response(JSON.stringify({ error: err }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const audio = await r.arrayBuffer();
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
