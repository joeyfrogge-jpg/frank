      return state.cat === "all" || t.cat === state.cat;
    });
    grid.innerHTML = list.map(function (t) {
      var img = pollinationsUrl(t.prompt, 640, 400);
      return '<div class="t-card" data-prompt="' + esc(t.prompt) + '">' +
        '<div class="thumb"><img src="' + img + '" alt="" loading="lazy">' +
        '<div class="play"><svg width="12" height="12" fill="#fff"><path d="M3 1v10l8-5z"/></svg></div></div>' +
        '<div class="meta"><div class="title">' + esc(t.title) + '</div>' +
        '<div class="views">Inspired</div></div></div>';
    }).join("");
    grid.querySelectorAll(".t-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var p = card.getAttribute("data-prompt") || "";
        if (promptEl) {
          promptEl.value = p;
          var c = $("#prompt-count");
          if (c) c.textContent = p.length;
        }
        showScreen("create");
        toast("Prompt loaded — Generate when ready");
      });
    });
  }

  function renderCommunityFeed() {
    var grid = $("#feed-grid");
    if (!grid) return;
    var feed = loadFeed();
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
      urlEl.textContent = base || "Standalone (free FrankGPT path)";
    }
  }

  var setServer = $("#set-server");
  if (setServer) {
    setServer.addEventListener("click", function () {
      var cur = apiBase() || "";
      var cid = googleClientId();
      openModal(
        "FrankGPT Settings",
        '<p style="color:var(--muted);font-size:13px;margin:0 0 12px">Optional server URL for full backend. Leave blank for free standalone FrankGPT.</p>' +
        '<input class="field" id="m-server" value="' + esc(cur) + '" placeholder="https://your-server.example.com">' +
        '<p style="color:var(--muted);font-size:13px;margin:16px 0 8px">Google OAuth Client ID (Web)</p>' +
        '<input class="field" id="m-google" value="' + esc(cid) + '" placeholder="123456789-abc.apps.googleusercontent.com">' +
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
        "<p>Version " + esc(CFG.VERSION || "2.0") + "<br>FrankGPT free path works offline on this site. Optional server unlocks full pipelines.</p>" +
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
