/* FRANK v1.1 — restore good core from git history, then patch generate() */
(async function () {
  const CORE_URL = "https://raw.githubusercontent.com/joeyfrogge-jpg/frank/9e3038e6cd948e9cfe2ac970b81709f9f11b999d/frank-app.js";
  const r = await fetch(CORE_URL + "?v=1.1");
  if (!r.ok) throw new Error("Could not load FRANK core (" + r.status + ")");
  const code = await r.text();
  (0, eval)(code);

  // ---- PATCH: never let the timer run forever ----
  window.generate = async function generate() {
    if (typeof busy !== "undefined" && busy) return;
    const raw = ($("#prompt") && $("#prompt").value || "").trim();
    const hasRef = typeof ref !== "undefined" && ref;
    if (!raw && !hasRef) { stat("Add a prompt or photo first.", true); return; }

    const base = (typeof apiBase === "function") ? apiBase() : "";
    if (!base) {
      stat("No FRANKGPT server configured.\nOpen More \u2192 Settings \u2192 set server URL\n(e.g. http://YOUR-IP:8000), then Save.", true);
      return;
    }
    if (typeof server !== "undefined" && !server.online) {
      if (typeof checkServer === "function") await checkServer();
      if (!server.online) {
        stat("FRANKGPT server offline.\nStart: python3 server/server.py\nThen set the URL in Settings.", true);
        return;
      }
    }

    const seconds = (typeof LS !== "undefined" ? LS.get("fd", 10) : 10);
    const aspect = (typeof LS !== "undefined" ? LS.get("fa", "9:16") : "9:16");
    const prompt = (typeof enhance === "function") ? enhance(raw, !!hasRef) : raw;
    busy = true;
    abort = new AbortController();
    let jobId = null;
    $("#go").disabled = true;
    $("#go").classList.add("busy");
    $("#result").classList.remove("on");
    if (typeof lockUI === "function") lockUI(true);

    const MAX_WAIT_MS = Math.max(120000, seconds * 30000);
    try {
      stat("FRANKGPT \u00b7 " + seconds + "s\nSubmitting job\u2026");
      let job = await api("/generations", {
        method: "POST",
        signal: abort.signal,
        body: {
          prompt,
          duration: seconds,
          aspect,
          mode: hasRef ? "i2v" : "t2v",
          reference_image: hasRef ? ref.dataUrl : undefined
        }
      });
      jobId = job.id || job.job_id;
      if (!jobId) throw new Error(job.message || job.error || "No job id from server.");

      const norm = s => String(s || "").toLowerCase();
      let status = norm(job.status);
      const fail = new Set(["failed", "blocked", "error", "cancelled"]);
      const ok = new Set(["succeeded", "completed"]);

      if (fail.has(status)) {
        stat(job.message || job.error || "Generation blocked or failed.", true);
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
          stat("FRANKGPT \u00b7 " + seconds + "s \u00b7 " + status + seg + "\n" + (job.message || "") + "\n" + Math.round((Date.now() - t0) / 1000) + "s \u2014 keep this open.");
          await sleep(2000);
          job = await api("/generations/" + jobId, { signal: abort.signal });
          status = norm(job.status);
          if (ok.has(status) || fail.has(status)) break;
        }
      }

      status = norm(job.status);
      if (fail.has(status)) {
        stat(job.message || "Generation failed.", true);
        return;
      }
      if (!ok.has(status)) throw new Error(job.message || ("Unexpected status: " + (job.status || "unknown")));
      if (!job.video_url) {
        stat("Job finished but no video file was returned.", true);
        return;
      }

      stat("Downloading video\u2026");
      const blob = await (await api(job.video_url.replace(/^\/api\/v1/, ""), { raw: true, signal: abort.signal })).blob();
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
      await saveVid(meta, blob);
      lastBlob = blob;
      lastMeta = meta;
      const v = $("#vid");
      v.src = URL.createObjectURL(blob);
      v.setAttribute("playsinline", "");
      $("#result").classList.add("on");
      try { await v.play(); } catch (_) {}
      stat("Saved \u00b7 " + Math.round(meta.measuredSec) + "s video" + (job.watermark ? " \u00b7 watermarked" : ""), false, true);
      if (typeof renderRecent === "function") renderRecent();
    } catch (e) {
      if (e && e.name === "AbortError" && jobId) api("/generations/" + jobId, { method: "DELETE" }).catch(() => {});
      stat((e && e.name === "AbortError" ? "" : "Failed.\n") + (typeof friendly === "function" ? friendly(e) : String(e && e.message || e)), !(e && e.name === "AbortError"));
    } finally {
      busy = false;
      abort = null;
      $("#go").disabled = false;
      $("#go").classList.remove("busy");
      if (typeof lockUI === "function") lockUI(false);
    }
  };

  // Re-bind the create button to the patched generate
  const go = document.getElementById("go");
  if (go) go.onclick = window.generate;

  console.info("FRANK v1.1 loaded \u2014 generation timer hard-stop active");
})().catch(e => {
  console.error(e);
  alert("FRANK failed to load: " + e.message);
});
