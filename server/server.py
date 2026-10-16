#!/usr/bin/env python3
"""FRANKGPT server — your API, your database, your model path. Python stdlib only.

    python3 server/server.py            # http://0.0.0.0:8000  (also serves the static UI)

See docs/BACKEND.md for every environment variable.
"""
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import shutil
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adapter as engine  # noqa: E402

VERSION = "frankgpt-standalone-1.0"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("FRANK_DATA", os.path.join(ROOT, "server", "data"))
GEN_DIR = os.path.join(DATA, "storage", "generations")
UP_DIR = os.path.join(DATA, "storage", "uploads")
TMP_DIR = os.path.join(DATA, "storage", "tmp")
for d in (GEN_DIR, UP_DIR, TMP_DIR):
    os.makedirs(d, exist_ok=True)

ENV = os.environ.get
GOOGLE_CLIENT_ID = ENV("GOOGLE_CLIENT_ID", "")
STRIPE_KEY = ENV("STRIPE_SECRET_KEY", "")
STRIPE_WHSEC = ENV("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICES = {"plus": ENV("STRIPE_PRICE_PLUS", ""), "premium": ENV("STRIPE_PRICE_PREMIUM", ""),
                 "platinum": ENV("STRIPE_PRICE_PLATINUM", "")}
PUBLIC_URL = ENV("FRANK_PUBLIC_URL", "http://localhost:8000").rstrip("/")
TWILIO = (ENV("TWILIO_ACCOUNT_SID", ""), ENV("TWILIO_AUTH_TOKEN", ""), ENV("TWILIO_VERIFY_SID", ""))
RETENTION_DAYS = int(ENV("FRANK_RETENTION_DAYS", "14"))
STORAGE_CAP_MB = int(ENV("FRANK_STORAGE_CAP_MB", "5000"))
TRUST_PROXY = ENV("FRANK_TRUST_PROXY", "0") == "1"
SERVE_STATIC = ENV("FRANK_SERVE_STATIC", "1") == "1"
DEFAULT_ORIGINS = ("https://joeyfrogge-jpg.github.io,http://localhost:8000,http://127.0.0.1:8000,"
                   "http://localhost,https://localhost,capacitor://localhost")
CORS = [o.strip() for o in ENV("FRANK_CORS_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]

MAX_BODY = 12 * 1024 * 1024
MAX_IMAGE = 8 * 1024 * 1024
DURATIONS = (10, 20, 30)
ASPECTS = ("9:16", "16:9", "1:1")

PLANS = {
    "free":     {"per_day": 3,   "max_duration": 10, "i2v": False, "watermark": True},
    "plus":     {"per_day": 20,  "max_duration": 20, "i2v": False, "watermark": False},
    "premium":  {"per_day": 50,  "max_duration": 30, "i2v": True,  "watermark": False},
    "platinum": {"per_day": 500, "max_duration": 30, "i2v": True,  "watermark": False},
}
GUEST_PLAN = {"per_day": 2, "max_duration": 10, "i2v": False, "watermark": True}

ADAPTER = engine.get_adapter()


# ---------------------------------------------------------------- database
class DB:
    def __init__(self, path):
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA foreign_keys=ON")
            self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS users(
              id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, pw_hash TEXT,
              google_sub TEXT UNIQUE, phone TEXT UNIQUE, plan TEXT NOT NULL DEFAULT 'free',
              stripe_customer TEXT, stripe_sub TEXT, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(
              token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(
              id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
              guest_key TEXT, prompt TEXT NOT NULL, duration INTEGER NOT NULL, mode TEXT NOT NULL,
              aspect TEXT NOT NULL, status TEXT NOT NULL, message TEXT, seg_done INTEGER DEFAULT 0,
              seg_total INTEGER DEFAULT 0, watermark INTEGER DEFAULT 0, file TEXT, ref_image TEXT,
              measured REAL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created);
            CREATE INDEX IF NOT EXISTS jobs_guest ON jobs(guest_key, created);
            CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created);
            CREATE TABLE IF NOT EXISTS feed(
              id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
              creator TEXT, caption TEXT, created INTEGER NOT NULL);
            """)

    def q(self, sql, args=()):
        with self.lock:
            return self.conn.execute(sql, args).fetchall()

    def one(self, sql, args=()):
        r = self.q(sql, args)
        return r[0] if r else None

    def x(self, sql, args=()):
        with self.lock:
            return self.conn.execute(sql, args)


db = DB(os.path.join(DATA, "frank.sqlite3"))


def now():
    return int(time.time())


# ---------------------------------------------------------------- helpers
class ApiError(Exception):
    def __init__(self, status, msg, code=None):
        self.status, self.msg, self.code = status, msg, code or "error"


def hash_pw(pw):
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$%s$%s" % (salt.hex(), h.hex())


def check_pw(pw, stored):
    try:
        _, salt, h = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(got.hex(), h)
    except Exception:
        return False


def new_session(user_id):
    tok = secrets.token_urlsafe(32)
    db.x("INSERT INTO sessions VALUES(?,?,?)",
         (hashlib.sha256(tok.encode()).hexdigest(), user_id, now() + 30 * 86400))
    return tok


def user_json(u):
    return {"id": u["id"], "name": u["name"], "email": u["email"], "phone": u["phone"],
            "plan": u["plan"], "limits": PLANS.get(u["plan"], PLANS["free"])}


_rate = {}
_rate_lock = threading.Lock()


def rate_limit(key, limit, window=60):
    t = time.time()
    with _rate_lock:
        hits = [x for x in _rate.get(key, []) if t - x < window]
        if len(hits) >= limit:
            _rate[key] = hits
            raise ApiError(429, "Too many attempts. Wait a minute and try again.", "rate_limited")
        hits.append(t)
        _rate[key] = hits


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def http_json(url, data=None, headers=None, form=False, method=None, auth=None):
    h = dict(headers or {})
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data, doseq=True).encode()
            h["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
    if auth:
        h["Authorization"] = "Basic " + base64.b64encode(("%s:%s" % auth).encode()).decode()
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return {"_http_error": e.code, **json.loads(e.read().decode())}
        except Exception:
            return {"_http_error": e.code}


# ---------------------------------------------------------------- job worker
def job_json(j):
    out = {"id": j["id"], "status": j["status"], "message": j["message"], "prompt": j["prompt"],
           "duration": j["duration"], "mode": j["mode"], "aspect": j["aspect"],
           "segment_done": j["seg_done"], "segment_total": j["seg_total"],
           "watermark": bool(j["watermark"]), "measured_duration": j["measured"],
           "created": j["created"]}
    if j["status"] == "succeeded":
        out["video_url"] = "/api/v1/generations/%s/video" % j["id"]
    return out


def set_job(jid, **kw):
    kw["updated"] = now()
    cols = ", ".join("%s=?" % k for k in kw)
    db.x("UPDATE jobs SET %s WHERE id=?" % cols, list(kw.values()) + [jid])


def process(job):
    jid = job["id"]
    work = os.path.join(TMP_DIR, jid)
    os.makedirs(work, exist_ok=True)
    try:
        h = ADAPTER.health()
        if not h["ready"]:
            raise engine.EngineBlocked(h["reason"])
        set_job(jid, status="running", message="Starting")

        def prog(done, total, msg):
            set_job(jid, seg_done=done, seg_total=total, message=msg)

        out = os.path.join(GEN_DIR, jid + ".mp4")
        measured = engine.render(ADAPTER, job["prompt"], job["duration"], job["ref_image"], out, work,
                                 bool(job["watermark"]), prog)
        set_job(jid, status="succeeded", message="Done", file=out, measured=measured,
                seg_done=job["seg_total"] or 1)
    except engine.EngineBlocked as e:
        set_job(jid, status="blocked", message=str(e))
    except engine.EngineError as e:
        set_job(jid, status="failed", message=str(e)[:300])
    except Exception as e:  # never leave a job "running" forever
        set_job(jid, status="failed", message="Internal error: %s" % str(e)[:200])
    finally:
        shutil.rmtree(work, ignore_errors=True)


def worker_loop():
    while True:
        try:
            j = db.one("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1")
            if j:
                process(j)
            else:
                time.sleep(1)
        except Exception as e:
            print("worker error:", e, file=sys.stderr)
            time.sleep(2)


def rm(path):
    try:
        if path:
            os.remove(path)
    except OSError:
        pass


def cleanup_once():
    cutoff = now() - RETENTION_DAYS * 86400
    old = db.q("SELECT j.* FROM jobs j LEFT JOIN feed f ON f.job_id=j.id WHERE f.id IS NULL AND j.created<?",
               (cutoff,))
    for j in old:
        rm(j["file"])
        rm(j["ref_image"])
        db.x("DELETE FROM jobs WHERE id=?", (j["id"],))
    db.x("DELETE FROM sessions WHERE expires<?", (now(),))
    # size cap: drop oldest non-feed files until under cap
    def size():
        return sum(os.path.getsize(os.path.join(GEN_DIR, f)) for f in os.listdir(GEN_DIR)) / 1048576
    if size() > STORAGE_CAP_MB:
        rows = db.q("SELECT j.* FROM jobs j LEFT JOIN feed f ON f.job_id=j.id "
                    "WHERE f.id IS NULL AND j.file IS NOT NULL ORDER BY j.created")
        for j in rows:
            if size() <= STORAGE_CAP_MB:
                break
            rm(j["file"])
            db.x("DELETE FROM jobs WHERE id=?", (j["id"],))


def cleanup_loop():
    while True:
        try:
            cleanup_once()
        except Exception as e:
            print("cleanup error:", e, file=sys.stderr)
        time.sleep(3600)


# ---------------------------------------------------------------- request handling
class H(BaseHTTPRequestHandler):
    server_version = "FRANKGPT/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        if ENV("FRANK_LOG", "0") == "1":
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))

    # --- plumbing
    def ip(self):
        if TRUST_PROXY:
            xf = self.headers.get("X-Forwarded-For")
            if xf:
                return xf.split(",")[0].strip()
        return self.client_address[0]

    def cors(self):
        o = self.headers.get("Origin")
        if o and ("*" in CORS or o in CORS):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Frank-Guest")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

    def reply(self, status, obj, extra=None):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def body(self, raw=False):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ApiError(413, "Request too large.", "too_large")
        data = self.rfile.read(n) if n else b""
        if raw:
            return data
        if not data:
            return {}
        try:
            obj = json.loads(data.decode())
        except Exception:
            raise ApiError(400, "Body must be JSON.", "bad_json")
        if not isinstance(obj, dict):
            raise ApiError(400, "Body must be a JSON object.", "bad_json")
        return obj

    def user(self, required=False):
        a = self.headers.get("Authorization", "")
        u = None
        if a.startswith("Bearer "):
            th = hashlib.sha256(a[7:].encode()).hexdigest()
            u = db.one("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id "
                       "WHERE s.token_hash=? AND s.expires>?", (th, now()))
        if required and not u:
            raise ApiError(401, "Sign in required.", "auth_required")
        return u

    def guest_key(self):
        g = (self.headers.get("X-Frank-Guest") or "")[:64]
        return "g:%s:%s" % (self.ip(), re.sub(r"[^A-Za-z0-9_-]", "", g))

    # --- dispatch
    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        path = urllib.parse.urlparse(self.path).path
        try:
            if path.startswith("/api/"):
                self.api(method, path)
            elif method == "GET" and SERVE_STATIC:
                self.static(path)
            else:
                raise ApiError(404, "Not found.", "not_found")
        except ApiError as e:
            self.reply(e.status, {"error": e.msg, "code": e.code})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            print("500:", repr(e), file=sys.stderr)
            self.reply(500, {"error": "Server error.", "code": "server_error"})

    # --- static UI (same origin as API when self-hosted)
    STATIC_OK = {".html", ".js", ".json", ".png", ".svg", ".ico", ".css", ".txt", ".webmanifest"}

    def static(self, path):
        path = urllib.parse.unquote(path)
        if path in ("", "/"):
            path = "/index.html"
        parts = [p for p in path.split("/") if p]
        if any(p.startswith(".") or p in ("server", "docs", "android", "node_modules") for p in parts):
            raise ApiError(404, "Not found.", "not_found")
        full = os.path.realpath(os.path.join(ROOT, *parts))
        if not full.startswith(ROOT + os.sep) or not os.path.isfile(full) \
                or os.path.splitext(full)[1].lower() not in self.STATIC_OK:
            raise ApiError(404, "Not found.", "not_found")
        self.send_file(full, mimetypes.guess_type(full)[0] or "application/octet-stream",
                       cache="no-cache")

    def send_file(self, full, ctype, cache="private, max-age=3600"):
        size = os.path.getsize(full)
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                end = min(end, size - 1)
                if start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.cors()
        self.end_headers()
        with open(full, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(65536, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    # --- API
    def api(self, method, path):
        p = path[len("/api/v1"):] if path.startswith("/api/v1") else None
        if p is None:
            raise ApiError(404, "Use /api/v1/...", "not_found")
        m = re.match
        if method == "GET" and p == "/health":
            return self.health()
        if method == "POST" and p == "/auth/register":
            return self.register()
        if method == "POST" and p == "/auth/login":
            return self.login()
        if method == "POST" and p == "/auth/google":
            return self.google()
        if method == "POST" and p == "/auth/phone/start":
            return self.phone_start()
        if method == "POST" and p == "/auth/phone/verify":
            return self.phone_verify()
        if method == "POST" and p == "/auth/logout":
            return self.logout()
        if method == "GET" and p == "/auth/me":
            return self.reply(200, {"user": user_json(self.user(True))})
        if method == "DELETE" and p == "/auth/me":
            return self.delete_account()
        if method == "POST" and p == "/generations":
            return self.create_job()
        if method == "GET" and p == "/library":
            return self.library()
        g = m(r"^/generations/([0-9a-f]{24})(/video)?$", p)
        if g and method == "GET":
            return self.get_job(g.group(1), bool(g.group(2)))
        if g and method == "DELETE" and not g.group(2):
            return self.delete_job(g.group(1))
        if method == "GET" and p == "/feed":
            return self.feed_list()
        if method == "POST" and p == "/feed":
            return self.feed_post()
        f = m(r"^/feed/([0-9a-f]{16})(/video)?$", p)
        if f and method == "GET" and f.group(2):
            return self.feed_video(f.group(1))
        if f and method == "DELETE" and not f.group(2):
            return self.feed_delete(f.group(1))
        if method == "POST" and p == "/billing/checkout":
            return self.checkout()
        if method == "POST" and p == "/billing/portal":
            return self.portal()
        if method == "POST" and p == "/billing/webhook":
            return self.webhook()
        raise ApiError(404, "Unknown endpoint.", "not_found")

    def health(self):
        h = ADAPTER.health()
        self.reply(200, {
            "version": VERSION, "ready": bool(h["ready"]), "engine": h,
            "features": {"email": True, "google": bool(GOOGLE_CLIENT_ID),
                         "phone": all(TWILIO), "billing": bool(STRIPE_KEY and STRIPE_WHSEC)},
            "google_client_id": GOOGLE_CLIENT_ID or None,
            "durations": list(DURATIONS), "plans": {**PLANS, "guest": GUEST_PLAN}})

    # --- auth
    def register(self):
        rate_limit("auth:" + self.ip(), 10)
        b = self.body()
        email = str(b.get("email", "")).strip().lower()
        pw = str(b.get("password", ""))
        name = (str(b.get("name") or "Creator").strip() or "Creator")[:40]
        if not EMAIL_RE.match(email) or len(email) > 254:
            raise ApiError(400, "Enter a valid email.", "bad_email")
        if len(pw) < 8 or len(pw) > 200:
            raise ApiError(400, "Password must be 8+ characters.", "bad_password")
        if db.one("SELECT 1 FROM users WHERE email=?", (email,)):
            raise ApiError(409, "That email already has an account. Sign in instead.", "exists")
        cur = db.x("INSERT INTO users(email,name,pw_hash,created) VALUES(?,?,?,?)",
                   (email, name, hash_pw(pw), now()))
        u = db.one("SELECT * FROM users WHERE id=?", (cur.lastrowid,))
        self.reply(201, {"token": new_session(u["id"]), "user": user_json(u)})

    def login(self):
        rate_limit("auth:" + self.ip(), 10)
        b = self.body()
        email = str(b.get("email", "")).strip().lower()
        u = db.one("SELECT * FROM users WHERE email=?", (email,))
        if not u or not u["pw_hash"] or not check_pw(str(b.get("password", "")), u["pw_hash"]):
            raise ApiError(401, "Wrong email or password.", "bad_login")
        self.reply(200, {"token": new_session(u["id"]), "user": user_json(u)})

    def google(self):
        rate_limit("auth:" + self.ip(), 10)
        if not GOOGLE_CLIENT_ID:
            raise ApiError(501, "Google sign-in is not configured on this server.", "not_configured")
        cred = str(self.body().get("credential", ""))
        info = http_json("https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(cred))
        if info.get("_http_error") or info.get("aud") != GOOGLE_CLIENT_ID \
                or info.get("iss") not in ("accounts.google.com", "https://accounts.google.com") \
                or str(info.get("email_verified")).lower() != "true" or not info.get("sub"):
            raise ApiError(401, "Google sign-in could not be verified.", "bad_google")
        sub, email = info["sub"], (info.get("email") or "").lower()
        name = (info.get("name") or email.split("@")[0] or "Creator")[:40]
        u = db.one("SELECT * FROM users WHERE google_sub=?", (sub,))
        if not u and email:
            u = db.one("SELECT * FROM users WHERE email=?", (email,))
            if u:
                db.x("UPDATE users SET google_sub=? WHERE id=?", (sub, u["id"]))
        if not u:
            cur = db.x("INSERT INTO users(email,name,google_sub,created) VALUES(?,?,?,?)",
                       (email or None, name, sub, now()))
            u = db.one("SELECT * FROM users WHERE id=?", (cur.lastrowid,))
        self.reply(200, {"token": new_session(u["id"]), "user": user_json(db.one(
            "SELECT * FROM users WHERE id=?", (u["id"],)))})

    def phone_start(self):
        rate_limit("sms:" + self.ip(), 5)
        if not all(TWILIO):
            raise ApiError(501, "Phone sign-in is not configured on this server.", "not_configured")
        phone = str(self.body().get("phone", "")).strip()
        if not re.match(r"^\+[1-9]\d{7,14}$", phone):
            raise ApiError(400, "Use international format, e.g. +15551234567.", "bad_phone")
        r = http_json("https://verify.twilio.com/v2/Services/%s/Verifications" % TWILIO[2],
                      {"To": phone, "Channel": "sms"}, form=True, auth=(TWILIO[0], TWILIO[1]))
        if r.get("_http_error"):
            raise ApiError(502, "Could not send the code.", "sms_failed")
        self.reply(200, {"sent": True})

    def phone_verify(self):
        rate_limit("sms:" + self.ip(), 10)
        if not all(TWILIO):
            raise ApiError(501, "Phone sign-in is not configured on this server.", "not_configured")
        b = self.body()
        phone, code = str(b.get("phone", "")).strip(), str(b.get("code", "")).strip()
        name = (str(b.get("name") or "Creator").strip() or "Creator")[:40]
        r = http_json("https://verify.twilio.com/v2/Services/%s/VerificationCheck" % TWILIO[2],
                      {"To": phone, "Code": code}, form=True, auth=(TWILIO[0], TWILIO[1]))
        if r.get("status") != "approved":
            raise ApiError(401, "That code is not valid.", "bad_code")
        u = db.one("SELECT * FROM users WHERE phone=?", (phone,))
        if not u:
            cur = db.x("INSERT INTO users(name,phone,created) VALUES(?,?,?)", (name, phone, now()))
            u = db.one("SELECT * FROM users WHERE id=?", (cur.lastrowid,))
        self.reply(200, {"token": new_session(u["id"]), "user": user_json(u)})

    def logout(self):
        a = self.headers.get("Authorization", "")
        if a.startswith("Bearer "):
            db.x("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(a[7:].encode()).hexdigest(),))
        self.reply(200, {"ok": True})

    def delete_account(self):
        u = self.user(True)
        for j in db.q("SELECT file, ref_image FROM jobs WHERE user_id=?", (u["id"],)):
            rm(j["file"])
            rm(j["ref_image"])
        db.x("DELETE FROM users WHERE id=?", (u["id"],))  # cascades sessions, jobs, feed
        self.reply(200, {"ok": True})

    # --- generations
    def limits_for(self, u):
        return PLANS.get(u["plan"], PLANS["free"]) if u else GUEST_PLAN

    def create_job(self):
        u = self.user()
        b = self.body()
        lim = self.limits_for(u)
        prompt = str(b.get("prompt") or "").strip()[:1200]
        try:
            duration = int(b.get("duration"))
        except (TypeError, ValueError):
            duration = 0
        if duration not in DURATIONS:
            raise ApiError(400, "duration must be 10, 20 or 30.", "bad_duration")
        mode = b.get("mode") or ("i2v" if b.get("reference_image") else "t2v")
        if mode not in ("t2v", "i2v"):
            raise ApiError(400, "mode must be t2v or i2v.", "bad_mode")
        aspect = b.get("aspect") or "9:16"
        if aspect not in ASPECTS:
            raise ApiError(400, "Unsupported aspect ratio.", "bad_aspect")
        if mode == "t2v" and not prompt:
            raise ApiError(400, "Add a prompt.", "no_prompt")
        if duration > lim["max_duration"]:
            raise ApiError(402, "Your plan allows up to %ds clips. Upgrade for longer videos." %
                           lim["max_duration"], "plan_duration")
        if mode == "i2v" and not lim["i2v"]:
            raise ApiError(402, "Image-to-video is available on Premium and Platinum.", "plan_i2v")
        key_sql, key_val = ("user_id=?", u["id"]) if u else ("guest_key=?", self.guest_key())
        day = now() - now() % 86400
        used = db.one("SELECT COUNT(*) c FROM jobs WHERE %s AND created>=? AND status!='blocked'" % key_sql,
                      (key_val, day))["c"]
        if used >= lim["per_day"]:
            raise ApiError(429, "Daily limit reached (%d). Sign in or upgrade for more." % lim["per_day"],
                           "plan_daily")
        jid = secrets.token_hex(12)
        ref = None
        if mode == "i2v":
            ref = self.save_image(str(b.get("reference_image") or ""), jid)
        h = ADAPTER.health()
        status = "queued" if h["ready"] else "blocked"
        msg = "Queued" if h["ready"] else ("Queued — connect FRANKGPT server + GPU to generate. " +
                                          (h.get("reason") or ""))
        t = now()
        db.x("INSERT INTO jobs(id,user_id,guest_key,prompt,duration,mode,aspect,status,message,seg_total,"
             "watermark,ref_image,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
             (jid, u["id"] if u else None, None if u else self.guest_key(), prompt, duration, mode, aspect,
              status, msg, -(-duration // max(1, ADAPTER.clip_seconds)), int(lim["watermark"]), ref, t, t))
        self.reply(202, job_json(db.one("SELECT * FROM jobs WHERE id=?", (jid,))))

    def save_image(self, data_url, jid):
        m = re.match(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", data_url, re.S)
        if not m:
            raise ApiError(400, "reference_image must be a PNG, JPEG or WebP data URL.", "bad_image")
        try:
            raw = base64.b64decode(m.group(2), validate=False)
        except Exception:
            raise ApiError(400, "reference_image is not valid base64.", "bad_image")
        if len(raw) > MAX_IMAGE or len(raw) < 16:
            raise ApiError(400, "Image must be under 8MB.", "bad_image")
        magic = {b"\x89PNG": "png", b"\xff\xd8\xff": "jpg", b"RIFF": "webp"}
        ext = next((v for k, v in magic.items() if raw.startswith(k)), None)
        if not ext:
            raise ApiError(400, "Unrecognised image file.", "bad_image")
        path = os.path.join(UP_DIR, "%s.%s" % (jid, ext))
        with open(path, "wb") as f:
            f.write(raw)
        return path

    def owned_job(self, jid):
        j = db.one("SELECT * FROM jobs WHERE id=?", (jid,))
        if not j:
            raise ApiError(404, "No such job.", "not_found")
        u = self.user()
        if j["user_id"] is not None:
            if not u or u["id"] != j["user_id"]:
                raise ApiError(404, "No such job.", "not_found")
        elif j["guest_key"] != self.guest_key():
            raise ApiError(404, "No such job.", "not_found")
        return j

    def get_job(self, jid, video):
        j = self.owned_job(jid)
        if not video:
            return self.reply(200, job_json(j))
        if j["status"] != "succeeded" or not j["file"] or not os.path.exists(j["file"]):
            raise ApiError(404, "Video not available.", "not_ready")
        self.send_file(j["file"], "video/mp4")

    def delete_job(self, jid):
        j = self.owned_job(jid)
        rm(j["file"])
        rm(j["ref_image"])
        db.x("DELETE FROM jobs WHERE id=?", (jid,))
        self.reply(200, {"ok": True})

    def library(self):
        u = self.user()
        if u:
            rows = db.q("SELECT * FROM jobs WHERE user_id=? ORDER BY created DESC LIMIT 100", (u["id"],))
        else:
            rows = db.q("SELECT * FROM jobs WHERE guest_key=? ORDER BY created DESC LIMIT 100",
                        (self.guest_key(),))
        self.reply(200, {"items": [job_json(j) for j in rows]})

    # --- Explore feed
    def feed_list(self):
        rows = db.q("SELECT f.*, j.duration, j.prompt FROM feed f JOIN jobs j ON j.id=f.job_id "
                    "ORDER BY f.created DESC LIMIT 50")
        u = self.user()
        self.reply(200, {"posts": [{
            "id": r["id"], "creator": r["creator"], "caption": r["caption"] or r["prompt"],
            "duration": r["duration"], "created": r["created"],
            "video_url": "/api/v1/feed/%s/video" % r["id"],
            "mine": bool(u and u["id"] == r["user_id"])} for r in rows]})

    def feed_post(self):
        u = self.user(True)
        b = self.body()
        j = self.owned_job(str(b.get("generation_id", "")))
        if j["status"] != "succeeded":
            raise ApiError(400, "Only finished videos can be shared.", "not_ready")
        if db.one("SELECT 1 FROM feed WHERE job_id=?", (j["id"],)):
            raise ApiError(409, "Already shared.", "exists")
        creator = (str(b.get("creator") or u["name"] or "Creator").strip() or "Creator")[:40]
        caption = str(b.get("caption") or "").strip()[:300]
        pid = secrets.token_hex(8)
        db.x("INSERT INTO feed VALUES(?,?,?,?,?,?)", (pid, u["id"], j["id"], creator, caption, now()))
        self.reply(201, {"id": pid})

    def feed_video(self, pid):
        r = db.one("SELECT j.file FROM feed f JOIN jobs j ON j.id=f.job_id WHERE f.id=?", (pid,))
        if not r or not r["file"] or not os.path.exists(r["file"]):
            raise ApiError(404, "Not found.", "not_found")
        self.send_file(r["file"], "video/mp4")

    def feed_delete(self, pid):
        u = self.user(True)
        r = db.one("SELECT * FROM feed WHERE id=? AND user_id=?", (pid, u["id"]))
        if not r:
            raise ApiError(404, "Not found.", "not_found")
        db.x("DELETE FROM feed WHERE id=?", (pid,))
        self.reply(200, {"ok": True})

    # --- billing (Stripe, your account)
    def need_billing(self):
        if not (STRIPE_KEY and STRIPE_WHSEC):
            raise ApiError(503, "Billing is not configured on this server.", "not_configured")

    def checkout(self):
        self.need_billing()
        u = self.user(True)
        plan = str(self.body().get("plan", ""))
        if plan not in STRIPE_PRICES or not STRIPE_PRICES[plan]:
            raise ApiError(400, "Unknown or unconfigured plan.", "bad_plan")
        data = {"mode": "subscription", "line_items[0][price]": STRIPE_PRICES[plan],
                "line_items[0][quantity]": "1", "client_reference_id": str(u["id"]),
                "success_url": PUBLIC_URL + "/?billing=success", "cancel_url": PUBLIC_URL + "/?billing=cancel",
                "metadata[plan]": plan, "metadata[user_id]": str(u["id"]),
                "subscription_data[metadata][plan]": plan, "subscription_data[metadata][user_id]": str(u["id"])}
        if u["stripe_customer"]:
            data["customer"] = u["stripe_customer"]
        elif u["email"]:
            data["customer_email"] = u["email"]
        r = http_json("https://api.stripe.com/v1/checkout/sessions", data, form=True, auth=(STRIPE_KEY, ""))
        if r.get("_http_error") or not r.get("url"):
            raise ApiError(502, "Could not start checkout.", "stripe_error")
        self.reply(200, {"url": r["url"]})

    def portal(self):
        self.need_billing()
        u = self.user(True)
        if not u["stripe_customer"]:
            raise ApiError(400, "No subscription to manage.", "no_customer")
        r = http_json("https://api.stripe.com/v1/billing_portal/sessions",
                      {"customer": u["stripe_customer"], "return_url": PUBLIC_URL + "/"},
                      form=True, auth=(STRIPE_KEY, ""))
        if r.get("_http_error") or not r.get("url"):
            raise ApiError(502, "Could not open billing portal.", "stripe_error")
        self.reply(200, {"url": r["url"]})

    def webhook(self):
        self.need_billing()
        raw = self.body(raw=True)
        if not verify_stripe(raw, self.headers.get("Stripe-Signature", ""), STRIPE_WHSEC):
            raise ApiError(400, "Bad signature.", "bad_signature")
        ev = json.loads(raw.decode())
        apply_stripe_event(ev)
        self.reply(200, {"received": True})


def verify_stripe(payload, header, secret, tolerance=300):
    try:
        parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
        ts = int(parts["t"])
        sigs = [p.split("=", 1)[1] for p in header.split(",") if p.startswith("v1=")]
    except Exception:
        return False
    if abs(time.time() - ts) > tolerance:
        return False
    exp = hmac.new(secret.encode(), ("%d." % ts).encode() + payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(exp, s) for s in sigs)


def plan_from_price(price_id):
    for k, v in STRIPE_PRICES.items():
        if v and v == price_id:
            return k
    return None


def apply_stripe_event(ev):
    t, o = ev.get("type"), (ev.get("data") or {}).get("object") or {}
    if t == "checkout.session.completed":
        uid = o.get("client_reference_id") or (o.get("metadata") or {}).get("user_id")
        plan = (o.get("metadata") or {}).get("plan")
        if uid and plan in PLANS:
            db.x("UPDATE users SET plan=?, stripe_customer=?, stripe_sub=? WHERE id=?",
                 (plan, o.get("customer"), o.get("subscription"), int(uid)))
    elif t in ("customer.subscription.updated", "customer.subscription.created"):
        items = ((o.get("items") or {}).get("data") or [{}])
        plan = (o.get("metadata") or {}).get("plan") or plan_from_price((items[0].get("price") or {}).get("id"))
        if o.get("status") in ("active", "trialing") and plan in PLANS:
            db.x("UPDATE users SET plan=?, stripe_sub=? WHERE stripe_customer=?", (plan, o.get("id"), o.get("customer")))
        elif o.get("status") in ("canceled", "unpaid", "incomplete_expired", "past_due"):
            db.x("UPDATE users SET plan='free' WHERE stripe_customer=?", (o.get("customer"),))
    elif t == "customer.subscription.deleted":
        db.x("UPDATE users SET plan='free', stripe_sub=NULL WHERE stripe_customer=?", (o.get("customer"),))


# ---------------------------------------------------------------- main
def main():
    # a restart must not leave jobs stuck "running"
    db.x("UPDATE jobs SET status='failed', message='Server restarted during generation.' WHERE status='running'")
    threading.Thread(target=worker_loop, daemon=True).start()
    threading.Thread(target=cleanup_loop, daemon=True).start()
    host, port = ENV("FRANK_HOST", "0.0.0.0"), int(ENV("FRANK_PORT", "8000"))
    srv = ThreadingHTTPServer((host, port), H)
    h = ADAPTER.health()
    print("%s  http://%s:%d  provider=%s ready=%s" % (VERSION, host, port, h["provider"], h["ready"]))
    if not h["ready"]:
        print("  engine not ready:", h.get("reason"))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
