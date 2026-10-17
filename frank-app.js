/* frankgpt — free standalone browser video creator
   Multi-frame Pollinations sequence + crossfade + Ken Burns + MediaRecorder
   Matches Wireframe Flow v0.3 UI */
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var CFG = window.FRANK_CONFIG || {};
  var GOOGLE_CLIENT_ID = CFG.GOOGLE_CLIENT_ID || "723846891277-mpb630dmgkvsftdqpacv4dnukh5c207m.apps.googleusercontent.com";

  var state = {
    token: localStorage.getItem("frank_token") || "",
    guestKey: localStorage.getItem("frank_guest") || "",
    user: null,
    googleProfile: null,
    style: "realistic",
    duration: 10,
    busy: false,
    creditsLeft: Number(localStorage.getItem("frank_credits") || 30),
    creditsMax: Number(localStorage.getItem("frank_credits_max") || 30),
    plan: localStorage.getItem("frank_plan") || "spark",
    lastBlob: null,
    lastMeta: null,
    currentFeedPost: null
  };

  var LIB_KEY = "frank_lib_v3";
  var FEED_KEY = "frank_feed_v3";
  var STYLE_HINTS = {
    realistic: "photorealistic, highly detailed, natural lighting, 4k",
    cinematic: "cinematic lighting, film still, anamorphic, dramatic atmosphere",
    animated: "animated, stylized, vibrant colors, clean shapes, illustration",
    abstract: "abstract, surreal, artistic composition, bold forms, dreamlike"
  };
  var RANDOM_PROMPTS = [
    "A neon-lit alley in the rain at night, reflections on wet pavement",
    "Golden hour over rolling hills, soft wind through tall grass",
    "A sleek spaceship docking at an orbital station above Earth",
    "Macro shot of dew on a spiderweb at sunrise",
    "Crowded Tokyo crossing with glowing signs and motion blur",
    "A lone lighthouse on a cliff during a storm",
    "Underwater coral reef with shafts of sunlight",
    "Vintage train crossing a mountain bridge in autumn",
    "A robot painting a canvas in a sunlit studio",
    "Desert dunes at dusk, long shadows, purple sky",
    "Cozy cabin interior with fireplace and falling snow outside",
    "Aerial view of a winding river through dense forest"
  ];
  var DEMO_FEED = [
    { id: "d1", title: "Neon Tide", prompt: "neon ocean waves at night", style: "cinematic", duration: 10, handle: "@HANDLE", live: true, gradient: "linear-gradient(135deg,#7c3aed,#ec4899)", comments: [] },
    { id: "d2", title: "Glass Hours", prompt: "crystal hourglass in soft light", style: "animated", duration: 5, handle: "@HANDLE", live: false, gradient: "linear-gradient(135deg,#0d9488,#14b8a6)", comments: [] },
    { id: "d3", title: "Paper Moon", prompt: "origami moon over quiet lake", style: "abstract", duration: 10, handle: "@HANDLE", live: true, gradient: "linear-gradient(135deg,#4f46e5,#818cf8)", comments: [] },
    { id: "d4", title: "Velvet Static", prompt: "soft static on vintage TV", style: "cinematic", duration: 15, handle: "@HANDLE", live: false, gradient: "linear-gradient(135deg,#c2410c,#f97316)", comments: [] },
    { id: "d5", title: "Low Orbit", prompt: "earth from low orbit at dawn", style: "realistic", duration: 5, handle: "@HANDLE", live: false, gradient: "linear-gradient(135deg,#1d4ed8,#3b82f6)", comments: [] }
  ];

  function loadLib() { try { return JSON.parse(localStorage.getItem(LIB_KEY) || "[]"); } catch (e) { return []; } }
  function saveLib(arr) { try { localStorage.setItem(LIB_KEY, JSON.stringify(arr.slice(0, 40))); } catch (e) {} }
  function loadFeed() {
    try {
      var f = JSON.parse(localStorage.getItem(FEED_KEY) || "null");
      if (Array.isArray(f) && f.length) return f;
    } catch (e) {}
    return DEMO_FEED.slice();
  }
  function saveFeed(arr) { try { localStorage.setItem(FEED_KEY, JSON.stringify(arr.slice(0, 60))); } catch (e) {} }

  function showScreen(name) {
    $$(".screen").forEach(function (s) { s.classList.remove("on"); });
    var el = $("#screen-" + name);
    if (el) el.classList.add("on");
    $$("#nav button").forEach(function (b) {
      var target = b.getAttribute("data-screen");
      b.classList.toggle("on", target === name);
    });
    if (name === "home") renderHome();
    if (name === "plans") refreshPlanUI();
    if (name === "settings") refreshPlanUI();
  }

  function setStatus(msg, type) {
    var el = $("#status");
    if (!el) return;
    el.className = "status on" + (type === "err" ? " err" : type === "ok" ? " ok" : "");
    el.textContent = msg || "";
  }

  function alertModal(title, body) {
    var m = $("#modal-alert");
    if (!m) { alert(title + "\n" + (body || "")); return; }
    $("#modal-alert-title").textContent = title;
    $("#modal-alert-body").textContent = body || "";
    m.classList.add("on");
  }

  function refreshCredits() {
    localStorage.setItem("frank_credits", String(state.creditsLeft));
    localStorage.setItem("frank_credits_max", String(state.creditsMax));
    ["credits-home", "credits-create", "credits-plans", "credits-set"].forEach(function (id) {
      var el = $("#" + id); if (el) el.textContent = state.creditsLeft;
    });
    ["credits-max-home", "credits-max-create", "credits-max-plans", "credits-max-set"].forEach(function (id) {
      var el = $("#" + id); if (el) el.textContent = state.creditsMax;
    });
    var cost = state.duration;
    var costEl = $("#gen-cost");
    if (costEl) costEl.textContent = cost;
  }

  function refreshAvatars() {
    var pic = state.googleProfile && state.googleProfile.picture;
    var name = (state.googleProfile && state.googleProfile.name) || (state.user && state.user.name) || "G";
    var initial = (name || "G").charAt(0).toUpperCase();
    ["avatar-home", "avatar-create", "avatar-plans", "avatar-set"].forEach(function (id) {
      var el = $("#" + id);
      if (!el) return;
      if (pic) {
        el.style.backgroundImage = "url(" + pic + ")";
        el.textContent = "";
      } else {
        el.style.backgroundImage = "";
        el.textContent = initial;
      }
    });
  }

  function refreshPlanUI() {
    var plans = {
      spark: { name: "Spark", sub: "Free · 30 credits / month" },
      maker: { name: "Maker", sub: "$9.99 · 400 credits / month" },
      director: { name: "Director", sub: "$24.99 · 1200 credits / month" },
      studio: { name: "Studio", sub: "$18 / user · team" }
    };
    var p = plans[state.plan] || plans.spark;
    var nameEl = $("#plan-name");
    var subEl = $("#plan-sub");
    var bar = $("#plan-bar");
    if (nameEl) nameEl.textContent = p.name;
    if (subEl) subEl.textContent = p.sub;
    if (bar) {
      var pct = Math.max(0, Math.min(100, (state.creditsLeft / state.creditsMax) * 100));
      bar.style.width = pct + "%";
    }
    var left = $("#plan-cr-left");
    var max = $("#plan-cr-max");
    if (left) left.textContent = state.creditsLeft;
    if (max) max.textContent = state.creditsMax;
  }

  function renderHome() {
    var feed = loadFeed();
    var grid = $("#feed-grid");
    var feat = $("#feed-featured");
    if (!grid) return;

    if (feed.length) {
      var first = feed[0];
      feat.style.display = "block";
      $("#feat-thumb").style.background = first.thumb
        ? "url(" + first.thumb + ") center/cover"
        : (first.gradient || "linear-gradient(135deg,#7c3aed,#ec4899)");
      $("#feat-title").textContent = first.title || "Untitled";
      $("#feat-meta").textContent = (first.handle || "@user") + " · " + (first.style || "").toUpperCase() + " · 0:" + String(first.duration || 10).padStart(2, "0");
      feat.onclick = function () { openFeedPost(first); };

      grid.innerHTML = feed.slice(1).map(function (p) {
        var bg = p.thumb
          ? "url(" + p.thumb + ") center/cover"
          : (p.gradient || "linear-gradient(135deg,#312e81,#1e1b4b)");
        return '<div class="feed-card" data-id="' + p.id + '">' +
          (p.live ? '<span class="badge-live">LIVE</span>' : '') +
          '<div class="thumb" style="background:' + bg + '"></div>' +
          '<div class="overlay"><div class="title">' + escapeHtml(p.title || "Untitled") + '</div>' +
          '<div class="meta">' + escapeHtml((p.style || "").toUpperCase()) + " · 0:" + String(p.duration || 10).padStart(2, "0") + '</div></div></div>';
      }).join("");
      $$(".feed-card", grid).forEach(function (card) {
        card.onclick = function () {
          var id = card.getAttribute("data-id");
          var post = feed.find(function (x) { return x.id === id; });
          if (post) openFeedPost(post);
        };
      });
    } else {
      feat.style.display = "none";
      grid.innerHTML = "";
    }

    var lib = loadLib();
    var lg = $("#lib-grid");
    if (lg) {
      if (!lib.length) {
        lg.innerHTML = '<div class="lib-empty-inline">No creations yet — make one on Create.</div>';
      } else {
        lg.innerHTML = lib.map(function (item) {
          var bg = item.thumb ? "url(" + item.thumb + ") center/cover" : "linear-gradient(135deg,#1e1b4b,#312e81)";
          return '<div class="lib-card" data-id="' + item.id + '"><div class="thumb" style="background:' + bg + '"></div>' +
            '<span class="dur">0:' + String(item.duration || 10).padStart(2, "0") + '</span></div>';
        }).join("");
        $$(".lib-card", lg).forEach(function (card) {
          card.onclick = function () {
            var id = card.getAttribute("data-id");
            var item = lib.find(function (x) { return x.id === id; });
            if (item && item.blobUrl) {
              var v = $("#result-video");
              if (v) { v.src = item.blobUrl; v.style.display = "block"; }
              showScreen("create");
            }
          };
        });
      }
    }
  }

  function escapeHtml(s) {
    var d = document.createElement("div"); d.textContent = s; return d.innerHTML;
  }

  function openFeedPost(post) {
    state.currentFeedPost = post;
    var m = $("#modal-feed");
    if (!m) return;
    var thumb = $("#modal-feed-thumb");
    if (thumb) {
      if (post.videoUrl) {
        thumb.innerHTML = '<video src="' + post.videoUrl + '" controls playsinline style="width:100%;border-radius:12px"></video>';
      } else if (post.thumb) {
        thumb.innerHTML = '<img src="' + post.thumb + '" style="width:100%;border-radius:12px" alt="">';
      } else {
        thumb.innerHTML = '<div style="aspect-ratio:16/9;background:' + (post.gradient || "#222") + ';border-radius:12px"></div>';
      }
    }
    $("#modal-feed-title").textContent = post.title || "Untitled";
    $("#modal-feed-meta").textContent = (post.handle || "@user") + " · " + (post.style || "").toUpperCase() + " · " + (post.duration || 10) + "s";
    renderComments(post);
    m.classList.add("on");
  }

  function renderComments(post) {
    var list = $("#modal-comments");
    if (!list) return;
    var comments = post.comments || [];
    if (!comments.length) {
      list.innerHTML = '<div class="dim">No comments yet.</div>';
    } else {
      list.innerHTML = comments.map(function (c) {
        return '<div class="comment"><b>' + escapeHtml(c.author || "user") + '</b> ' + escapeHtml(c.text || "") + '</div>';
      }).join("");
    }
  }

  function isRateLimitImage(img) {
    try {
      var c = document.createElement("canvas");
      c.width = 8; c.height = 8;
      var ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 8, 8);
      var d = ctx.getImageData(0, 0, 8, 8).data;
      var yellow = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i] > 180 && d[i + 1] > 160 && d[i + 2] < 100) yellow++;
      }
      return yellow > 20;
    } catch (e) { return false; }
  }

  function loadImage(url, attempt) {
    attempt = attempt || 1;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        if (isRateLimitImage(img) && attempt < 4) {
          setStatus("Rate limit detected — waiting 50s then retrying (" + attempt + "/3)…");
          setTimeout(function () {
            loadImage(url + (url.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now(), attempt + 1)
              .then(resolve).catch(reject);
          }, 50000);
        } else if (isRateLimitImage(img)) {
          reject(new Error("Free image limit reached. Wait ~45s and try again, or use a different prompt."));
        } else {
          resolve(img);
        }
      };
      img.onerror = function () {
        if (attempt < 3) {
          setTimeout(function () {
            loadImage(url + (url.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now(), attempt + 1)
              .then(resolve).catch(reject);
          }, 3000);
        } else reject(new Error("Could not load image. Check connection."));
      };
      img.src = url;
    });
  }

  function drawCover(ctx, img, w, h, scale, ox, oy) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var imgAspect = iw / ih;
    var canAspect = w / h;
    var dw, dh;
    if (imgAspect > canAspect) {
      dh = h * scale;
      dw = dh * imgAspect;
    } else {
      dw = w * scale;
      dh = dw / imgAspect;
    }
    var dx = (w - dw) / 2 + ox * w;
    var dy = (h - dh) / 2 + oy * h;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /** Multi-frame sequence: 3 related stills + crossfades + stronger Ken Burns.
   *  Feels like a short AI video instead of a single zoomed photo. */
  function multiFrameVideo(images, seconds, w, h) {
    return new Promise(function (resolve, reject) {
      if (!images || !images.length) {
        reject(new Error("No frames to animate"));
        return;
      }
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      var stream = canvas.captureStream(24);
      var rec;
      try {
        rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 3200000 });
      } catch (e1) {
        try {
          rec = new MediaRecorder(stream, { mimeType: "video/webm", videoBitsPerSecond: 2500000 });
        } catch (e2) {
          reject(new Error("MediaRecorder not supported in this browser."));
          return;
        }
      }
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        resolve(new Blob(chunks, { type: "video/webm" }));
      };
      rec.onerror = function () { reject(new Error("Recording failed")); };

      var n = images.length;
      var start = performance.now();
      var dur = seconds * 1000;
      var motions = images.map(function (_, i) {
        return {
          scaleFrom: 1.0 + (i % 2) * 0.04,
          scaleTo: 1.22 + (i % 3) * 0.06,
          ox: (Math.random() - 0.5) * 0.14,
          oy: (Math.random() - 0.5) * 0.12
        };
      });

      function easeInOut(p) {
        return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      }

      function draw(t) {
        var p = Math.min(1, (t - start) / dur);
        var segF = p * n;
        var seg = Math.min(n - 1, Math.floor(segF));
        var local = segF - seg;
        var fade = 0;
        if (local > 0.72 && seg < n - 1) {
          fade = (local - 0.72) / 0.28;
        }
        var easeLocal = easeInOut(Math.min(1, local / 0.72));

        var m0 = motions[seg];
        var scale0 = m0.scaleFrom + (m0.scaleTo - m0.scaleFrom) * easeLocal;
        var ox0 = m0.ox * (1 - easeLocal);
        var oy0 = m0.oy * (1 - easeLocal);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        drawCover(ctx, images[seg], w, h, scale0, ox0, oy0);

        if (fade > 0 && seg + 1 < n) {
          var m1 = motions[seg + 1];
          var scale1 = m1.scaleFrom + (m1.scaleTo - m1.scaleFrom) * (fade * 0.3);
          ctx.globalAlpha = fade;
          drawCover(ctx, images[seg + 1], w, h, scale1, m1.ox * 0.3, m1.oy * 0.3);
          ctx.globalAlpha = 1;
        }

        if (p < 1) {
          requestAnimationFrame(draw);
        } else {
          rec.stop();
        }
      }
      rec.start(100);
      requestAnimationFrame(draw);
    });
  }

  function videoToThumb(blob) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      v.onloadeddata = function () {
        v.currentTime = Math.min(0.5, (v.duration || 1) * 0.1);
      };
      v.onseeked = function () {
        try {
          var c = document.createElement("canvas");
          c.width = 320;
          c.height = 180;
          c.getContext("2d").drawImage(v, 0, 0, 320, 180);
          resolve(c.toDataURL("image/jpeg", 0.7));
        } catch (e) {
          resolve(null);
        }
        URL.revokeObjectURL(url);
      };
      v.onerror = function () { resolve(null); URL.revokeObjectURL(url); };
    });
  }

  async function generate() {
    if (state.busy) return;
    var prompt = ($("#prompt").value || "").trim();
    if (!prompt) {
      setStatus("Describe your idea first.", "err");
      return;
    }
    var cost = state.duration;
    if (state.creditsLeft < cost) {
      setStatus("Not enough credits. Upgrade on the Plans tab or wait for monthly refresh.", "err");
      return;
    }

    state.busy = true;
    $("#btn-generate").disabled = true;
    $("#result-actions").classList.remove("on");
    var v = $("#result-video");
    var ph = $("#preview-ph");
    v.style.display = "none";
    v.removeAttribute("src");
    ph.style.display = "block";

    var styleHint = STYLE_HINTS[state.style] || STYLE_HINTS.realistic;
    // Three sequential beats so the clip has motion / progression (not one still)
    var variants = [
      prompt + ", opening shot, establishing frame, " + styleHint + ", cinematic composition, high quality",
      prompt + ", mid action, dynamic moment, camera closer, " + styleHint + ", high detail",
      prompt + ", final beat, resolution, slight camera pull back, " + styleHint + ", dramatic lighting"
    ];
    var seedBase = Math.floor(Math.random() * 1e9);

    try {
      var frames = [];
      for (var i = 0; i < variants.length; i++) {
        setStatus("Generating frame " + (i + 1) + "/" + variants.length + "…");
        var enc = encodeURIComponent(variants[i]);
        var imgUrl = "https://image.pollinations.ai/prompt/" + enc +
          "?width=768&height=1344&nologo=true&seed=" + (seedBase + i * 17);
        var img = await loadImage(imgUrl);
        frames.push(img);
      }
      setStatus("Compositing " + state.duration + "s multi-frame video…");
      var blob = await multiFrameVideo(frames, state.duration, 720, 1280);
      state.lastBlob = blob;
      state.lastMeta = {
        prompt: prompt,
        style: state.style,
        duration: state.duration,
        created: Date.now()
      };
      var url = URL.createObjectURL(blob);
      v.src = url;
      v.style.display = "block";
      ph.style.display = "none";
      $("#result-actions").classList.add("on");

      state.creditsLeft = Math.max(0, state.creditsLeft - cost);
      localStorage.setItem("frank_credits", String(state.creditsLeft));
      refreshCredits();
      refreshPlanUI();
      setStatus("frankgpt " + state.duration + "s video ready.", "ok");
    } catch (err) {
      setStatus(err.message || String(err), "err");
    } finally {
      state.busy = false;
      $("#btn-generate").disabled = false;
    }
  }

  async function saveToLibrary() {
    if (!state.lastBlob) return;
    var thumb = await videoToThumb(state.lastBlob);
    var id = "lib-" + Date.now();
    var blobUrl = URL.createObjectURL(state.lastBlob);
    var item = {
      id: id,
      prompt: state.lastMeta.prompt,
      style: state.lastMeta.style,
      duration: state.lastMeta.duration,
      thumb: thumb,
      blobUrl: blobUrl,
      created: Date.now()
    };
    var lib = loadLib();
    lib.unshift(item);
    saveLib(lib);
    setStatus("Saved to library.", "ok");
    renderHome();
  }

  async function postToFeed() {
    if (!state.lastBlob) return;
    var thumb = await videoToThumb(state.lastBlob);
    var videoUrl = URL.createObjectURL(state.lastBlob);
    var handle = "@guest";
    if (state.googleProfile) handle = "@" + (state.googleProfile.name || "user").replace(/\s+/g, "").slice(0, 12);
    else if (state.user) handle = "@" + (state.user.name || "user").replace(/\s+/g, "").slice(0, 12);

    var post = {
      id: "p-" + Date.now(),
      title: (state.lastMeta.prompt || "Untitled").slice(0, 40),
      prompt: state.lastMeta.prompt,
      style: state.lastMeta.style,
      duration: state.lastMeta.duration,
      handle: handle,
      live: true,
      thumb: thumb,
      videoUrl: videoUrl,
      gradient: "linear-gradient(135deg,#7c3aed,#ec4899)",
      comments: [],
      created: Date.now()
    };
    var feed = loadFeed();
    feed.unshift(post);
    saveFeed(feed);
    setStatus("Posted to live feed.", "ok");
    renderHome();
  }

  function downloadVideo() {
    if (!state.lastBlob) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(state.lastBlob);
    a.download = "frankgpt-" + Date.now() + ".webm";
    a.click();
  }

  function enterApp(profile) {
    state.user = profile || { name: "Guest", email: "" };
    if (profile && profile.picture) state.googleProfile = profile;
    localStorage.setItem("frank_token", state.token || "guest");
    $("#gate").classList.add("off");
    refreshCredits();
    refreshAvatars();
    refreshPlanUI();
    showScreen("home");
  }

  function signOut() {
    state.token = "";
    state.user = null;
    state.googleProfile = null;
    localStorage.removeItem("frank_token");
    localStorage.removeItem("frank_guest");
    $("#gate").classList.remove("off");
    showScreen("home");
  }

  function initGoogle() {
    if (!GOOGLE_CLIENT_ID || !window.google || !google.accounts) return;
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function (resp) {
          try {
            var payload = JSON.parse(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"));
            state.googleProfile = {
              name: payload.name || payload.email || "Creator",
              email: payload.email || "",
              picture: payload.picture || "",
              sub: payload.sub
            };
            state.token = "google_" + (payload.sub || Date.now());
            state.user = { name: state.googleProfile.name, plan: "google" };
            localStorage.setItem("frank_token", state.token);
            localStorage.setItem("frank_google", JSON.stringify(state.googleProfile));
            enterApp(state.googleProfile);
          } catch (e) { alertModal("Sign-in error", "Could not parse Google response."); }
        }
      });
    } catch (e) {}
  }

  function boot() {
    // Nav
    $$("#nav button[data-screen]").forEach(function (b) {
      b.addEventListener("click", function () {
        showScreen(b.getAttribute("data-screen"));
      });
    });

    // Gate buttons
    var bg = $("#btn-google");
    if (bg) bg.addEventListener("click", function () {
      if (window.google && google.accounts) {
        google.accounts.id.prompt();
      } else {
        alertModal("Google Sign-In", "Loading Google… try again in a moment, or continue as Guest.");
      }
    });
    var be = $("#btn-email");
    if (be) be.addEventListener("click", function () {
      alertModal("Email sign-in", "Email login needs a backend. Use Guest or Google for now.");
    });
    var bp = $("#btn-phone");
    if (bp) bp.addEventListener("click", function () {
      alertModal("Phone sign-in", "Phone login needs a backend. Use Guest or Google for now.");
    });
    var bguest = $("#btn-guest");
    if (bguest) bguest.addEventListener("click", function () {
      state.token = "guest";
      enterApp({ name: "Guest" });
    });

    // Create controls
    var promptEl = $("#prompt");
    if (promptEl) {
      promptEl.addEventListener("input", function () {
        var c = $("#prompt-count");
        if (c) c.textContent = (promptEl.value || "").length;
      });
    }
    var br = $("#btn-random");
    if (br) br.addEventListener("click", function () {
      var p = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
      if (promptEl) {
        promptEl.value = p;
        var c = $("#prompt-count");
        if (c) c.textContent = String(p.length);
      }
    });
    $$("#styles .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $$("#styles .chip").forEach(function (x) { x.classList.remove("on"); });
        chip.classList.add("on");
        state.style = chip.getAttribute("data-style") || "realistic";
      });
    });
    $$("#durs .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        $$("#durs .chip").forEach(function (x) { x.classList.remove("on"); });
        chip.classList.add("on");
        state.duration = Number(chip.getAttribute("data-dur")) || 10;
        refreshCredits();
      });
    });
    var go = $("#btn-generate");
    if (go) go.addEventListener("click", generate);
    var bs = $("#btn-save");
    if (bs) bs.addEventListener("click", saveToLibrary);
    var bf = $("#btn-post");
    if (bf) bf.addEventListener("click", postToFeed);
    var bd = $("#btn-download");
    if (bd) bd.addEventListener("click", downloadVideo);

    // Plans
    $$(".plan-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var plan = card.getAttribute("data-plan") || "spark";
        state.plan = plan;
        localStorage.setItem("frank_plan", plan);
        if (plan === "spark") {
          state.creditsMax = 30;
          state.creditsLeft = Math.min(state.creditsLeft, 30);
        } else if (plan === "maker") {
          state.creditsMax = 400;
          state.creditsLeft = Math.max(state.creditsLeft, 100);
        } else if (plan === "director") {
          state.creditsMax = 1200;
          state.creditsLeft = Math.max(state.creditsLeft, 200);
        }
        refreshCredits();
        refreshPlanUI();
        alertModal("Plan selected", plan.charAt(0).toUpperCase() + plan.slice(1) + " selected (demo). Real billing needs a payment backend.");
      });
    });

    // Settings rows
    $$("[data-setting]").forEach(function (row) {
      row.addEventListener("click", function () {
        var key = row.getAttribute("data-setting");
        if (key === "signout") {
          signOut();
          return;
        }
        alertModal("Settings", "This preference is saved locally. Full account features need a backend.");
      });
    });
    var so = $("#btn-signout");
    if (so) so.addEventListener("click", signOut);

    // Feed comment
    var send = $("#btn-comment-send");
    if (send) {
      send.addEventListener("click", function () {
        var input = $("#comment-input");
        var text = (input && input.value || "").trim();
        if (!text || !state.currentFeedPost) return;
        var author = (state.googleProfile && state.googleProfile.name) || (state.user && state.user.name) || "Guest";
        state.currentFeedPost.comments = state.currentFeedPost.comments || [];
        state.currentFeedPost.comments.push({ author: author, text: text, ts: Date.now() });
        var feed = loadFeed();
        var idx = feed.findIndex(function (p) { return p.id === state.currentFeedPost.id; });
        if (idx >= 0) feed[idx] = state.currentFeedPost;
        saveFeed(feed);
        if (input) input.value = "";
        renderComments(state.currentFeedPost);
      });
    }
    var closeFeed = $("#modal-feed-close");
    if (closeFeed) closeFeed.addEventListener("click", function () {
      $("#modal-feed").classList.remove("on");
    });
    var closeAlert = $("#modal-alert-close");
    if (closeAlert) closeAlert.addEventListener("click", function () {
      $("#modal-alert").classList.remove("on");
    });

    // Restore session
    try {
      var g = JSON.parse(localStorage.getItem("frank_google") || "null");
      if (g && localStorage.getItem("frank_token")) {
        state.googleProfile = g;
        state.user = { name: g.name, plan: "google" };
        state.token = localStorage.getItem("frank_token");
        enterApp(g);
      } else if (localStorage.getItem("frank_token")) {
        enterApp({ name: "Guest" });
      }
    } catch (e) {}

    refreshCredits();
    initGoogle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
