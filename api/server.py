#!/usr/bin/env python3
"""FRANKGPT standalone API — no Puter. Guest jobs. Sign-in only to post feed. Master link = admin."""
from __future__ import annotations
import os, sys, json, uuid, sqlite3, hashlib, hmac, base64, time, subprocess, mimetypes
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path

PORT = int(os.environ.get("PORT", 8000))
HOST = "0.0.0.0"
BASE = Path(__file__).resolve().parents[1]
DB = BASE / "frankgpt.db"
STORAGE = BASE / "storage"
GEN = STORAGE / "generations"
FRONT = BASE / "web"
MODELS = BASE / "models"
SECRET = os.environ.get("FRANK_SECRET", "frankgpt-standalone-2026").encode()
MASTER_TOKEN = os.environ.get("FRANK_MASTER_TOKEN", "FRANK-MASTER-2026")
DURATIONS = [10, 20, 30]
PLANS = {
  "free": {"name": "Free", "price": 0, "per_day": 5, "features": ["Watermark", "Basic models", "Ads optional"]},
  "plus": {"name": "Plus", "price": 9.99, "per_month": 50, "features": ["No watermark", "Longer clips", "Priority queue"]},
  "premium": {"name": "Premium", "price": 24.99, "per_month": 200, "features": ["Image-to-video", "Style/Mood", "Faster models"]},
  "platinum": {"name": "Platinum", "price": 49.99, "per_month": -1, "features": ["Highest quality", "Commercial license", "Master-link benefits"]},
}
for d in (STORAGE, GEN, FRONT):
    d.mkdir(parents=True, exist_ok=True)

def db():
    c = sqlite3.connect(str(DB)); c.row_factory = sqlite3.Row; return c

def init_db():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password_hash TEXT,
      display_name TEXT DEFAULT 'Creator', username TEXT, plan TEXT DEFAULT 'free',
      is_admin INTEGER DEFAULT 0, is_moderator INTEGER DEFAULT 0,
      generations_today INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT UNIQUE NOT NULL,
      user_id INTEGER, guest_id TEXT, mode TEXT DEFAULT 'text_to_video',
      prompt TEXT NOT NULL, duration_requested INTEGER NOT NULL,
      status TEXT DEFAULT 'queued', progress REAL DEFAULT 0, error_message TEXT,
      video_path TEXT, is_public INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT, generation_id INTEGER,
      username TEXT, prompt TEXT, caption TEXT, video_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    """)
    c.commit(); c.close()

def hash_pw(pw):
    salt = os.urandom(16); h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 120000)
    return base64.b64encode(salt + h).decode()
def check_pw(pw, stored):
    try:
        raw = base64.b64decode(stored); salt, h = raw[:16], raw[16:]
        return hmac.compare_digest(h, hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 120000))
    except Exception: return False
def make_token(email):
    exp = int(time.time()) + 7*24*3600
    payload = f"{email}:{exp}"
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()
def read_token(tok):
    try:
        raw = base64.urlsafe_b64decode(tok.encode()).decode()
        email, exp, sig = raw.rsplit(":", 2)
        if int(exp) < time.time(): return None
        if not hmac.compare_digest(sig, hmac.new(SECRET, f"{email}:{exp}".encode(), hashlib.sha256).hexdigest()): return None
        return email
    except Exception: return None

def model_status():
    s = {"model": "Wan2.2-TI2V-5B / CogVideoX", "weights": False, "gpu": False, "ready": False, "msg": ""}
    wan = MODELS / "wan2.2"
    s["weights"] = wan.exists() and any(wan.iterdir()) if wan.exists() else False
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True, timeout=4)
        if r.returncode == 0 and r.stdout.strip():
            s["gpu"] = True; s["gpu_name"] = r.stdout.strip()
    except Exception: pass
    if not s["weights"]:
        s["msg"] = "Model weights not found. Place Wan 2.2 under models/wan2.2. See STANDALONE.md."
    elif not s["gpu"]:
        s["msg"] = "No GPU detected. Connect NVIDIA GPU for local free generation (admins)."
    else:
        s["ready"] = True; s["msg"] = "Ready for local inference."
    return s

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a): sys.stderr.write(f"[{datetime.now():%H:%M:%S}] {a[0]}\n")
    def sendj(self, code=200, body=None):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        data = b"" if body is None else json.dumps(body, default=str).encode()
        self.send_header("Content-Length", len(data)); self.end_headers()
        if data: self.wfile.write(data)
    def body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}
    def user(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "): return None
        email = read_token(auth[7:])
        if not email: return None
        c = db(); row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone(); c.close()
        return dict(row) if row else None
    def do_OPTIONS(self): self.sendj(204)
    def serve_file(self, path, ctype):
        if not path.exists(): return self.sendj(404, {"detail": "not found"})
        data = path.read_bytes()
        self.send_response(200); self.send_header("Content-Type", ctype); self.send_header("Content-Length", len(data)); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        p = urlparse(self.path).path
        if p in ("/", "/index.html"): return self.serve_file(FRONT / "index.html", "text/html")
        if p == "/manifest.json": return self.serve_file(FRONT / "manifest.json", "application/json")
        if p == "/frank-app.js": return self.serve_file(FRONT / "frank-app.js", "application/javascript")
        if p.startswith("/storage/"):
            f = BASE / p.lstrip("/"); return self.serve_file(f, mimetypes.guess_type(str(f))[0] or "application/octet-stream")
        if p == "/api/v1/health":
            ms = model_status()
            return self.sendj(200, {"status": "ok", "app": "FRANKGPT", "version": "2.0.0-standalone", "puter": False,
                "login_required_for_generate": False, "login_required_for_feed_post": True,
                "model": ms["model"], "inference_ready": ms["ready"], "environment": ms, "durations": DURATIONS, "plans": PLANS})
        if p == "/api/v1/plans": return self.sendj(200, PLANS)
        if p == "/api/v1/auth/me":
            u = self.user()
            if not u: return self.sendj(200, {"authenticated": False, "guest": True})
            return self.sendj(200, {"authenticated": True, "email": u.get("email"), "display_name": u.get("display_name"),
                "plan": u.get("plan"), "is_admin": bool(u.get("is_admin")), "is_moderator": bool(u.get("is_moderator"))})
        if p == "/api/v1/library":
            u = self.user(); c = db()
            if u:
                rows = c.execute("SELECT job_id,prompt,duration_requested,status,is_public,created_at FROM generations WHERE user_id=? ORDER BY id DESC LIMIT 50", (u["id"],)).fetchall()
            else:
                gid = self.headers.get("X-Guest-Id", "")
                rows = c.execute("SELECT job_id,prompt,duration_requested,status,is_public,created_at FROM generations WHERE guest_id=? ORDER BY id DESC LIMIT 50", (gid,)).fetchall() if gid else []
            c.close(); return self.sendj(200, [dict(r) for r in rows])
        if p == "/api/v1/feed":
            c = db(); rows = c.execute("SELECT * FROM feed ORDER BY id DESC LIMIT 50").fetchall(); c.close()
            return self.sendj(200, [dict(r) for r in rows])
        self.sendj(404, {"detail": "not found"})
    def do_POST(self):
        p = urlparse(self.path).path; b = self.body()
        if p == "/api/v1/auth/register":
            email = (b.get("email") or "").strip().lower(); pw = b.get("password") or ""
            name = b.get("display_name") or "Creator"; master = b.get("master_token") or ""
            if not email or len(pw) < 6: return self.sendj(400, {"detail": "Email + password (6+) required"})
            c = db()
            if c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
                c.close(); return self.sendj(400, {"detail": "Email already registered"})
            is_admin = 1 if master == MASTER_TOKEN else 0
            plan = "platinum" if is_admin else "free"
            c.execute("INSERT INTO users (email,password_hash,display_name,username,plan,is_admin,is_moderator) VALUES (?,?,?,?,?,?,?)",
                      (email, hash_pw(pw), name, name.lower().replace(" ", "_")[:24], plan, is_admin, is_admin))
            c.commit(); c.close()
            return self.sendj(200, {"access_token": make_token(email), "user": {"email": email, "display_name": name, "plan": plan, "is_admin": bool(is_admin)}})
        if p == "/api/v1/auth/login":
            email = (b.get("email") or "").strip().lower(); pw = b.get("password") or ""
            c = db(); u = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone(); c.close()
            if not u or not check_pw(pw, u["password_hash"]): return self.sendj(401, {"detail": "Wrong email or password"})
            return self.sendj(200, {"access_token": make_token(email), "user": {"email": u["email"], "display_name": u["display_name"], "plan": u["plan"], "is_admin": bool(u["is_admin"])}})
        if p == "/api/v1/auth/master":
            if (b.get("master_token") or "") != MASTER_TOKEN: return self.sendj(403, {"detail": "Invalid master token"})
            email = (b.get("email") or "").strip().lower(); name = b.get("display_name") or "Admin"
            if not email: return self.sendj(400, {"detail": "Email required"})
            c = db()
            existing = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if existing:
                c.execute("UPDATE users SET is_admin=1, is_moderator=1, plan='platinum' WHERE email=?", (email,))
            else:
                c.execute("INSERT INTO users (email,password_hash,display_name,username,plan,is_admin,is_moderator) VALUES (?,?,?,?,?,?,?)",
                          (email, hash_pw(uuid.uuid4().hex), name, "admin", "platinum", 1, 1))
            c.commit(); c.close()
            return self.sendj(200, {"access_token": make_token(email), "message": "Master admin granted", "user": {"email": email, "plan": "platinum", "is_admin": True}})
        if p == "/api/v1/generations":
            prompt = (b.get("prompt") or "").strip(); duration = int(b.get("duration") or 10); mode = b.get("mode") or "text_to_video"
            if not prompt: return self.sendj(400, {"detail": "Prompt required"})
            if duration not in DURATIONS: return self.sendj(400, {"detail": f"Duration must be {DURATIONS}"})
            u = self.user(); guest = self.headers.get("X-Guest-Id") or str(uuid.uuid4())
            if u and u.get("plan") == "free" and not u.get("is_admin") and u.get("generations_today", 0) >= 5:
                return self.sendj(429, {"detail": "Daily free limit reached"})
            job_id = str(uuid.uuid4()); ms = model_status()
            status = "queued" if ms["ready"] else "failed"; err = None if ms["ready"] else ms["msg"]
            if ms["ready"]:
                try:
                    sys.path.insert(0, str(BASE))
                    from frankgpt.config import load_config
                    from frankgpt.pipeline import generate as frank_generate
                    cfg = load_config(BASE / "configs" / "default.json")
                    frank_generate(backend=cfg.get("default_backend", "wan2.2"), mode="t2v", prompt=prompt,
                                   image_path=None, duration=duration, fps=cfg.get("fps", 16),
                                   output=str(GEN / f"{job_id}.mp4"), config=cfg)
                    status = "completed"; err = None
                except Exception as e:
                    status = "failed"; err = str(e)
            c = db()
            c.execute("INSERT INTO generations (job_id,user_id,guest_id,mode,prompt,duration_requested,status,progress,error_message) VALUES (?,?,?,?,?,?,?,?,?)",
                      (job_id, u["id"] if u else None, guest if not u else None, mode, prompt, duration, status, 100 if status == "completed" else 0, err))
            if u: c.execute("UPDATE users SET generations_today=generations_today+1 WHERE id=?", (u["id"],))
            c.commit(); c.close()
            return self.sendj(200, {"job_id": job_id, "status": status, "duration_requested": duration, "guest_id": guest if not u else None,
                                    "message": err or "Job completed", "login_required": False})
        if p == "/api/v1/generations/randomize":
            import random
            subjects = ["a raccoon in a black suit", "a golden retriever with sunglasses", "a skeleton with headphones"]
            places = ["neon Tokyo streets in the rain", "a golden-hour beach", "a purple neon bedroom"]
            actions = ["walking toward the camera", "dancing under rain", "skateboarding"]
            pick = lambda a: random.choice(a)
            return self.sendj(200, {"prompt": f"{pick(subjects)} {pick(actions)} in {pick(places)}, cinematic lighting, 24fps"})
        if p == "/api/v1/feed":
            u = self.user()
            if not u: return self.sendj(401, {"detail": "Sign in required only to post to the public feed."})
            job_id = b.get("job_id"); caption = b.get("caption") or ""
            c = db(); gen = c.execute("SELECT * FROM generations WHERE job_id=?", (job_id,)).fetchone()
            if not gen: c.close(); return self.sendj(404, {"detail": "Generation not found"})
            c.execute("UPDATE generations SET is_public=1 WHERE id=?", (gen["id"],))
            c.execute("INSERT INTO feed (generation_id,username,prompt,caption,video_url) VALUES (?,?,?,?,?)",
                      (gen["id"], u.get("username") or u.get("display_name") or "creator", gen["prompt"], caption, None))
            c.commit(); c.close()
            return self.sendj(200, {"posted": True})
        self.sendj(404, {"detail": "not found"})

def main():
    init_db(); ms = model_status()
    print("=" * 56)
    print("  FRANKGPT 2.0 STANDALONE — no Puter")
    print("  Guest generate OK · Sign-in only for feed post")
    print(f"  Master token: {MASTER_TOKEN}")
    print(f"  Ready: {ms['ready']}")
    print(f"  http://127.0.0.1:{PORT}/")
    print("=" * 56)
    HTTPServer((HOST, PORT), H).serve_forever()

if __name__ == "__main__":
    main()
