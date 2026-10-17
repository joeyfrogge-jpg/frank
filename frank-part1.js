  async function frankGenerate(prompt, seconds, aspect, onStatus) {
    onStatus = onStatus || function () {};
    onStatus("FrankGPT · composing frame…");
    var parts = (aspect || "9:16").split(":");
    var arW = Number(parts[0]) || 9, arH = Number(parts[1]) || 16;
    var ih = 1024;
    var iw = Math.round(ih * arW / arH);
    var img = await loadImage(pollinationsUrl(prompt, iw, ih));
    onStatus("FrankGPT · rendering clip…");
    return kenBurnsVideo(img, Math.min(seconds || 10, 12), aspect);
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

  var btnGoogle = $("#btn-google");
  if (btnGoogle) {
    btnGoogle.addEventListener("click", async function (e) {
      e.preventDefault();
      var cid = googleClientId();
      if (!cid) {
        toast("Add your Google OAuth Client ID in Settings to enable Google login.");
        showScreen("settings");
        enterApp();
        return;
      }
      btnGoogle.disabled = true;
      try {
        await loadGis();
        window.google.accounts.id.initialize({
          client_id: cid,
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
        if (c) c.textContent = p.length;
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
        showStat("FrankGPT clip ready.", false, true);
        toast("Video ready");
        if (state.token && state.token.indexOf("google_") === 0) {
          var feed = loadFeed();
          feed.unshift({
            id: entry.id,
            prompt: raw,
            title: raw.slice(0, 48),
            dataUrl: out.dataUrl,
            author: state.user.name,
            picture: (state.googleProfile && state.googleProfile.picture) || "",
            created: Date.now()
          });
          saveFeed(feed);
          toast("Posted to community feed");
        }
      } catch (e) {
        showStat(e.message || "Generation failed", true);
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

  function cardHtml(title, imgUrl, sub) {
    return '<div class="t-card">' +
      '<div class="thumb">' +
      (imgUrl ? '<img src="' + esc(imgUrl) + '" alt="" loading="lazy">' : '') +
      '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
      '<div class="meta"><div class="title">' + esc(title) + '</div>' +
      '<div class="views">' + esc(sub || "") + '</div></div></div>';
  }

  function renderTrending() {
    var grid = $("#trending-grid");
    if (!grid) return;
    var list = TRENDING.filter(function (t) {
