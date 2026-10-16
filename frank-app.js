/* FRANK v1.1 — load classic core, then replace generate with hard-timeout version */
(function () {
  function showErr(msg) {
    const el = document.getElementById("stat");
    if (el) { el.className = "status on err"; el.style.display = "block"; el.textContent = msg; }
    else alert(msg);
  }
  function showStat(msg, err, ok) {
    const el = document.getElementById("stat");
    if (!el) return;
    el.className = "status on" + (err ? " err" : ok ? " ok" : "");
    el.style.display = "block";
    el.textContent = msg;
  }

  const CORE = "https://raw.githubusercontent.com/joeyfrogge-jpg/frank/9e3038e6cd948e9cfe2ac970b81709f9f11b999d/frank-app.js";
  const s = document.createElement("script");
  s.src = CORE + "?v=1.1c";
  s.onload = function () {
    const go = document.getElementById("go");
    if (!go) return showErr("FRANK UI missing #go");

    let patchBusy = false;
    let patchAbort = null;

    go.onclick = async function generateFixed() {
      if (patchBusy) return;
      const raw = (document.getElementById("prompt")?.value || "").trim();
      const hasRef = !!(window.ref);
      if (!raw && !hasRef) return showStat("Add a prompt or photo first.", true);

      // apiBase / LS / server come from the classic core when available
      let base = "";
      try {
        if (typeof apiBase === "function") base = apiBase();
        else base = (JSON.parse(localStorage.getItem("frank_api") || "\"\"") || window.FRANK_CONFIG?.API_BASE || "").toString().replace(/\/+$/, "");
      } catch { base = (window.FRANK_CONFIG?.API_BASE || "").toString().replace(/\/+$/, ""); }

      if (!base) {
        return showStat("No FRANKGPT server configured.\nOpen More \u2192 Settings \u2192 set server URL\n(e.g. http://YOUR-IP:8000), then Save.", true);
      }

      if (typeof server !== "undefined" && !server.online) {
        if (typeof checkServer === "function") await checkServer();
        if (typeof server !== "undefined" && !server.online) {
          return showStat("FRANKGPT server offline.\nStart: python3 server/server.py\nThen set the URL in Settings.", true);
        }
      }

      let seconds = 10, aspect = "9:16";
      try {
        if (typeof LS !== "undefined") { seconds = LS.get("fd", 10); aspect = LS.get("fa", "9:16"); }
        else {
          seconds = JSON.parse(localStorage.getItem("fd") || "10");
          aspect = JSON.parse(localStorage.getItem("fa") || "\"9:16\"");
        }
      } catch {}

      const prompt = (typeof enhance === "function") ? enhance(raw, hasRef) : raw;
      patchBusy = true;
      patchAbort = new AbortController();
      let jobId = null;
      go.disabled = true;
      go.classList.add("busy");
      document.getElementById("result")?.classList.remove("on");
      if (typeof lockUI === "function") lockUI(true);

      const MAX_WAIT_MS = Math.max(120000, Number(seconds) * 30000);
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      try {
        if (typeof api !== "function") throw new Error("Core API missing — reload the page.");
        showStat("FRANKGPT \u00b7 " + seconds + "s\nSubmitting job\u2026");
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

        if (fail.has(status)) return showStat(job.message || job.error || "Generation blocked or failed.", true);

        if (!ok.has(status)) {
          const t0 = Date.now();
          while (status === "queued" || status === "running" || status === "processing") {
            if (Date.now() - t0 > MAX_WAIT_MS) {
              throw new Error("Timed out after " + Math.round(MAX_WAIT_MS / 1000) + "s \u2014 no video.\nEngine may lack GPU or model weights. Check server logs.");
            }
            const seg = job.segment_total > 1
              ? "\nSegment " + Math.min((job.segment_done || 0) + (status === "running" ? 1 : 0), job.segment_total) + "/" + job.segment_total
              : "";
            showStat("FRANKGPT \u00b7 " + seconds + "s \u00b7 " + status + seg + "\n" + (job.message || "") + "\n" + Math.round((Date.now() - t0) / 1000) + "s \u2014 keep this open.");
            await sleep(2000);
            job = await api("/generations/" + jobId, { signal: patchAbort.signal });
            status = norm(job.status);
            if (ok.has(status) || fail.has(status)) break;
          }
        }

        status = norm(job.status);
        if (fail.has(status)) return showStat(job.message || "Generation failed.", true);
        if (!ok.has(status)) throw new Error(job.message || ("Unexpected status: " + (job.status || "unknown")));
        if (!job.video_url) return showStat("Job finished but no video file was returned.", true);

        showStat("Downloading video\u2026");
        const blob = await (await api(String(job.video_url).replace(/^\/api\/v1/, ""), { raw: true, signal: patchAbort.signal })).blob();
        if (!blob || !blob.size) throw new Error("Empty video download.");

        const meta = {
          id: jobId, job_id: jobId, prompt: job.prompt || prompt,
          ts: Date.now(), totalSec: job.duration || seconds,
          measuredSec: job.measured_duration || seconds, ar: aspect
        };
        if (typeof saveVid === "function") await saveVid(meta, blob);
        window.lastBlob = blob;
        window.lastMeta = meta;

        const v = document.getElementById("vid");
        if (v) { v.src = URL.createObjectURL(blob); v.setAttribute("playsinline", ""); }
        document.getElementById("result")?.classList.add("on");
        try { if (v) await v.play(); } catch (_) {}
        showStat("Saved \u00b7 " + Math.round(meta.measuredSec) + "s video" + (job.watermark ? " \u00b7 watermarked" : ""), false, true);
        if (typeof renderRecent === "function") renderRecent();
      } catch (e) {
        if (e && e.name === "AbortError" && jobId) {
          try { await api("/generations/" + jobId, { method: "DELETE" }); } catch (_) {}
        }
        const msg = (e && e.name === "AbortError") ? "Cancelled." : ("Failed.\n" + (e && e.message ? e.message : String(e)));
        showStat(msg, !(e && e.name === "AbortError"));
      } finally {
        patchBusy = false;
        patchAbort = null;
        go.disabled = false;
        go.classList.remove("busy");
        if (typeof lockUI === "function") lockUI(false);
      }
    };

    document.getElementById("btn-cancel")?.addEventListener("click", () => {
      if (patchBusy && patchAbort) {
        showStat("Cancelling\u2026", true);
        patchAbort.abort();
      }
    });

    console.info("FRANK v1.1 ready \u2014 generation hard-timeout active");
  };
  s.onerror = function () { showErr("Failed to load FRANK core from GitHub. Check network."); };
  document.head.appendChild(s);
})();
