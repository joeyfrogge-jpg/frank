/**
 * FRANKGPT Engine
 * Product brand: FRANKGPT
 * Backend: Puter.js (user-pays / free allowance) — Wan + Seedance-class models
 * Clip length: 10–30 seconds (provider may clamp if model max is lower)
 * No Supabase. Site stays on GitHub Pages.
 */
export const FRANKGPT = {
  name: "FRANKGPT",
  version: "1.2",
  // Default T2V / I2V — Puter routes these (free for app owner; user pays or uses free quota)
  t2v: "wan-ai/wan2.7-t2v",
  i2v: "wan-ai/wan2.7-i2v",
  // Longer clips: Seedance-class often supports up to ~15–30s when available on Puter
  t2vLong: "byteplus/dreamina-seedance-2-0-260128",
  label: "FRANKGPT · Puter",
  minSeconds: 10,
  maxSeconds: 30,
  defaultSeconds: 10,
  sizes: {
    "9:16": "720x1280",
    "16:9": "1280x720",
    "1:1": "720x720"
  }
};

export function clampSeconds(seconds) {
  const n = Number(seconds);
  const base = Number.isFinite(n) ? n : FRANKGPT.defaultSeconds;
  return Math.min(Math.max(Math.round(base), FRANKGPT.minSeconds), FRANKGPT.maxSeconds);
}

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
    if (onStatus) onStatus("Sign in to Puter (free quota / credits)…\nAllow the popup.");
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
      () =>
        rej(
          new Error(
            (label || "Request") +
              " timed out after " +
              Math.round(ms / 1000) +
              "s. Try again or use Test sample."
          )
        ),
      ms
    );
  });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

/**
 * Pick model: longer requests prefer Seedance-class when available on Puter.
 */
function pickModel(seconds, hasImage) {
  if (hasImage) return FRANKGPT.i2v;
  // Prefer long-capable model when user asks for more than 15s
  if (seconds > 15 && FRANKGPT.t2vLong) return FRANKGPT.t2vLong;
  return FRANKGPT.t2v;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.ar]
 * @param {number} [opts.seconds] - clamped to 10–30
 * @param {string|null} [opts.refDataUrl]
 * @param {boolean} [opts.testMode] - free instant sample (no credits)
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
  const sec = clampSeconds(seconds);
  const model = pickModel(sec, !!refDataUrl);
  const size = FRANKGPT.sizes[ar] || FRANKGPT.sizes["9:16"];
  const enhanced = enhancePrompt(prompt, !!refDataUrl);

  if (!testMode) {
    await ensureAuth(onStatus);
  }

  const puterOpts = {
    prompt: enhanced || "A simple cinematic test clip",
    model,
    seconds: sec,
    duration: sec,
    size
  };
  if (refDataUrl) puterOpts.input_reference = refDataUrl;
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
      if (testMode) {
        onStatus("FRANKGPT test mode · free sample (instant)…");
      } else {
        onStatus(
          "FRANKGPT · " +
            sec +
            "s (max 30) · Generating via Puter…\n" +
            "Real AI video often takes 1–5+ minutes.\n" +
            "Keep this tab open. Do not refresh."
        );
      }
    }

    // Longer clips need more wait; Puter upstream ~10 min
    const waitMs = testMode ? 60000 : Math.min(600000, 180000 + sec * 15000);

    const result = await withTimeout(puter.ai.txt2vid(puterOpts), waitMs, "FRANKGPT");
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
    return "Not enough Puter credits.\nAdd free/paid credits at puter.com — or use Test sample.";
  }
  if (code === "upstream_timeout" || /timed out|timeout/i.test(m)) {
    return "Provider took too long.\nTry 10s again, or Test sample first.";
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
