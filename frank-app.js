/* frankgpt — full UI controller matching the design mockups. Self-contained. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- state ----------
  const state = {
    token: localStorage.getItem("frank_token") || "",
    guestKey: localStorage.getItem("frank_guest") || "",
    user: null,
    health: null,
    style: "realistic",
    duration: 10,
    aspect: "9:16",
    busy: false,
    abort: null,
  };

  // ---------- utils ----------
  function apiBase() {
    try {
      const ls = JSON.parse(localStorage.getItem("frank_api") || "\"\"");
      if (ls) return String(ls).replace(/\/+$/, "");
    } catch {}
    return (window.FRANK_CONFIG?.API_BASE || "").toString().replace(/\/+$/, "");
  }

  function toast(msg, ms = 2800) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("on"), ms);
  }

  function showStat(msg, err, ok) {
    const el = $("#stat");
    if (!el) return;
    el.className = "status on" + (err ? " err" : ok ? " ok" : "");
    el.textContent = msg;
  }

  function hideStat() {
    const el = $("#stat");
    if (el) el.className = "status";
  }

  async function api(path, opts = {}) {
    const base = apiBase();
    const url = (base || "") + "/api/v1" + path;
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;
    if (state.guestKey && !state.token) headers["X-Guest-Key"] = state.guestKey;
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!res.ok) {
      const err = new Error(data.message || data.error || res.statusText || "Request failed");
      err.status = res.status;
      err.code = data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  function ensureGuest() {
    if (!state.guestKey && !state.token) {
      state.guestKey = "g_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("frank_guest", state.guestKey);
    }
  }

  // ---------- screens ----------
  function showScreen(name) {
    $$(".screen").forEach((s) => s.classList.remove("on"));
    const el = $("#screen-" + name);
    if (el) el.classList.add("on");
    $$("#nav button[data-screen]").forEach((b) => {
      b.classList.toggle("on", b.dataset.screen === name && !b.classList.contains("fab"));
      if (b.classList.contains("fab")) b.classList.toggle("on", name === "create");
    });
    if (name === "explore") {
      $$("#nav button[data-screen=explore]").forEach((b) => b.classList.add("on"));
    }
    if (name === "library") loadLibrary();
    if (name === "explore") loadFeed();
    if (name === "settings") refreshSettings();
  }

  function enterApp() {
    $("#gate").classList.add("off");
    $("#nav").style.display = "flex";
    showScreen("explore");
    checkHealth();
  }

  // ---------- auth ----------
  function hideAuthForms() {
    $$(".auth-panel").forEach((p) => p.classList.remove("on"));
    $("#gate-btns").style.display = "flex";
  }

  $("#btn-email")?.addEventListener("click", () => {
    $("#gate-btns").style.display = "none";
    $("#form-email").classList.add("on");
  });
  $("#email-back")?.addEventListener("click", hideAuthForms);

  $("#btn-phone")?.addEventListener("click", () => {
    $("#gate-btns").style.display = "none";
    $("#form-phone").classList.add("on");
  });
  $("#phone-back")?.addEventListener("click", hideAuthForms);

  $("#btn-guest")?.addEventListener("click", () => {
    ensureGuest();
    state.token = "";
    localStorage.removeItem("frank_token");
    state.user = { name: "Guest", plan: "guest" };
    enterApp();
  });

  $("#email-submit")?.addEventListener("click", async () => {
    const email = $("#email-addr").value.trim();
    const password = $("#email-pass").value;
    const name = ($("#email-name").value || "Creator").trim();
    if (!email || password.length < 8) return toast("Email + password (8+) required");
    try {
      let data;
      try {
        data = await api("/auth/login", { method: "POST", body: { email, password } });
      } catch (e) {
        if (e.status === 401 || e.code === "bad_login") {
          data = await api("/auth/register", { method: "POST", body: { email, password, name } });
        } else throw e;
      }
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("frank_token", state.token);
      enterApp();
    } catch (e) {
      toast(e.message || "Auth failed");
    }
  });

  let phoneSent = false;
  $("#phone-submit")?.addEventListener("click", async () => {
    const phone = $("#phone-num").value.trim();
    const code = $("#phone-code").value.trim();
    const name = ($("#phone-name").value || "Creator").trim();
    try {
      if (!phoneSent) {
        await api("/auth/phone/start", { method: "POST", body: { phone } });
        phoneSent = true;
        $("#phone-code").style.display = "block";
        toast("Code sent");
      } else {
        const data = await api("/auth/phone/verify", { method: "POST", body: { phone, code, name } });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem("frank_token", state.token);
        enterApp();
      }
    } catch (e) {
      toast(e.message || "Phone auth failed");
    }
  });

  $("#btn-google")?.addEventListener("click", async () => {
    try {
      const h = state.health || (await api("/health"));
      if (!h.google_client_id) {
        toast("Google sign-in not configured on this server");
        return;
      }
      if (!window.google?.accounts) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://accounts.google.com/gsi/client";
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      window.google.accounts.id.initialize({
        client_id: h.google_client_id,
        callback: async (resp) => {
          try {
            const data = await api("/auth/google", { method: "POST", body: { credential: resp.credential } });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem("frank_token", state.token);
            enterApp();
          } catch (e) {
            toast(e.message || "Google sign-in failed");
          }
        },
      });
      window.google.accounts.id.prompt();
    } catch (e) {
      toast(e.message || "Could not start Google sign-in");
    }
  });

  $("#btn-signout")?.addEventListener("click", async () => {
    try { if (state.token) await api("/auth/logout", { method: "POST" }); } catch {}
    state.token = "";
    state.user = null;
    localStorage.removeItem("frank_token");
    $("#gate").classList.remove("off");
    $("#nav").style.display = "none";
    $$(".screen").forEach((s) => s.classList.remove("on"));
    hideAuthForms();
  });

  // ---------- health ----------
  async function checkHealth() {
    try {
      state.health = await api("/health");
      const url = apiBase() || (location.origin + " (same origin)");
      const el = $("#set-server-url");
      if (el) el.textContent = url + (state.health.ready ? " · ready" : " · engine offline");
    } catch {
      const el = $("#set-server-url");
      if (el) el.textContent = (apiBase() || "not set") + " · unreachable";
    }
  }

  // ---------- create ----------
  $("#prompt")?.addEventListener("input", () => {
    $("#prompt-count").textContent = ($("#prompt").value || "").length;
  });

  $$("#styles .chip").forEach((c) =>
    c.addEventListener("click", () => {
      $$("#styles .chip").forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      state.style = c.dataset.style;
    })
  );
  $$("#durs .chip").forEach((c) =>
    c.addEventListener("click", () => {
      $$("#durs .chip").forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      state.duration = Number(c.dataset.dur) || 10;
    })
  );
  $$("#aspects .chip").forEach((c) =>
    c.addEventListener("click", () => {
      $$("#aspects .chip").forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      state.aspect = c.dataset.aspect || "9:16";
    })
  );

  function enhance(prompt, style) {
    const map = {
      realistic: "photorealistic, highly detailed, natural lighting",
      cinematic: "cinematic, dramatic lighting, film grain, anamorphic",
      animated: "animated, stylized, vibrant colors",
      abstract: "abstract, surreal, artistic",
    };
    const tag = map[style] || "";
    return tag ? prompt.trim() + ". " + tag : prompt.trim();
  }

  $("#go")?.addEventListener("click", async () => {
    if (state.busy) return;
    const raw = ($("#prompt").value || "").trim();
    if (!raw) return showStat("Describe your idea first.", true);

    ensureGuest();
    state.busy = true;
    state.abort = new AbortController();
    $("#go").disabled = true;
    $("#result").classList.remove("on");
    hideStat();

    const prompt = enhance(raw, state.style);
    const seconds = state.duration;
    const MAX_WAIT = Math.max(120000, seconds * 30000);

    try {
      showStat("frankgpt · " + seconds + "s\nSubmitting job…");
      let job = await api("/generations", {
        method: "POST",
        signal: state.abort.signal,
        body: {
          prompt,
          duration: seconds,
          aspect: state.aspect,
          mode: "t2v",
        },
      });
      const jobId = job.id || job.job_id;
      if (!jobId) throw new Error(job.message || "No job id");

      const norm = (s) => String(s || "").toLowerCase();
      let status = norm(job.status);
      const fail = new Set(["failed", "blocked", "error", "cancelled"]);
      const ok = new Set(["succeeded", "completed"]);

      if (fail.has(status)) {
        showStat(job.message || job.error || "Generation blocked or failed.", true);
        return;
      }

      const t0 = Date.now();
      while (!ok.has(status) && !fail.has(status)) {
        if (Date.now() - t0 > MAX_WAIT) throw new Error("Timed out — check server / GPU.");
        const seg =
          job.segment_total > 1
            ? "\nSegment " + Math.min((job.segment_done || 0) + 1, job.segment_total) + "/" + job.segment_total
            : "";
        showStat("frankgpt · " + seconds + "s · " + status + seg + "\n" + (job.message || "") + "\n" + Math.round((Date.now() - t0) / 1000) + "s");
        await new Promise((r) => setTimeout(r, 2000));
        job = await api("/generations/" + jobId, { signal: state.abort.signal });
        status = norm(job.status);
      }

      if (fail.has(status)) {
        showStat(job.message || "Failed.", true);
        return;
      }

      const videoUrl = job.video_url || ("/api/v1/generations/" + jobId + "/video");
      const full = (apiBase() || "") + videoUrl;
      const vid = $("#result-vid");
      vid.src = full;
      $("#result").classList.add("on");
      showStat("Done · " + seconds + "s video ready.", false, true);
      toast("Video ready");
      loadLibrary();
    } catch (e) {
      if (e.name === "AbortError") showStat("Cancelled.", true);
      else showStat(e.message || "Generation failed.", true);
    } finally {
      state.busy = false;
      $("#go").disabled = false;
    }
  });

  // ---------- library ----------
  async function loadLibrary() {
    const empty = $("#lib-empty");
    const grid = $("#lib-grid");
    try {
      const data = await api("/library");
      const items = data.items || data.jobs || data || [];
      if (!items.length) {
        empty.style.display = "flex";
        grid.style.display = "none";
        return;
      }
      empty.style.display = "none";
      grid.style.display = "grid";
      grid.innerHTML = items
        .map((j) => {
          const id = j.id || j.job_id;
          const url = (apiBase() || "") + (j.video_url || "/api/v1/generations/" + id + "/video");
          const title = (j.prompt || "Untitled").slice(0, 40);
          return `<div class="t-card" data-id="${id}">
            <div class="thumb"><video src="${url}" muted playsinline preload="metadata"></video>
              <div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>
            <div class="meta"><div class="title">${esc(title)}</div>
              <div class="views">${j.duration || "?"}s · ${j.status || ""}</div></div>
          </div>`;
        })
        .join("");
      grid.querySelectorAll(".t-card").forEach((card) => {
        card.addEventListener("click", () => {
          const v = card.querySelector("video");
          if (v) {
            $("#result-vid").src = v.src;
            $("#result").classList.add("on");
            showScreen("create");
            showStat("Playing from library", false, true);
          }
        });
      });
    } catch {
      empty.style.display = "flex";
      grid.style.display = "none";
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- feed / explore ----------
  async function loadFeed() {
    try {
      const data = await api("/feed");
      const items = data.items || data || [];
      const grid = $("#feed-grid");
      if (!items.length) {
        grid.innerHTML = `<p style="color:var(--dim);font-size:13px;grid-column:1/-1">No community posts yet. Create and share!</p>`;
        return;
      }
      grid.innerHTML = items
        .slice(0, 12)
        .map((j) => {
          const url = (apiBase() || "") + (j.video_url || "/api/v1/feed/" + (j.id || "") + "/video");
          return `<div class="t-card">
            <div class="thumb"><video src="${url}" muted playsinline preload="metadata"></video>
              <div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>
            <div class="meta"><div class="title">${esc((j.prompt || j.caption || "Clip").slice(0, 36))}</div>
              <div class="views">${j.views != null ? j.views + " views" : ""}</div></div>
          </div>`;
        })
        .join("");
    } catch {
      /* keep placeholders */
    }
  }

  $$("#cats .cat").forEach((c) =>
    c.addEventListener("click", () => {
      $$("#cats .cat").forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
    })
  );

  // ---------- settings ----------
  function refreshSettings() {
    const name = state.user?.name || (state.token ? "Signed in" : "Guest");
    const el = $("#set-name");
    if (el) el.textContent = name + (state.user?.plan ? " · " + state.user.plan : "");
    checkHealth();
  }

  $("#set-server")?.addEventListener("click", () => {
    const cur = apiBase() || "";
    openModal(
      "FRANKGPT Server",
      `<p>Point the app at your backend. Leave blank for same origin.</p>
       <input class="field" id="m-server" value="${esc(cur)}" placeholder="https://api.example.com">
       <div class="row"><button type="button" class="btn btn-outline" id="m-cancel">Cancel</button>
       <button type="button" class="btn btn-primary" id="m-save">Save</button></div>`,
      () => {
        $("#m-cancel").onclick = closeModal;
        $("#m-save").onclick = () => {
          const v = $("#m-server").value.trim().replace(/\/+$/, "");
          localStorage.setItem("frank_api", JSON.stringify(v));
          closeModal();
          checkHealth();
          toast(v ? "Server saved" : "Using same origin");
        };
      }
    );
  });

  $("#set-about")?.addEventListener("click", () => {
    openModal(
      "About frankgpt",
      `<p>Version frankgpt-standalone-1.0<br>AI video generator. Your UI, your API, your models.</p>
       <div class="row"><button type="button" class="btn btn-primary" id="m-ok">OK</button></div>`,
      () => ($("#m-ok").onclick = closeModal)
    );
  });

  function openModal(title, html, bind) {
    const m = $("#modal");
    m.innerHTML = `<h3>${title}</h3>` + html;
    $("#modal-bg").classList.add("on");
    if (bind) bind();
  }
  function closeModal() {
    $("#modal-bg").classList.remove("on");
  }
  $("#modal-bg")?.addEventListener("click", (e) => {
    if (e.target === $("#modal-bg")) closeModal();
  });

  // ---------- nav ----------
  $$("#nav button[data-screen]").forEach((b) => {
    b.addEventListener("click", () => showScreen(b.dataset.screen));
  });
  $("#create-back")?.addEventListener("click", () => showScreen("explore"));
  $("#set-back")?.addEventListener("click", () => showScreen("explore"));
  $("#lib-create")?.addEventListener("click", () => showScreen("create"));
  $("#btn-profile")?.addEventListener("click", () => showScreen("settings"));
  $("#lib-profile")?.addEventListener("click", () => showScreen("settings"));

  // ---------- boot ----------
  async function boot() {
    if (state.token) {
      try {
        const me = await api("/auth/me");
        state.user = me.user || me;
        enterApp();
        return;
      } catch {
        state.token = "";
        localStorage.removeItem("frank_token");
      }
    }
  }

  boot();
})();
