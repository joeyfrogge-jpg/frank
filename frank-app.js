/* FRANK / FRANKGPT - timer fix loader: loads full app from frank-app.full.js */
(async function(){
  try {
    const r = await fetch('./frank-app.full.js?v=' + Date.now());
    if (!r.ok) throw new Error('failed to load frank-app.full.js');
    const code = await r.text();
    const s = document.createElement('script');
    s.textContent = code;
    document.body.appendChild(s);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('stat');
    if (el) { el.className = 'status on err'; el.style.display = 'block'; el.textContent = 'Failed to load app script: ' + e.message; }
  }
})();
