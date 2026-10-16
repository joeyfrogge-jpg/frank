/* frankgpt — full UI controller. Gate + all screens. Works on static (GitHub Pages) and with a live API. */
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var state = {
    token: localStorage.getItem("frank_token") || "",
    guestKey: localStorage.getItem("frank_guest") || "",
    user: null,
    health: null,
    online: false,
    style: "realistic",
    duration: 10,
    aspect: "9:16",
    busy: false,
    abort: null,
    phoneSent: false
  };

  function apiBase() {
    try {
      var ls = JSON.parse(localStorage.getItem("frank_api") || "\"\"");
      if (ls) return String(ls).replace(/\/+$/, "");
    } catch (e) {}
    return (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE || "").toString().replace(/\/+$/, "");
  }

  function toast(msg, ms) {
    ms = ms || 3200;
    var el = $("#toast");
    if (!el) { try { alert(msg); } catch (e) {} return; }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("on"); }, ms);
  }

  function showStat(msg, err, ok) {
    var el = $("#stat");
    if (!el) return;
    el.className = "status on" + (err ? " err" : ok ? " ok" : "");
    el.textContent = msg;
  }

  function hideStat() {
    var el = $("#stat");
    if (el) el.className = "status";
  }

  function ensureGuest() {
    if (!state.guestKey && !state.token) {
      state.guestKey = "g_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("frank_guest", state.guestKey);
    }
  }

  async function api(path, opts) {
    opts = opts || {};
    var base = apiBase();
    var url = (base || "") + "/api/v1" + path;
    var headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;
    if (state.guestKey && !state.token) headers["X-Guest-Key"] = state.guestKey;

    var res;
    try {
      res = await fetch(url, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal || null
      });
    } catch (netErr) {
      var e = new Error("network");
      e.status = 0;
      e.code = "network";
      throw e;
    }

    var text = await res.text();
    var looksHtml = /^\s*</.test(text) || /<html/i.test(text) || /405 Not Allowed/i.test(text);
    if (looksHtml || res.status === 405 || res.status === 404) {
      var e2 = new Error("static_host");
      e2.status = res.status || 405;
      e2.code = "static_host";
      throw e2;
    }
    var data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) {
      var e3 = new Error("static_host");
      e3.status = res.status;
      e3.code = "static_host";
      throw e3;
    }
    if (!res.ok) {
      var err = new Error(data.message || data.error || res.statusText || "Request failed");
      err.status = res.status;
      err.code = data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  function showScreen(name) {
    $$(".screen").forEach(function (s) { s.classList.remove("on"); });
    var el = $("#screen-" + name);
    if (el) el.classList.add("on");
    $$("#nav button[data-screen]").forEach(function (b) {
      var isFab = b.classList.contains("fab");
      if (isFab) b.classList.toggle("on", name === "create");
      else b.classList.toggle("on", b.getAttribute("data-screen") === name);
    });
    if (name === "explore") {
      $$("#nav button[data-screen=explore]").forEach(function (b) { b.classList.add("on"); });
    }
    if (name === "library") loadLibrary();
    if (name === "explore") loadFeed();
    if (name === "settings") refreshSettings();
  }

  function enterApp() {
    var gate = $("#gate");
    if (gate) gate.classList.add("off");
    var nav = $("#nav");
    if (nav) nav.style.display = "flex";
    showScreen("explore");
    checkHealth();
  }

  function hideAuthForms() {
    $$(".auth-panel").forEach(function (p) { p.classList.remove("on"); });
    var btns = $("#gate-btns");
    if (btns) btns.style.display = "flex";
  }

  function goGuest() {
    ensureGuest();
    state.token = "";
    localStorage.removeItem("frank_token");
    state.user = { name: "Guest", plan: "guest" };
    enterApp();
    toast("Welcome — browsing as Guest");
  }

  var btnGuest = $("#btn-guest");
  if (btnGuest) {
    btnGuest.addEventListener("click", function (e) {
      e.preventDefault();
      goGuest();
    });
  }

  var btnEmail = $("#btn-email");
  if (btnEmail) {
    btnEmail.addEventListener("click", function (e) {
      e.preventDefault();
      var btns = $("#gate-btns");
      if (btns) btns.style.display = "none";
      var form = $("#form-email");
      if (form) form.classList.add("on");
    });
  }
  var emailBack = $("#email-back");
  if (emailBack) emailBack.addEventListener("click", function (e) { e.preventDefault(); hideAuthForms(); });

  var btnPhone = $("#btn-phone");
  if (btnPhone) {
    btnPhone.addEventListener("click", function (e) {
      e.preventDefault();
      var btns = $("#gate-btns");
      if (btns) btns.style.display = "none";
      var form = $("#form-phone");
      if (form) form.classList.add("on");
    });
  }
  var phoneBack = $("#phone-back");
  if (phoneBack) phoneBack.addEventListener("click", function (e) { e.preventDefault(); hideAuthForms(); state.phoneSent = false; });

  var emailSubmit = $("#email-submit");
  if (emailSubmit) {
    emailSubmit.addEventListener("click", async function (e) {
      e.preventDefault();
      var email = ($("#email-addr") && $("#email-addr").value || "").trim();
      var password = ($("#email-pass") && $("#email-pass").value) || "";
      var name = (($("#email-name") && $("#email-name").value) || "Creator").trim();
      if (!email || password.length < 8) {
        toast("Enter email and password (8+ characters)");
        return;
      }
      emailSubmit.disabled = true;
      emailSubmit.textContent = "Working…";
      try {
        var data;
        try {
          data = await api("/auth/login", { method: "POST", body: { email: email, password: password } });
        } catch (err) {
          if (err.status === 401 || err.code === "bad_login") {
            data = await api("/auth/register", { method: "POST", body: { email: email, password: password, name: name } });
          } else {
            throw err;
          }
        }
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem("frank_token", state.token);
        enterApp();
        toast("Signed in");
      } catch (err) {
        if (err.code === "network" || err.code === "static_host" || err.status === 0) {
          toast("Server offline — use Continue as Guest, then set server in Settings");
        } else {
          toast(err.message || "Sign-in failed");
        }
      } finally {
        emailSubmit.disabled = false;
        emailSubmit.textContent = "Continue with Email";
      }
    });
  }

  var phoneSubmit = $("#phone-submit");
  if (phoneSubmit) {
    phoneSubmit.addEventListener("click", async function (e) {
      e.preventDefault();
      var phone = ($("#phone-num") && $("#phone-num").value || "").trim();
      var code = ($("#phone-code") && $("#phone-code").value || "").trim();
      var name = (($("#phone-name") && $("#phone-name").value) || "Creator").trim();
      phoneSubmit.disabled = true;
      var orig = phoneSubmit.textContent;
      phoneSubmit.textContent = "Working…";
      try {
        if (!state.phoneSent) {
          await api("/auth/phone/start", { method: "POST", body: { phone: phone } });
          state.phoneSent = true;
          var codeEl = $("#phone-code");
          if (codeEl) codeEl.style.display = "block";
          toast("Verification code sent");
        } else {
          var data = await api("/auth/phone/verify", { method: "POST", body: { phone: phone, code: code, name: name } });
          state.token = data.token;
          state.user = data.user;
          localStorage.setItem("frank_token", state.token);
          enterApp();
          toast("Signed in");
        }
      } catch (err) {
        if (err.code === "network" || err.code === "static_host" || err.status === 0) {
          toast("Server offline — use Continue as Guest");
        } else {
          toast(err.message || "Phone sign-in failed");
        }
      } finally {
        phoneSubmit.disabled = false;
        phoneSubmit.textContent = orig;
      }
    });
  }

  var btnGoogle = $("#btn-google");
  if (btnGoogle) {
    btnGoogle.addEventListener("click", async function (e) {
      e.preventDefault();
      btnGoogle.disabled = true;
      var orig = btnGoogle.innerHTML;
      btnGoogle.textContent = "Connecting…";
      try {
        var h;
        try {
          h = state.health || (await api("/health"));
          state.health = h;
          state.online = true;
        } catch (err) {
          toast("Server offline — Google needs a running FRANKGPT server. Use Continue as Guest.");
          return;
        }
        if (!h.google_client_id) {
          toast("Google sign-in is not configured on this server. Use Email or Guest.");
          return;
        }
        if (!(window.google && window.google.accounts)) {
          await new Promise(function (res, rej) {
            var s = document.createElement("script");
            s.src = "https://accounts.google.com/gsi/client";
            s.onload = res;
            s.onerror = function () { rej(new Error("Could not load Google Sign-In")); };
            document.head.appendChild(s);
          });
        }
        window.google.accounts.id.initialize({
          client_id: h.google_client_id,
          callback: async function (resp) {
            try {
              var data = await api("/auth/google", { method: "POST", body: { credential: resp.credential } });
              state.token = data.token;
              state.user = data.user;
              localStorage.setItem("frank_token", state.token);
              enterApp();
              toast("Signed in with Google");
            } catch (err) {
              toast(err.message || "Google sign-in failed");
            }
          }
        });
        window.google.accounts.id.prompt();
      } catch (err) {
        toast(err.message || "Google sign-in unavailable");
      } finally {
        btnGoogle.disabled = false;
        btnGoogle.innerHTML = orig;
      }
    });
  }

  var btnSignout = $("#btn-signout");
  if (btnSignout) {
    btnSignout.addEventListener("click", async function () {
      try { if (state.token) await api("/auth/logout", { method: "POST" }); } catch (e) {}
      state.token = "";
      state.user = null;
      localStorage.removeItem("frank_token");
      var gate = $("#gate");
      if (gate) gate.classList.remove("off");
      var nav = $("#nav");
      if (nav) nav.style.display = "none";
      $$(".screen").forEach(function (s) { s.classList.remove("on"); });
      hideAuthForms();
      toast("Signed out");
    });
  }

  async function checkHealth() {
    try {
      state.health = await api("/health");
      state.online = true;
      var url = apiBase() || (location.origin + " (same origin)");
      var el = $("#set-server-url");
      if (el) el.textContent = url + (state.health.ready ? " · ready" : " · engine offline");
    } catch (e) {
      state.online = false;
      var el2 = $("#set-server-url");
      if (el2) el2.textContent = (apiBase() || "not set") + " · unreachable";
    }
  }

  var promptEl = $("#prompt");
  if (promptEl) {
    promptEl.addEventListener("input", function () {
      var c = $("#prompt-count");
      if (c) c.textContent = (promptEl.value || "").length;
    });
  }

  $$("#styles .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $$("#styles .chip").forEach(function (x) { x.classList.remove("on"); });
      c.classList.add("on");
      state.style = c.getAttribute("data-style") || "realistic";
    });
  });
  $$("#durs .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $$("#durs .chip").forEach(function (x) { x.classList.remove("on"); });
      c.classList.add("on");
      state.duration = Number(c.getAttribute("data-dur")) || 10;
    });
  });
  $$("#aspects .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $$("#aspects .chip").forEach(function (x) { x.classList.remove("on"); });
      c.classList.add("on");
      state.aspect = c.getAttribute("data-aspect") || "9:16";
    });
  });

  function enhance(prompt, style) {
    var map = {
      realistic: "photorealistic, highly detailed, natural lighting",
      cinematic: "cinematic, dramatic lighting, film grain, anamorphic",
      animated: "animated, stylized, vibrant colors",
      abstract: "abstract, surreal, artistic"
    };
    var tag = map[style] || "";
    return tag ? prompt.trim() + ". " + tag : prompt.trim();
  }

  function makeDemoVideo(prompt, seconds, aspect) {
    return new Promise(function (resolve, reject) {
      var parts = (aspect || "9:16").split(":");
      var arW = Number(parts[0]) || 9, arH = Number(parts[1]) || 16;
      var h = 480;
      var w = Math.round(h * arW / arH);
      if (w % 2) w++;
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      var stream = canvas.captureStream(24);
      var mime = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) mime = "video/webm;codecs=vp9";
        else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) mime = "video/webm;codecs=vp8";
        else if (MediaRecorder.isTypeSupported("video/webm")) mime = "video/webm";
      }
      if (!mime) {
        reject(new Error("This browser cannot record video offline. Try Chrome or Safari."));
        return;
      }
      var chunks = [];
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1200000 });
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function () { reject(new Error("Recording failed")); };
      rec.onstop = function () {
        var blob = new Blob(chunks, { type: mime });
        resolve(URL.createObjectURL(blob));
      };

      var t0 = performance.now();
      var dur = Math.max(3, Math.min(seconds || 10, 15)) * 1000;
      var words = (prompt || "frankgpt").slice(0, 80);

      function frame(now) {
        var t = (now - t0) / 1000;
        var p = Math.min(1, (now - t0) / dur);
        var g = ctx.createLinearGradient(0, 0, w, h);
        var hue = (t * 40) % 360;
        g.addColorStop(0, "hsl(" + hue + ",55%,12%)");
        g.addColorStop(1, "hsl(" + ((hue + 80) % 360) + ",50%,22%)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        for (var i = 0; i < 4; i++) {
          var ox = w * (0.2 + 0.2 * i) + Math.sin(t * 0.8 + i) * 30;
          var oy = h * (0.3 + 0.15 * (i % 3)) + Math.cos(t * 0.6 + i) * 25;
          var rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, 80);
          rg.addColorStop(0, "hsla(" + ((hue + i * 40) % 360) + ",70%,60%,0.35)");
          rg.addColorStop(1, "hsla(" + ((hue + i * 40) % 360) + ",70%,40%,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(ox, oy, 80, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "bold " + Math.round(h * 0.06) + "px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var lines = [];
        var parts2 = words.split(/\s+/);
        var line = "";
        for (var j = 0; j < parts2.length; j++) {
          var test = line ? line + " " + parts2[j] : parts2[j];
          if (ctx.measureText(test).width > w * 0.85) {
            if (line) lines.push(line);
            line = parts2[j];
          } else line = test;
        }
        if (line) lines.push(line);
        var lh = h * 0.07;
        var startY = h * 0.42 - (lines.length - 1) * lh * 0.5;
        lines.forEach(function (ln, idx) {
          ctx.fillText(ln, w / 2, startY + idx * lh);
        });
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(w * 0.2, h * 0.85, w * 0.6, 4);
        ctx.fillStyle = "#a78bfa";
        ctx.fillRect(w * 0.2, h * 0.85, w * 0.6 * p, 4);
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText("frankgpt · demo", w / 2, h * 0.93);

        if (now - t0 < dur) {
          requestAnimationFrame(frame);
        } else {
          try { rec.stop(); } catch (e) { reject(e); }
        }
      }
      rec.start(100);
      requestAnimationFrame(frame);
    });
  }

  var goBtn = $("#go");
  if (goBtn) {
    goBtn.addEventListener("click", async function () {
      if (state.busy) return;
      var raw = (promptEl && promptEl.value || "").trim();
      if (!raw) { showStat("Describe your idea first.", true); return; }

      ensureGuest();
      state.busy = true;
      state.abort = new AbortController();
      goBtn.disabled = true;
      var result = $("#result");
      if (result) result.classList.remove("on");
      hideStat();

      var prompt = enhance(raw, state.style);
      var seconds = state.duration;
      var MAX_WAIT = Math.max(120000, seconds * 30000);

      try {
        showStat("frankgpt · " + seconds + "s\nSubmitting job…");
        var job = await api("/generations", {
          method: "POST",
          signal: state.abort.signal,
          body: { prompt: prompt, duration: seconds, aspect: state.aspect, mode: "t2v" }
        });
        var jobId = job.id || job.job_id;
        if (!jobId) throw new Error(job.message || "No job id");

        function norm(s) { return String(s || "").toLowerCase(); }
        var status = norm(job.status);
        var fail = { failed: 1, blocked: 1, error: 1, cancelled: 1 };
        var ok = { succeeded: 1, completed: 1 };

        if (fail[status]) {
          showStat(job.message || job.error || "Generation blocked or failed.", true);
          return;
        }

        var t0 = Date.now();
        while (!ok[status] && !fail[status]) {
          if (Date.now() - t0 > MAX_WAIT) throw new Error("Timed out — check server / GPU.");
          var seg = job.segment_total > 1
            ? "\nSegment " + Math.min((job.segment_done || 0) + 1, job.segment_total) + "/" + job.segment_total
            : "";
          showStat("frankgpt · " + seconds + "s · " + status + seg + "\n" + (job.message || "") + "\n" + Math.round((Date.now() - t0) / 1000) + "s");
          await new Promise(function (r) { setTimeout(r, 2000); });
          job = await api("/generations/" + jobId, { signal: state.abort.signal });
          status = norm(job.status);
        }

        if (fail[status]) {
          showStat(job.message || "Failed.", true);
          return;
        }

        var videoUrl = job.video_url || ("/api/v1/generations/" + jobId + "/video");
        var full = (apiBase() || "") + videoUrl;
        var vid = $("#result-vid");
        if (vid) vid.src = full;
        if (result) result.classList.add("on");
        showStat("Done · " + seconds + "s video ready.", false, true);
        toast("Video ready");
        loadLibrary();
      } catch (err) {
        if (err.name === "AbortError") {
          showStat("Cancelled.", true);
        } else if (err.code === "network" || err.code === "static_host" || err.status === 0 || err.status === 405) {
          try {
            showStat("Standalone demo mode\nRendering " + seconds + "s clip…");
            var blobUrl = await makeDemoVideo(raw, Math.min(seconds, 10), state.aspect);
            var vid2 = $("#result-vid");
            if (vid2) vid2.src = blobUrl;
            if (result) result.classList.add("on");
            showStat("Demo clip ready · connect a FRANKGPT server for real AI video.", false, true);
            toast("Demo video ready");
          } catch (demoErr) {
            showStat("Could not create demo video.\n" + (demoErr.message || demoErr), true);
          }
        } else {
          showStat(err.message || "Generation failed.", true);
        }
      } finally {
        state.busy = false;
        goBtn.disabled = false;
      }
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[c];
    });
  }

  async function loadLibrary() {
    var empty = $("#lib-empty");
    var grid = $("#lib-grid");
    if (!empty || !grid) return;
    try {
      var data = await api("/library");
      var items = data.items || data.jobs || data || [];
      if (!items.length) {
        empty.style.display = "flex";
        grid.style.display = "none";
        return;
      }
      empty.style.display = "none";
      grid.style.display = "grid";
      grid.innerHTML = items.map(function (j) {
        var id = j.id || j.job_id;
        var url = (apiBase() || "") + (j.video_url || "/api/v1/generations/" + id + "/video");
        var title = (j.prompt || "Untitled").slice(0, 40);
        return '<div class="t-card" data-id="' + id + '">' +
          '<div class="thumb"><video src="' + url + '" muted playsinline preload="metadata"></video>' +
          '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
          '<div class="meta"><div class="title">' + esc(title) + '</div>' +
          '<div class="views">' + (j.duration || "?") + "s · " + (j.status || "") + "</div></div></div>";
      }).join("");
      grid.querySelectorAll(".t-card").forEach(function (card) {
        card.addEventListener("click", function () {
          var v = card.querySelector("video");
          if (v) {
            var rv = $("#result-vid");
            if (rv) rv.src = v.src;
            var res = $("#result");
            if (res) res.classList.add("on");
            showScreen("create");
            showStat("Playing from library", false, true);
          }
        });
      });
    } catch (e) {
      empty.style.display = "flex";
      grid.style.display = "none";
    }
  }

  async function loadFeed() {
    try {
      var data = await api("/feed");
      var items = data.items || data || [];
      var grid = $("#feed-grid");
      if (!grid) return;
      if (!items.length) {
        grid.innerHTML = '<p style="color:var(--dim);font-size:13px;grid-column:1/-1">No community posts yet. Create and share!</p>';
        return;
      }
      grid.innerHTML = items.slice(0, 12).map(function (j) {
        var url = (apiBase() || "") + (j.video_url || "/api/v1/feed/" + (j.id || "") + "/video");
        return '<div class="t-card">' +
          '<div class="thumb"><video src="' + url + '" muted playsinline preload="metadata"></video>' +
          '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
          '<div class="meta"><div class="title">' + esc((j.prompt || j.caption || "Clip").slice(0, 36)) + '</div>' +
          '<div class="views">' + (j.views != null ? j.views + " views" : "") + "</div></div></div>";
      }).join("");
    } catch (e) {}
  }

  $$("#cats .cat").forEach(function (c) {
    c.addEventListener("click", function () {
      $$("#cats .cat").forEach(function (x) { x.classList.remove("on"); });
      c.classList.add("on");
    });
  });

  function refreshSettings() {
    var name = (state.user && state.user.name) || (state.token ? "Signed in" : "Guest");
    var el = $("#set-name");
    if (el) el.textContent = name + (state.user && state.user.plan ? " · " + state.user.plan : "");
    checkHealth();
  }

  function openModal(title, html, bind) {
    var m = $("#modal");
    if (!m) return;
    m.innerHTML = "<h3>" + title + "</h3>" + html;
    var bg = $("#modal-bg");
    if (bg) bg.classList.add("on");
    if (bind) bind();
  }
  function closeModal() {
    var bg = $("#modal-bg");
    if (bg) bg.classList.remove("on");
  }

  var setServer = $("#set-server");
  if (setServer) {
    setServer.addEventListener("click", function () {
      var cur = apiBase() || "";
      openModal(
        "FRANKGPT Server",
        '<p>Point the app at your backend. Leave blank for same origin (when UI is served by server/server.py).</p>' +
        '<input class="field" id="m-server" value="' + esc(cur) + '" placeholder="https://api.example.com or http://192.168.x.x:8000">' +
        '<div class="row"><button type="button" class="btn btn-outline" id="m-cancel">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="m-save">Save</button></div>',
        function () {
          var c = $("#m-cancel");
          if (c) c.onclick = closeModal;
          var s = $("#m-save");
          if (s) s.onclick = function () {
            var v = ($("#m-server") && $("#m-server").value || "").trim().replace(/\/+$/, "");
            localStorage.setItem("frank_api", JSON.stringify(v));
            closeModal();
            checkHealth();
            toast(v ? "Server saved: " + v : "Using same origin");
          };
        }
      );
    });
  }

  var setAbout = $("#set-about");
  if (setAbout) {
    setAbout.addEventListener("click", function () {
      openModal(
        "About frankgpt",
        "<p>Version frankgpt-standalone-1.0<br>AI video generator. Your UI, your API, your models.</p>" +
        '<div class="row"><button type="button" class="btn btn-primary" id="m-ok">OK</button></div>',
        function () {
          var ok = $("#m-ok");
          if (ok) ok.onclick = closeModal;
        }
      );
    });
  }

  var modalBg = $("#modal-bg");
  if (modalBg) {
    modalBg.addEventListener("click", function (e) {
      if (e.target === modalBg) closeModal();
    });
  }

  $$("#nav button[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () {
      showScreen(b.getAttribute("data-screen"));
    });
  });
  var createBack = $("#create-back");
  if (createBack) createBack.addEventListener("click", function () { showScreen("explore"); });
  var setBack = $("#set-back");
  if (setBack) setBack.addEventListener("click", function () { showScreen("explore"); });
  var libCreate = $("#lib-create");
  if (libCreate) libCreate.addEventListener("click", function () { showScreen("create"); });
  var btnProfile = $("#btn-profile");
  if (btnProfile) btnProfile.addEventListener("click", function () { showScreen("settings"); });
  var libProfile = $("#lib-profile");
  if (libProfile) libProfile.addEventListener("click", function () { showScreen("settings"); });

  async function boot() {
    if (state.token) {
      try {
        var me = await api("/auth/me");
        state.user = me.user || me;
        enterApp();
        return;
      } catch (e) {
        state.token = "";
        localStorage.removeItem("frank_token");
      }
    }
    checkHealth().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
