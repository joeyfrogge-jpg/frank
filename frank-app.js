/* frankgpt — free standalone, no GPU; handles image rate limits */
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var CFG = window.FRANK_CONFIG || {};
  var state = {
    token: localStorage.getItem("frank_token") || "",
    guestKey: localStorage.getItem("frank_guest") || "",
    user: null,
    googleProfile: null,
    style: "realistic",
    duration: 10,
    aspect: "9:16",
    busy: false,
    cat: "all"
  };

  var LIB_KEY = "frank_lib_v2";
  var FEED_KEY = "frank_feed_v2";
  var STYLE_HINTS = {
    realistic: "photorealistic, highly detailed, natural lighting, 4k",
    cinematic: "cinematic lighting, film still, anamorphic, dramatic",
    animated: "animated, stylized, vibrant colors, clean shapes",
    abstract: "abstract, surreal, artistic composition, bold forms"
  };
  var RANDOM_PROMPTS = [
    "A neon-lit alley in the rain at night, reflections on wet pavement",
    "Golden hour over rolling hills, soft wind through tall grass",
    "A sleek spaceship docking at an orbital station above Earth",
    "Macro shot of dew on a spiderweb at sunrise",
    "Crowded Tokyo crossing with glowing signs",
    "A lone lighthouse on a cliff during a storm",
    "Underwater coral reef with shafts of sunlight",
    "Vintage train crossing a mountain bridge in autumn",
    "A robot painting a canvas in a sunlit studio",
    "Desert dunes at dusk, long shadows, purple sky",
    "Cozy cabin interior with fireplace and falling snow outside",
    "Aerial view of a winding river through dense forest"
  ];
  var TRENDING = [
    { title: "City Vibes", prompt: "cinematic night city skyline with light trails", cat: "urban" },
    { title: "Ocean Energy", prompt: "powerful ocean waves crashing on rocks at sunrise", cat: "nature" },
    { title: "Into the Wild", prompt: "misty forest path with sunbeams through trees", cat: "nature" },
    { title: "Forest Escape", prompt: "aerial drone shot over dense green forest canopy", cat: "nature" },
    { title: "Neon Dreams", prompt: "cyberpunk street market neon reflections rain", cat: "urban" },
    { title: "Abstract Flow", prompt: "abstract fluid ink in water purple and cyan", cat: "abstract" }
  ];

  function apiBase() {
    try {
      var ls = JSON.parse(localStorage.getItem("frank_api") || "\"\"");
      if (ls) return String(ls).replace(/\/+$/, "");
    } catch (e) {}
    return (CFG.API_BASE || "").toString().replace(/\/+$/, "");
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

  function ensureGuest() {
    if (!state.guestKey && !state.token) {
      state.guestKey = "g_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("frank_guest", state.guestKey);
    }
  }

  function loadLib() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveLib(items) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(items.slice(0, 40))); } catch (e) {}
  }
  function loadFeedStore() {
    try { return JSON.parse(localStorage.getItem(FEED_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveFeedStore(items) {
    try { localStorage.setItem(FEED_KEY, JSON.stringify(items.slice(0, 60))); } catch (e) {}
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
      renderTrending();
      renderCommunityFeed();
    }
    if (name === "library") renderLibrary();
    if (name === "settings") refreshSettings();
  }

  function enterApp() {
    var gate = $("#gate");
    if (gate) gate.classList.add("off");
    var nav = $("#nav");
    if (nav) nav.style.display = "flex";
    showScreen("explore");
  }

  function goGuest() {
    ensureGuest();
    state.token = "";
    state.googleProfile = null;
    localStorage.removeItem("frank_token");
    localStorage.removeItem("frank_google");
    state.user = { name: "Guest", plan: "guest" };
    enterApp();
    toast("Welcome — browsing as Guest");
  }

  function pollinationsUrl(prompt, w, h, seed) {
    var q = encodeURIComponent((prompt || "cinematic scene").slice(0, 200));
    var s = (typeof seed === "number" ? seed : Math.floor(Math.random() * 1e9));
    return "https://image.pollinations.ai/prompt/" + q +
      "?width=" + (w || 768) + "&height=" + (h || 1344) +
      "&nologo=true&enhance=true&seed=" + s;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Could not load image")); };
      img.src = url;
    });
  }

  function looksLikeRateLimitCard(img) {
    try {
      var c = document.createElement("canvas");
      c.width = 48;
      c.height = 48;
      var ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 48, 48);
      var d = ctx.getImageData(0, 0, 48, 48).data;
      var yellow = 0, total = 48 * 48;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2];
        if (r > 175 && g > 155 && b < 130) yellow++;
      }
      return yellow / total > 0.55;
    } catch (e) {
      return false;
    }
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function loadGeneratedImage(prompt, w, h, onStatus) {
    var attempts = 3;
    var lastErr = null;
    for (var i = 0; i < attempts; i++) {
      try {
        if (i > 0) {
          onStatus("Free image limit — waiting 50s before retry " + (i + 1) + "/" + attempts + "…");
          await sleep(50000);
        } else {
          onStatus("FrankGPT · composing frame…");
        }
        var url = pollinationsUrl(prompt, w, h, Math.floor(Math.random() * 1e9));
        var img = await loadImage(url);
        if (looksLikeRateLimitCard(img)) {
          lastErr = new Error("Free image limit reached (about 1 every 45 seconds). Wait a moment and try again.");
          continue;
        }
        return img;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Could not generate image");
  }

  function kenBurnsVideo(img, seconds, aspect) {
    return new Promise(function (resolve, reject) {
      var parts = (aspect || "9:16").split(":");
      var arW = Number(parts[0]) || 9, arH = Number(parts[1]) || 16;
      var h = 640;
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
        reject(new Error("This browser cannot record video. Try Chrome or Safari."));
        return;
      }
      var chunks = [];
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function () { reject(new Error("Recording failed")); };
      rec.onstop = function () {
        var blob = new Blob(chunks, { type: mime });
        var reader = new FileReader();
        reader.onloadend = function () {
          resolve({ blobUrl: URL.createObjectURL(blob), dataUrl: reader.result });
        };
        reader.readAsDataURL(blob);
      };
      var t0 = performance.now();
      var dur = Math.max(4, Math.min(seconds || 10, 30)) * 1000;
      var scale0 = 1.0, scale1 = 1.16;
      var panX = (Math.random() - 0.5) * 0.1;
      var panY = (Math.random() - 0.5) * 0.1;
      function draw(scale, ox, oy) {
        var iw = img.naturalWidth, ih = img.naturalHeight;
        var ir = iw / ih, cr = w / h;
        var dw, dh;
        if (ir > cr) { dh = h * scale; dw = dh * ir; }
        else { dw = w * scale; dh = dw / ir; }
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, (w - dw) / 2 + ox * w, (h - dh) / 2 + oy * h, dw, dh);
      }
      function frame(now) {
        var p = Math.min(1, (now - t0) / dur);
        var ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        draw(scale0 + (scale1 - scale0) * ease, panX * ease, panY * ease);
        if (now - t0 < dur) requestAnimationFrame(frame);
        else {
          try { rec.stop(); } catch (e) { reject(e); }
        }
      }
      rec.start(100);
      requestAnimationFrame(frame);
    });
  }

  async function frankGenerate(prompt, seconds, aspect, onStatus) {
    onStatus = onStatus || function () {};
    var parts = (aspect || "9:16").split(":");
    var arW = Number(parts[0]) || 9, arH = Number(parts[1]) || 16;
    var ih = 1024;
    var iw = Math.round(ih * arW / arH);
    var img = await loadGeneratedImage(prompt, iw, ih, onStatus);
    var secs = Math.min(seconds || 10, 30);
    onStatus("FrankGPT · rendering " + secs + "s clip…");
    return kenBurnsVideo(img, secs, aspect);
  }

  function googleClientId() {
    return (CFG.GOOGLE_CLIENT_ID || localStorage.getItem("frank_google_client_id") || "").trim();
  }

  async function loadGis() {
    if (window.google && window.google.accounts) return;
    await new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = res;
      s.onerror = function () { rej(new Error("Could not load Google Sign-In")); };
      document.head.appendChild(s);
    });
  }

  var btnGuest = $("#btn-guest");
  if (btnGuest) btnGuest.addEventListener("click", function (e) { e.preventDefault(); goGuest(); });

  var btnEmail = $("#btn-email");
  if (btnEmail) btnEmail.addEventListener("click", function (e) {
    e.preventDefault();
    toast("Email sign-in needs your FrankGPT server. Use Guest or Google for now.");
  });
  var btnPhone = $("#btn-phone");
  if (btnPhone) btnPhone.addEventListener("click", function (e) {
    e.preventDefault();
    toast("Phone sign-in needs your FrankGPT server. Use Guest or Google for now.");
  });

  var btnGoogle = $("#btn-google");
  if (btnGoogle) {
    btnGoogle.addEventListener("click", async function (e) {
      e.preventDefault();
      var cid = googleClientId();
      if (!cid) {
        toast("Add your Google OAuth Client ID in Settings.");
        return;
      }
      btnGoogle.disabled = true;
      try {
        await loadGis();
        window.google.accounts.id.initialize({
          client_id: cid,
          callback: function (resp) {
            try {
              var raw = resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
              var payload = JSON.parse(atob(raw));
              state.googleProfile = {
                name: payload.name || payload.email || "Creator",
                email: payload.email || "",
                picture: payload.picture || "",
                sub: payload.sub
              };
              state.token = "google_" + (payload.sub || Date.now());
              state.user = { name: state.googleProfile.name, plan: "google", picture: state.googleProfile.picture };
              localStorage.setItem("frank_token", state.token);
              localStorage.setItem("frank_google", JSON.stringify(state.googleProfile));
              enterApp();
              toast("Signed in as " + state.user.name);
            } catch (err) {
              toast("Google sign-in failed");
            }
          }
        });
        window.google.accounts.id.prompt();
      } catch (err) {
        toast(err.message || "Google unavailable");
      } finally {
        btnGoogle.disabled = false;
      }
    });
  }

  var btnSignout = $("#btn-signout");
  if (btnSignout) {
    btnSignout.addEventListener("click", function () {
      state.token = "";
      state.user = null;
      state.googleProfile = null;
      localStorage.removeItem("frank_token");
      localStorage.removeItem("frank_google");
      var gate = $("#gate");
      if (gate) gate.classList.remove("off");
      var nav = $("#nav");
      if (nav) nav.style.display = "none";
      $$(".screen").forEach(function (s) { s.classList.remove("on"); });
      toast("Signed out");
    });
  }

  var promptEl = $("#prompt");
  if (promptEl) {
    promptEl.addEventListener("input", function () {
      var c = $("#prompt-count");
      if (c) c.textContent = (promptEl.value || "").length;
    });
  }

  var btnRandom = $("#btn-random-prompt");
  if (btnRandom) {
    btnRandom.addEventListener("click", function () {
      var p = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
      if (promptEl) {
        promptEl.value = p;
        var c = $("#prompt-count");
        if (c) c.textContent = String(p.length);
      }
      toast("Prompt filled — edit or Generate");
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
    var tag = STYLE_HINTS[style] || "";
    return tag ? prompt.trim() + ". " + tag : prompt.trim();
  }

  var goBtn = $("#go");
  if (goBtn) {
    goBtn.addEventListener("click", async function () {
      if (state.busy) return;
      var raw = (promptEl && promptEl.value || "").trim();
      if (!raw) { showStat("Describe your idea first.", true); return; }
      ensureGuest();
      state.busy = true;
      goBtn.disabled = true;
      var result = $("#result");
      if (result) result.classList.remove("on");
      try {
        var prompt = enhance(raw, state.style);
        var out = await frankGenerate(prompt, state.duration, state.aspect, showStat);
        var vid = $("#result-vid");
        if (vid) vid.src = out.blobUrl;
        if (result) result.classList.add("on");
        var items = loadLib();
        var entry = {
          id: "fg_" + Date.now(),
          prompt: raw,
          style: state.style,
          duration: state.duration,
          aspect: state.aspect,
          dataUrl: out.dataUrl,
          created: Date.now(),
          author: (state.user && state.user.name) || "Guest"
        };
        items.unshift(entry);
        saveLib(items);
        showStat("FrankGPT " + state.duration + "s clip ready.", false, true);
        toast("Video ready");
        if (state.token && state.token.indexOf("google_") === 0) {
          var feed = loadFeedStore();
          feed.unshift({
            id: entry.id,
            prompt: raw,
            title: raw.slice(0, 48),
            dataUrl: out.dataUrl,
            author: state.user.name,
            picture: (state.googleProfile && state.googleProfile.picture) || "",
            created: Date.now()
          });
          saveFeedStore(feed);
          toast("Posted to community feed");
        }
      } catch (err) {
        showStat(err.message || "Generation failed", true);
      } finally {
        state.busy = false;
        goBtn.disabled = false;
      }
    });
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderTrending() {
    var grid = $("#trending-grid");
    if (!grid) return;
    var list = TRENDING.filter(function (t) {
      return state.cat === "all" || t.cat === state.cat;
    });
    var grads = [
      "linear-gradient(135deg,#1e3a5f,#0f172a)",
      "linear-gradient(135deg,#14532d,#052e16)",
      "linear-gradient(135deg,#4c1d95,#1e1b4b)",
      "linear-gradient(135deg,#7c2d12,#1c1917)",
      "linear-gradient(135deg,#0e7490,#164e63)",
      "linear-gradient(135deg,#9f1239,#4c0519)"
    ];
    grid.innerHTML = list.map(function (t, i) {
      return '<div class="t-card" data-prompt="' + esc(t.prompt) + '">' +
        '<div class="thumb" style="background:' + grads[i % grads.length] + '">' +
        '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
        '<div class="meta"><div class="title">' + esc(t.title) + '</div>' +
        '<div class="views">Tap to create</div></div></div>';
    }).join("");
    grid.querySelectorAll(".t-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var p = card.getAttribute("data-prompt") || "";
        if (promptEl) {
          promptEl.value = p;
          var c = $("#prompt-count");
          if (c) c.textContent = String(p.length);
        }
        showScreen("create");
        toast("Prompt loaded — Generate when ready");
      });
    });
  }

  function renderCommunityFeed() {
    var grid = $("#feed-grid");
    if (!grid) return;
    var feed = loadFeedStore();
    if (!feed.length) {
      grid.innerHTML = '<p style="color:var(--dim);font-size:13px;grid-column:1/-1;padding:8px 0">No community posts yet. Sign in with Google, generate a clip, and it will appear here.</p>';
      return;
    }
    grid.innerHTML = feed.map(function (j) {
      return '<div class="t-card" data-id="' + esc(j.id) + '">' +
        '<div class="thumb">' +
        (j.dataUrl ? '<video src="' + j.dataUrl + '" muted playsinline preload="metadata"></video>' : '') +
        '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
        '<div class="meta"><div class="title">' + esc(j.title || j.prompt || "Clip") + '</div>' +
        '<div class="views">' + esc(j.author || "Creator") + '</div></div></div>';
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
        }
      });
    });
  }

  function renderLibrary() {
    var empty = $("#lib-empty");
    var grid = $("#lib-grid");
    if (!empty || !grid) return;
    var local = loadLib();
    if (!local.length) {
      empty.style.display = "flex";
      grid.style.display = "none";
      return;
    }
    empty.style.display = "none";
    grid.style.display = "grid";
    grid.innerHTML = local.map(function (j) {
      return '<div class="t-card">' +
        '<div class="thumb"><video src="' + (j.dataUrl || "") + '" muted playsinline preload="metadata"></video>' +
        '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
        '<div class="meta"><div class="title">' + esc((j.prompt || "Untitled").slice(0, 40)) + '</div>' +
        '<div class="views">' + (j.duration || "?") + "s · " + esc(j.style || "") + "</div></div></div>";
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
  }

  $$("#cats .cat").forEach(function (c) {
    c.addEventListener("click", function () {
      $$("#cats .cat").forEach(function (x) { x.classList.remove("on"); });
      c.classList.add("on");
      state.cat = c.getAttribute("data-cat") || "all";
      renderTrending();
    });
  });

  function openModal(title, bodyHtml, bind) {
    var m = $("#modal");
    if (!m) return;
    m.innerHTML = "<h3>" + title + "</h3>" + bodyHtml;
    var bg = $("#modal-bg");
    if (bg) bg.classList.add("on");
    if (bind) bind();
  }
  function closeModal() {
    var bg = $("#modal-bg");
    if (bg) bg.classList.remove("on");
  }

  function refreshSettings() {
    var name = (state.user && state.user.name) || (state.token ? "Signed in" : "Guest");
    var el = $("#set-name");
    if (el) el.textContent = name + (state.user && state.user.plan ? " · " + state.user.plan : "");
    var urlEl = $("#set-server-url");
    if (urlEl) {
      var base = apiBase();
      urlEl.textContent = base || "Standalone free (no GPU)";
    }
  }

  var setServer = $("#set-server");
  if (setServer) {
    setServer.addEventListener("click", function () {
      var cur = apiBase() || "";
      var cid = googleClientId();
      openModal(
        "FrankGPT Settings",
        '<p style="color:var(--muted);font-size:13px;margin:0 0 12px">Optional server URL. Leave blank for free standalone (no GPU).</p>' +
        '<input class="field" id="m-server" value="' + esc(cur) + '" placeholder="https://your-server.example.com">' +
        '<p style="color:var(--muted);font-size:13px;margin:16px 0 8px">Google OAuth Client ID (Web)</p>' +
        '<input class="field" id="m-google" value="' + esc(cid) + '" placeholder="xxx.apps.googleusercontent.com">' +
        '<div class="row" style="margin-top:16px"><button type="button" class="btn btn-outline" id="m-cancel">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="m-save">Save</button></div>',
        function () {
          var c = $("#m-cancel");
          if (c) c.onclick = closeModal;
          var s = $("#m-save");
          if (s) s.onclick = function () {
            var v = ($("#m-server") && $("#m-server").value || "").trim().replace(/\/+$/, "");
            localStorage.setItem("frank_api", JSON.stringify(v));
            var g = ($("#m-google") && $("#m-google").value || "").trim();
            if (g) localStorage.setItem("frank_google_client_id", g);
            else localStorage.removeItem("frank_google_client_id");
            CFG.GOOGLE_CLIENT_ID = g;
            closeModal();
            refreshSettings();
            toast("Settings saved");
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
        "<p>Version " + esc(CFG.VERSION || "2.0") + "<br>Free path: 10s / 20s / 30s in the browser. No GPU. Image provider may rate-limit (~1 / 45s).</p>" +
        '<div class="row"><button type="button" class="btn btn-primary" id="m-ok">OK</button></div>',
        function () {
          var ok = $("#m-ok");
          if (ok) ok.onclick = closeModal;
        }
      );
    });
  }

  var modalBg = $("#modal-bg");
  if (modalBg) modalBg.addEventListener("click", function (e) { if (e.target === modalBg) closeModal(); });

  $$("#nav button[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () { showScreen(b.getAttribute("data-screen")); });
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

  try {
    var g = JSON.parse(localStorage.getItem("frank_google") || "null");
    if (g && state.token) {
      state.googleProfile = g;
      state.user = { name: g.name, plan: "google", picture: g.picture };
    }
  } catch (e) {}

  if (state.token) {
    enterApp();
  }
})();
