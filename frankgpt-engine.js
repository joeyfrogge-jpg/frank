/**
 * FRANKGPT Engine
 * Product brand: FRANKGPT
 * Backend (default): Wan 2.7 via Puter.js — top-tier T2V + I2V, no API keys for the app owner
 * No Supabase. User-pays on Puter. Ready to swap providers later.
 */
export const FRANKGPT = {
  name: "FRANKGPT",
  version: "1.0",
  t2v: "wan-ai/wan2.7-t2v",
  i2v: "wan-ai/wan2.7-i2v",
  label: "FRANKGPT · Wan 2.7",
  maxSeconds: 15,
  sizes: {
    "9:16": "720x1280",
    "16:9": "1280x720",
    "1:1": "720x720"
  }
};

export function enhancePrompt(raw, hasImage) {
  let p = (raw || "").trim();
  if (!p) {
    p = hasImage
      ? "Animate this image with natural continuous motion, cinematic lighting, coherent camera"
      : "";
  }
  if (!p) return p;
  const low = p.toLowerCase();
  const bits = [];
  if (!/cinematic|photoreal|film|realistic|hyperreal/i.test(low)) {
    bits.push("photorealistic cinematic video");
  }
  if (!/camera|drone|orbit|handheld|shot|pan|dolly|tracking/i.test(low)) {
    bits.push("smooth continuous camera motion");
  }
  if (!/no text|watermark|logo/i.test(low)) {
    bits.push("no on-screen text, no watermark");
  }
  if (bits.length) p = bits.join(", ") + ". " + p;
  return p.slice(0, 1200);
}

export async function ensureAuth(onStatus) {
  if (typeof puter === "undefined") {
    throw new Error("Puter failed to load — check connection and reload");
  }
  try {
    if (puter.auth?.isSignedIn && (await puter.auth.isSignedIn())) return;
  } catch (_) {}
  if (puter.auth?.signIn) {
    if (onStatus) onStatus("Sign in to Puter for generation…\nAllow the popup.");
    await puter.auth.signIn({ attempt_temp_user_creation: true });
  }
}

export async function resultToBlob(result) {
  if (result instanceof HTMLVideoElement) {
    const src = result.src || result.currentSrc;
    if (!src) throw new Error("Empty video element");
    const r = await fetch(src);
    const b = await r.blob();
    if (!b.size) throw new Error("Empty download");
    return b.type ? b : new Blob([b], { type: "video/mp4" });
  }
  if (result instanceof Blob) {
    if (!result.size) throw new Error("Empty blob");
    return result;
  }
  if (result && typeof result === "object") {
    const u = result.src || result.url || result.video_url || result.href;
    if (typeof u === "string") {
      const r = await fetch(u);
      const b = await r.blob();
      return b.type ? b : new Blob([b], { type: "video/mp4" });
    }
  }
  if (typeof result === "string" && /^https?:/i.test(result)) {
    const r = await fetch(result);
    const b = await r.blob();
    return b.type ? b : new Blob([b], { type: "video/mp4" });
  }
  throw new Error("No video returned from FRANKGPT");
}

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => {
    to = setTimeout(
      () => rej(new Error((label || "Request") + " timed out after " + Math.round(ms / 1000) + "s")),
      ms
    );
  });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

export async function frankgptGenerate({
  prompt,
  ar = "9:16",
  seconds = 10,
  refDataUrl = null,
  onTick = null,
  onStatus = null
} = {}) {
  const sec = Math.min(Math.max(Number(seconds) || 10, 2), FRANKGPT.maxSeconds);
  const model = refDataUrl ? FRANKGPT.i2v : FRANKGPT.t2v;
  const size = FRANKGPT.sizes[ar] || FRANKGPT.sizes["9:16"];
  const enhanced = enhancePrompt(prompt, !!refDataUrl);

  await ensureAuth(onStatus);

  const puterOpts = {
    prompt: enhanced,
    model,
    seconds: sec,
    size
  };
  if (refDataUrl) puterOpts.input_reference = refDataUrl;

  const started = Date.now();
  let tickTimer = null;
  if (onTick) {
    onTick(0);
    tickTimer = setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 1000);
  }

  try {
    if (onStatus) onStatus("FRANKGPT · " + sec + "s · Generating…");
    const result = await withTimeout(
      puter.ai.txt2vid(puterOpts),
      600000,
      "FRANKGPT"
    );
    const blob = await resultToBlob(result);
    return {
      blob,
      meta: {
        prompt: enhanced,
        model,
        seconds: sec,
        ar,
        engine: FRANKGPT.name,
        version: FRANKGPT.version,
        ts: Date.now()
      }
    };
  } finally {
    if (tickTimer) clearInterval(tickTimer);
  }
}

export function friendlyError(e) {
  const m = String(e?.message || e || "");
  const code = e?.code || e?.errorCode || "";
  if (code === "insufficient_funds" || /insufficient/i.test(m)) {
    return "Not enough Puter credits.\nAdd credits at puter.com or try a shorter clip.";
  }
  if (code === "popup_blocked") return "Allow popups for Puter sign-in, then try again.";
  if (/model not found|not found|deprecated/i.test(m)) {
    return "Video model temporarily unavailable.\nReload and try again.";
  }
  if (/timed out/i.test(m)) return "Generation timed out. Try 5–10s on a strong connection.";
  if (/cancelled/i.test(m)) return "Cancelled.";
  return m.slice(0, 280);
}
