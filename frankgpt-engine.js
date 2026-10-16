/**
 * FRANKGPT Engine
 * Product brand: FRANKGPT
 * Backend: Wan 2.7 via Puter.js (user-pays). No Supabase.
 * Real AI video often takes 1–5+ minutes — that is normal for this class of model.
 */
export const FRANKGPT = {
  name: "FRANKGPT",
  version: "1.1",
  t2v: "wan-ai/wan2.7-t2v",
  i2v: "wan-ai/wan2.7-i2v",
  label: "FRANKGPT · Wan 2.7",
  maxSeconds: 15,
  defaultSeconds: 5,
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
      ? "Animate this image with natural continuous motion, cinematic lighting"
      : "";
  }
  if (!p) return p;
  const low = p.toLowerCase();
  const bits = [];
  if (!/cinematic|photoreal|film|realistic/i.test(low)) bits.push("photorealistic cinematic video");
  if (!/camera|drone|orbit|handheld|shot|pan/i.test(low)) bits.push("smooth continuous camera motion");
  if (!/no text|watermark/i.test(low)) bits.push("no on-screen text, no watermark");
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
    if (onStatus) onStatus("Sign in to Puter (needed for real generation)…\nAllow the popup.");
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
      () => rej(new Error((label || "Request") + " timed out after " + Math.round(ms / 1000) + "s. Try 5s or Test sample.")),
      ms
    );
  });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.ar]
 * @param {number} [opts.seconds] - prefer 5 for faster results
 * @param {string|null} [opts.refDataUrl]
 * @param {boolean} [opts.testMode] - free instant sample from Puter (no real model)
 * @param {function} [opts.onTick]
 * @param {function} [opts.onStatus]
 */
export async function frankgptGenerate({
  prompt,
  ar = "9:16",
  seconds = FRANKGPT.defaultSeconds,
  refDataUrl = null,
  testMode = false,
  onTick = null,
  onStatus = null
} = {}) {
  const sec = Math.min(Math.max(Number(seconds) || FRANKGPT.defaultSeconds, 2), FRANKGPT.maxSeconds);
  const model = refDataUrl ? FRANKGPT.i2v : FRANKGPT.t2v;
  const size = FRANKGPT.sizes[ar] || FRANKGPT.sizes["9:16"];
  const enhanced = enhancePrompt(prompt, !!refDataUrl);

  if (!testMode) {
    await ensureAuth(onStatus);
  }

  const puterOpts = {
    prompt: enhanced || "A simple cinematic test clip",
    model,
    seconds: sec,
    size
  };
  if (refDataUrl) puterOpts.input_reference = refDataUrl;
  // Puter free sample path — verifies UI without spending credits
  if (testMode) {
    puterOpts.testMode = true;
    puterOpts.test_mode = true;
  }

  const started = Date.now();
  let tickTimer = null;
  if (onTick) {
    onTick(0);
    tickTimer = setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 1000);
  }

  try {
    if (onStatus) {
      if (testMode) onStatus("FRANKGPT test mode · free sample (instant)…");
      else onStatus(
        "FRANKGPT · " + sec + "s · Generating…\n" +
        "Real AI video often takes 1–5 minutes.\n" +
        "Keep this tab open. Do not refresh."
      );
    }

    // Test mode: shorter client timeout; real: allow up to ~8 min (Puter allows ~10)
    const waitMs = testMode ? 60000 : 480000;

    const result = await withTimeout(
      puter.ai.txt2vid(puterOpts),
      waitMs,
      "FRANKGPT"
    );
    const blob = await resultToBlob(result);
    return {
      blob,
      meta: {
        prompt: enhanced,
        model: testMode ? "test-sample" : model,
        seconds: sec,
        ar,
        engine: FRANKGPT.name,
        version: FRANKGPT.version,
        testMode: !!testMode,
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
    return "Not enough Puter credits.\nAdd credits at puter.com — or use Test sample (free).";
  }
  if (code === "upstream_timeout" || /timed out|timeout/i.test(m)) {
    return "Provider took too long (common under load).\nTry again with 5s, or Test sample first.";
  }
  if (code === "popup_blocked") return "Allow popups for Puter sign-in, then try again.";
  if (/moderation/i.test(m) || code === "moderation_flagged") {
    return "Content filter blocked this prompt. Try different wording.";
  }
  if (/model not found|not found|deprecated/i.test(m)) {
    return "Video model temporarily unavailable. Reload and try again.";
  }
  if (/cancelled/i.test(m)) return "Cancelled.";
  return m.slice(0, 280);
}
