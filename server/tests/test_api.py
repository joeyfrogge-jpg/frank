"""End-to-end API tests. Starts the real server as a subprocess; stdlib only.

    python3 -m unittest discover -s server/tests -v

Needs ffmpeg/ffprobe for the pipeline tests (they use the SYNTHETIC selftest engine).
"""
import base64
import hashlib
import hmac
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(os.path.dirname(HERE), "server.py")
WHSEC = "whsec_test"
# 1x1 PNG
PNG = "data:image/png;base64," + base64.b64encode(base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)).decode()


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Srv:
    def __init__(self, **env):
        self.dir = tempfile.mkdtemp()
        self.port = free_port()
        e = dict(os.environ, FRANK_DATA=self.dir, FRANK_PORT=str(self.port), FRANK_HOST="127.0.0.1",
                 STRIPE_SECRET_KEY="sk_test_x", STRIPE_WEBHOOK_SECRET=WHSEC,
                 STRIPE_PRICE_PLUS="price_plus", STRIPE_PRICE_PREMIUM="price_prem",
                 STRIPE_PRICE_PLATINUM="price_plat")
        e.update(env)
        self.p = subprocess.Popen([sys.executable, SERVER], env=e, stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL)
        self.base = "http://127.0.0.1:%d" % self.port
        for _ in range(50):
            try:
                self.call("GET", "/api/v1/health")
                return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("server did not start")

    def stop(self):
        self.p.terminate()
        self.p.wait(5)
        shutil.rmtree(self.dir, ignore_errors=True)

    def call(self, method, path, body=None, token=None, raw=None, headers=None):
        h = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        if token:
            h["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                ct = r.headers.get("Content-Type", "")
                b = r.read()
                return r.status, (json.loads(b) if "json" in ct else b), r.headers
        except urllib.error.HTTPError as e:
            b = e.read()
            try:
                return e.code, json.loads(b), e.headers
            except Exception:
                return e.code, b, e.headers

    def wait_job(self, jid, token=None, headers=None, timeout=120):
        t0 = time.time()
        while time.time() - t0 < timeout:
            _, j, _ = self.call("GET", "/api/v1/generations/" + jid, token=token, headers=headers)
            if j["status"] in ("succeeded", "failed", "blocked"):
                return j
            time.sleep(0.5)
        raise AssertionError("job timed out")

    def upgrade(self, user_id, plan):
        payload = json.dumps({"type": "checkout.session.completed", "data": {"object": {
            "client_reference_id": str(user_id), "customer": "cus_%d" % user_id,
            "subscription": "sub_1", "metadata": {"plan": plan}}}}).encode()
        ts = int(time.time())
        sig = hmac.new(WHSEC.encode(), ("%d." % ts).encode() + payload, hashlib.sha256).hexdigest()
        return self.call("POST", "/api/v1/billing/webhook", raw=payload,
                         headers={"Stripe-Signature": "t=%d,v1=%s" % (ts, sig)})


class NoEngine(unittest.TestCase):
    """Path C: no GPU/weights -> honest 'blocked', never a fake 'generating'."""

    @classmethod
    def setUpClass(cls):
        cls.s = Srv(FRANK_PROVIDER="none")

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()

    def test_health_not_ready(self):
        _, h, _ = self.s.call("GET", "/api/v1/health")
        self.assertFalse(h["ready"])
        self.assertIn("reason", h["engine"])
        self.assertFalse(h["features"]["phone"])

    def test_guest_job_is_blocked_honestly(self):
        c, j, _ = self.s.call("POST", "/api/v1/generations", {"prompt": "a fox", "duration": 10},
                              headers={"X-Frank-Guest": "t1"})
        self.assertEqual(c, 202)
        self.assertEqual(j["status"], "blocked")
        self.assertIn("connect FRANKGPT server", j["message"])

    def test_rejects_bad_duration(self):
        c, j, _ = self.s.call("POST", "/api/v1/generations", {"prompt": "x", "duration": 5})
        self.assertEqual((c, j["code"]), (400, "bad_duration"))

    def test_guest_plan_limits(self):
        c, j, _ = self.s.call("POST", "/api/v1/generations", {"prompt": "x", "duration": 20},
                              headers={"X-Frank-Guest": "t2"})
        self.assertEqual((c, j["code"]), (402, "plan_duration"))
        c, j, _ = self.s.call("POST", "/api/v1/generations",
                              {"prompt": "x", "duration": 10, "reference_image": PNG, "mode": "i2v"})
        self.assertEqual((c, j["code"]), (402, "plan_i2v"))

    def test_auth_flow_and_password_hashing(self):
        c, r, _ = self.s.call("POST", "/api/v1/auth/register",
                              {"email": "A@b.co", "password": "short"})
        self.assertEqual(c, 400)
        c, r, _ = self.s.call("POST", "/api/v1/auth/register",
                              {"email": "A@b.co", "password": "longenough1", "name": "Ann"})
        self.assertEqual(c, 201)
        tok = r["token"]
        self.assertEqual(self.s.call("GET", "/api/v1/auth/me", token=tok)[1]["user"]["email"], "a@b.co")
        self.assertEqual(self.s.call("POST", "/api/v1/auth/register",
                                     {"email": "a@b.co", "password": "longenough1"})[0], 409)
        self.assertEqual(self.s.call("POST", "/api/v1/auth/login",
                                     {"email": "a@b.co", "password": "wrongwrong"})[0], 401)
        c, r2, _ = self.s.call("POST", "/api/v1/auth/login", {"email": "a@b.co", "password": "longenough1"})
        self.assertEqual(c, 200)
        import sqlite3
        con = sqlite3.connect(os.path.join(self.s.dir, "frank.sqlite3"))
        row = con.execute("select pw_hash from users").fetchone()[0]
        con.close()
        self.assertTrue(row.startswith("scrypt$"))
        self.assertNotIn("longenough1", row)
        self.s.call("POST", "/api/v1/auth/logout", token=tok)
        self.assertEqual(self.s.call("GET", "/api/v1/auth/me", token=tok)[0], 401)

    def test_not_configured_paths_are_honest(self):
        self.assertEqual(self.s.call("POST", "/api/v1/auth/google", {"credential": "x"})[0], 501)
        self.assertEqual(self.s.call("POST", "/api/v1/auth/phone/start", {"phone": "+15551234567"})[0], 501)

    def test_webhook_rejects_bad_signature(self):
        c, _, _ = self.s.call("POST", "/api/v1/billing/webhook", raw=b"{}",
                              headers={"Stripe-Signature": "t=1,v1=bad"})
        self.assertEqual(c, 400)

    def test_static_ui_and_no_server_leak(self):
        self.assertEqual(self.s.call("GET", "/index.html")[0], 200)
        self.assertEqual(self.s.call("GET", "/server/server.py")[0], 404)
        self.assertEqual(self.s.call("GET", "/.git/config")[0], 404)
        self.assertEqual(self.s.call("GET", "/../server/server.py")[0], 404)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg required")
class Pipeline(unittest.TestCase):
    """Synthetic engine: proves queue, N-segment stitch, trim and measured duration."""

    @classmethod
    def setUpClass(cls):
        cls.s = Srv(FRANK_PROVIDER="selftest", FRANK_CLIP_SECONDS="4")

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()

    def user(self, plan="free", email="u@x.co"):
        _, r, _ = self.s.call("POST", "/api/v1/auth/register", {"email": email, "password": "longenough1"})
        if plan != "free":
            self.assertEqual(self.s.upgrade(r["user"]["id"], plan)[0], 200)
        return r["token"], r["user"]["id"]

    def probe(self, data):
        p = os.path.join(self.s.dir, "probe.mp4")
        with open(p, "wb") as f:
            f.write(data)
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "default=nw=1:nk=1", p], capture_output=True, text=True).stdout
        return float(out)

    def test_10s_is_stitched_and_measured(self):
        tok, _ = self.user(email="ten@x.co")
        c, j, _ = self.s.call("POST", "/api/v1/generations", {"prompt": "p", "duration": 10}, token=tok)
        self.assertEqual((c, j["segment_total"]), (202, 3))  # ceil(10/4)
        j = self.s.wait_job(j["id"], tok)
        self.assertEqual(j["status"], "succeeded", j)
        self.assertTrue(j["watermark"])  # free plan
        c, vid, h = self.s.call("GET", j["video_url"], token=tok)
        self.assertEqual(c, 200)
        self.assertAlmostEqual(self.probe(vid), 10.0, delta=1.0)
        # range request (needed for <video> seeking)
        c, part, h = self.s.call("GET", j["video_url"], token=tok, headers={"Range": "bytes=0-99"})
        self.assertEqual((c, len(part)), (206, 100))

    def test_30s_premium_i2v_and_explore(self):
        tok, uid = self.user("premium", "prem@x.co")
        c, j, _ = self.s.call("POST", "/api/v1/generations",
                              {"prompt": "p", "duration": 30, "reference_image": PNG, "mode": "i2v"}, token=tok)
        self.assertEqual(c, 202, j)
        self.assertEqual(j["segment_total"], 8)
        j = self.s.wait_job(j["id"], tok, timeout=180)
        self.assertEqual(j["status"], "succeeded", j)
        self.assertFalse(j["watermark"])
        self.assertAlmostEqual(j["measured_duration"], 30.0, delta=1.0)
        # another user cannot read it
        tok2, _ = self.user(email="other@x.co")
        self.assertEqual(self.s.call("GET", "/api/v1/generations/" + j["id"], token=tok2)[0], 404)
        # Explore: post requires account, feed is public, video streams without auth
        self.assertEqual(self.s.call("POST", "/api/v1/feed", {"generation_id": j["id"]})[0], 401)
        c, p, _ = self.s.call("POST", "/api/v1/feed", {"generation_id": j["id"], "caption": "hi"}, token=tok)
        self.assertEqual(c, 201)
        c, f, _ = self.s.call("GET", "/api/v1/feed")
        self.assertEqual(f["posts"][0]["caption"], "hi")
        self.assertEqual(self.s.call("GET", f["posts"][0]["video_url"])[0], 200)
        self.assertEqual(self.s.call("DELETE", "/api/v1/feed/" + p["id"], token=tok2)[0], 404)
        self.assertEqual(self.s.call("DELETE", "/api/v1/feed/" + p["id"], token=tok)[0], 200)

    def test_daily_limit_and_account_delete(self):
        tok, _ = self.user(email="lim@x.co")
        for _ in range(3):
            self.assertEqual(self.s.call("POST", "/api/v1/generations",
                                         {"prompt": "p", "duration": 10}, token=tok)[0], 202)
        c, j, _ = self.s.call("POST", "/api/v1/generations", {"prompt": "p", "duration": 10}, token=tok)
        self.assertEqual((c, j["code"]), (429, "plan_daily"))
        self.assertEqual(self.s.call("DELETE", "/api/v1/auth/me", token=tok)[0], 200)
        self.assertEqual(self.s.call("GET", "/api/v1/auth/me", token=tok)[0], 401)

    def test_guest_job_private_to_guest(self):
        h1, h2 = {"X-Frank-Guest": "aaa"}, {"X-Frank-Guest": "bbb"}
        c, j, _ = self.s.call("POST", "/api/v1/generations", {"prompt": "p", "duration": 10}, headers=h1)
        self.assertEqual(c, 202)
        self.assertEqual(self.s.call("GET", "/api/v1/generations/" + j["id"], headers=h2)[0], 404)
        self.assertEqual(self.s.wait_job(j["id"], headers=h1)["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()
