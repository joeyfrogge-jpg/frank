/**
 * FRANKGPT Engine v1.3
 * Puter.js — best + fastest models available on Puter
 *
 * Speed (10–15s):  Seedance 2.0 Fast  — optimized for lower latency
 * Quality / long (16–30s): Seedance 2.5 — up to 30s, audio, top-tier
 * I2V: Seedance 2.0 Fast with input_reference (falls back to Wan I2V)
 *
 * User-pays / free Puter quota. No API keys for app owner. No Supabase.
 */
export const FRANKGPT = {
  name: "FRANKGPT",
  version: "1.3",
  // Fastest on Puter (BytePlus) — 4–15s
  fast: "dreamina-seedance-2-0-fast-260128",
  // Best quality + longest (up to 30s) on Puter
  best: "dreamina-seedance-2-5-260628",
  // Fallbacks if an id is unavailable
  fastAlt: "seedance-2-0-fast",
  bestAlt: "seedance-2-5",
  i2v: "wan-ai/wan2.7-i2v",
  i2vAlt: "dreamina-seedance-2-0-fast-260128",
  label: "FRANKGPT · Seedance",
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
              "s. Try 10s or Test sample."
          )
        ),
      ms
    );
  });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

/**
 * Fastest for short clips; best quality model for longer (up to 30s).
 */
function pickModel(seconds, hasImage) {
  if (hasImage) {
    // Seedance Fast handles I2V via input_reference; Wan I2V as documented alt
    return { primary: FRANKGPT.i2vAlt, fallback: FRANKGPT.i2v };
  }
  if (seconds > 15) {
    // Seedance 2.5: 4–30s, best quality on Puter for long clips
    return { primary: FRANKGPT.best, fallback: FRANKGPT.bestAlt };
  }
  // Seedance 2.0 Fast: lowest latency for 10–15s
  return { primary: FRANKGPT.fast, fallback: FRANKGPT.fastAlt };
}

function isModelMissing(err) {
  const m = String(err?.message || err || "");
  const c = err?.code || err?.errorCode || "";
  return /model not found|not found|deprecated|unknown model/i.test(m) || c === "model_not_found";
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.ar]
 * @param {number} [opts.seconds] - 10–30
 * @param {string|null} [opts.refDataUrl]
 * @param {boolean} [opts.testMode]
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
  const { primary, fallback } = pickModel(sec, !!refDataUrl);
  const size = FRANKGPT.sizes[ar] || FRANKGPT.sizes["9:16"];
  const enhanced = enhancePrompt(prompt, !!refDataUrl);

  if (!testMode) {
    await ensureAuth(onStatus);
  }

  const buildOpts = (model) => {
    const puterOpts = {
      prompt: enhanced || "A simple cinematic test clip",
      model,
      seconds: sec,
      duration: sec,
      size,
      // Seedance supports native audio on Puter
      generate_audio: true
    };
    if (refDataUrl) puterOpts.input_reference = refDataUrl;
    if (testMode) {
      puterOpts.testMode = true;
      puterOpts.test_mode = true;
    }
    return puterOpts;
  };

  const started = Date.now();
  let tickTimer = null;
  if (onTick) {
    onTick(0);
    tickTimer = setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 1000);
  }

  const modelLabel =
    sec > 15 ? "Seedance 2.5 (best)" : "Seedance 2.0 Fast";

  try {
    if (onStatus) {
      if (testMode) {
        onStatus("FRANKGPT test mode · free sample (instant)…");
      } else {
        onStatus(
          "FRANKGPT · " +
            modelLabel +
            " · " +
            sec +
            "s\n" +
            "Best/fast Puter route. Often 1–5+ min.\n" +
            "Keep this tab open."
        );
      }
    }

    const waitMs = testMode ? 60000 : Math.min(600000, 180000 + sec * 15000);

    let result;
    let usedModel = primary;
    try {
      result = await withTimeout(
        puter.ai.txt2vid(buildOpts(primary)),
        waitMs,
        "FRANKGPT"
      );
    } catch (e1) {
      if (!testMode && isModelMissing(e1) && fallback && fallback !== primary) {
        if (onStatus) onStatus("Trying fallback model…");
        usedModel = fallback;
        result = await withTimeout(
          puter.ai.txt2vid(buildOpts(fallback)),
          waitMs,
          "FRANKGPT"
        );
      } else {
        throw e1;
      }
    }

    const blob = await resultToBlob(result);
    return {
      blob,
      meta: {
        prompt: enhanced,
        model: testMode ? "test-sample" : usedModel,
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
    return "Not enough Puter credits.\nAdd credits at puter.com — or use Test sample.";
  }
  if (code === "upstream_timeout" || /timed out|timeout/i.test(m)) {
    return "Provider took too long.\nTry 10s (Fast) again, or Test sample.";
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
