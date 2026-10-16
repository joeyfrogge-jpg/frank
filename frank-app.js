/* FRANK v1.1 — core from history + generate() with hard timeout */
(async function () {
  const CORE_URL = "https://raw.githubusercontent.com/joeyfrogge-jpg/frank/9e3038e6cd948e9cfe2ac970b81709f9f11b999d/frank-app.js";
  const r = await fetch(CORE_URL + "?v=1.1b");
  if (!r.ok) throw new Error("Could not load FRANK core (" + r.status + ")");
  const code = await r.text();
  // Run core in non-strict script scope so let/const bindings work as the original expected
  const s = document.createElement("script");
  s.textContent = code;
  document.head.appendChild(s);

  // Wait a tick for the classic script to bind #go
  await new Promise(r => setTimeout(r, 0));

  // Patch generate with hard timeout + server checks
  const go = document.getElementById("go");
  if (!go) throw new Error("#go button missing");

  let patchBusy = false;
  let patchAbort = null;

  async function generateFixed() {
    if (patchBusy) return;
    const promptEl = document.getElementById("prompt");
    const raw = (promptEl && promptEl.value || "").trim();
    // ref is from core script — may live on window after classic script
    const hasRef = !!(window.ref);
    if (!raw && !hasRef) {
      if (typeof stat === "function") stat("Add a prompt or photo first.", true);
      else alert("Add a prompt or photo first.");
      return;
    }

    const base = (typeof apiBase === "function") ? apiBase() : "";
    if (!base) {
      const msg = "No FRANKGPT server configured.\nOpen More \u2192 Settings \u2192 set server URL\n(e.g. http://YOUR-IP:8000), then Save.";
      if (typeof stat === "function") stat(msg, true); else alert(msg);
      return;
    }
    if (typeof server !== "undefined" && !server.online) {
      if (typeof checkServer === "function") await checkServer();
      if (!server.online) {
        const msg = "FRANKGPT server offline.\nStart: python3 server/server.py\nThen set the URL in Settings.";
        if (typeof stat === "function") stat(msg, true); else alert(msg);
        return;
      }
    }

    const seconds = (typeof LS !== "undefined") ? LS.get("fd", 10) : 10;
    const aspect = (typeof LS !== "undefined") ? LS.get("fa", "9:16") : "9:16";
    const prompt = (typeof enhance === "function") ? enhance(raw, hasRef) : raw;

    patchBusy = true;
    patchAbort = new AbortController();
    let jobId = null;
    go.disabled = true;
    go.classList.add("busy");
    const result = document.getElementById("result");
    if (result) result.classList.remove("on");
    if (typeof lockUI === "function") lockUI(true);

    const MAX_WAIT_MS = Math.max(120000, Number(seconds) * 30000);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
      if (typeof stat === "function") stat("FRANKGPT \u00b7 " + seconds + "s\nSubmitting job\u2026");
      let job = await api("/generations", {
        method: "POST",
        signal: patchAbort.signal,
        body: {
          prompt,
          duration: seconds,
          aspect,
          mode: hasRef ? "i2v" : "t2v",
          reference_image: hasRef && window.ref ? window.ref.dataUrl : undefined
        }
      });
      jobId = job.id || job.job_id;
      if (!jobId) throw new Error(job.message || job.error || "No job id from server.");

      const norm = s => String(s || "").toLowerCase();
      let status = norm(job.status);
      const fail = new Set(["failed", "blocked", "error", "cancelled"]);
      const ok = new Set(["succeeded", "completed"]);

      if (fail.has(status)) {
        if (typeof stat === "function") stat(job.message || job.error || "Generation blocked or failed.", true);
        return;
      }

      if (!ok.has(status)) {
        const t0 = Date.now();
        while (status === "queued" || status === "running" || status === "processing") {
          if (Date.now() - t0 > MAX_WAIT_MS) {
            throw new Error("Timed out after " + Math.round(MAX_WAIT_MS / 1000) + "s \u2014 no video.\nEngine may lack GPU or model weights. Check server logs.");
          }
          const seg = job.segment_total > 1
            ? "\nSegment " + Math.min((job.segment_done || 0) + (status === "running" ? 1 : 0), job.segment_total) + "/" + job.segment_total
            : "";
          if (typeof stat === "function") {
            stat("FRANKGPT \u00b7 " + seconds + "s \u00b7 " + status + seg + "\n" + (job.message || "") + "\n" + Math.round((Date.now() - t0) / 1000) + "s \u2014 keep this open.");
          }
          await sleep(2000);
          job = await api("/generations/" + jobId, { signal: patchAbort.signal });
          status = norm(job.status);
          if (ok.has(status) || fail.has(status)) break;
        }
      }

      status = norm(job.status);
      if (fail.has(status)) {
        if (typeof stat === "function") stat(job.message || "Generation failed.", true);
        return;
      }
      if (!ok.has(status)) throw new Error(job.message || ("Unexpected status: " + (job.status || "unknown")));
      if (!job.video_url) {
        if (typeof stat === "function") stat("Job finished but no video file was returned.", true);
        return;
      }

      if (typeof stat === "function") stat("Downloading video\u2026");
      const blob = await (await api(String(job.video_url).replace(/^\/api\/v1/, ""), { raw: true, signal: patchAbort.signal })).blob();
      if (!blob || !blob.size) throw new Error("Empty video download.");

      const meta = {
        id: jobId,
        job_id: jobId,
        prompt: job.prompt || prompt,
        ts: Date.now(),
        totalSec: job.duration || seconds,
        measuredSec: job.measured_duration || seconds,
        ar: aspect
      };
      if (typeof saveVid === "function") await saveVid(meta, blob);
      window.lastBlob = blob;
      window.lastMeta = meta;
      if (typeof lastBlob !== "undefined") { try { lastBlob = blob; } catch (_) {} }
      if (typeof lastMeta !== "undefined") { try { lastMeta = meta; } catch (_) {} }

      const v = document.getElementById("vid");
      if (v) {
        v.src = URL.createObjectURL(blob);
        v.setAttribute("playsinline", "");
      }
      if (result) result.classList.add("on");
      try { if (v) await v.play(); } catch (_) {}
      if (typeof stat === "function") {
        stat("Saved \u00b7 " + Math.round(meta.measuredSec) + "s video" + (job.watermark ? " \u00b7 watermarked" : ""), false, true);
      }
      if (typeof renderRecent === "function") renderRecent();
    } catch (e) {
      if (e && e.name === "AbortError" && jobId) {
        try { await api("/generations/" + jobId, { method: "DELETE" }); } catch (_) {}
      }
      const msg = (e && e.name === "AbortError") ? "Cancelled." : ("Failed.\n" + (e && e.message ? e.message : String(e)));
      if (typeof stat === "function") stat(msg, e && e.name !== "AbortError");
      else alert(msg);
    } finally {
      patchBusy = false;
      patchAbort = null;
      go.disabled = false;
      go.classList.remove("busy");
      if (typeof lockUI === "function") lockUI(false);
    }
  }

  go.onclick = generateFixed;
  document.getElementById("btn-cancel")?.addEventListener("click", () => {
    if (patchBusy && patchAbort) {
      if (typeof stat === "function") stat("Cancelling\u2026", true);
      patchAbort.abort();
    }
  });

  console.info("FRANK v1.1 ready \u2014 generation hard-timeout active");
})().catch(e => {
  console.error(e);
  alert("FRANK failed to load: " + e.message);
});
