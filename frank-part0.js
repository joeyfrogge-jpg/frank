/* frankgpt — full standalone app. Free AI path + optional server + Google sign-in when configured. */
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
    cinematic: "cinematic lighting, film still, anamorphic, dramatic, shallow depth of field",
    animated: "animated, stylized, vibrant colors, clean shapes",
    abstract: "abstract, surreal, artistic composition, bold forms"
  };
  var RANDOM_PROMPTS = [
    "A neon-lit alley in the rain at night, reflections on wet pavement",
    "Golden hour over rolling hills, soft wind through tall grass",
    "A sleek spaceship docking at an orbital station above Earth",
    "Macro shot of dew on a spiderweb at sunrise",
    "Crowded Tokyo crossing time-lapse feel, glowing signs",
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
  function loadFeed() {
    try { return JSON.parse(localStorage.getItem(FEED_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveFeed(items) {
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

  function pollinationsUrl(prompt, w, h) {
    var q = encodeURIComponent((prompt || "cinematic scene").slice(0, 200));
    return "https://image.pollinations.ai/prompt/" + q +
      "?width=" + (w || 768) + "&height=" + (h || 1344) +
      "&nologo=true&enhance=true&seed=" + Math.floor(Math.random() * 1e9);
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
          resolve({ blobUrl: URL.createObjectURL(blob), dataUrl: reader.result, blob: blob });
        };
        reader.readAsDataURL(blob);
      };
      var t0 = performance.now();
      var dur = Math.max(4, Math.min(seconds || 10, 12)) * 1000;
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
