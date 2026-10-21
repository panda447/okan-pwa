"""おかんアプリ PWA: 標準ライブラリだけで動く、ローカル専用サーバ。

- 127.0.0.1 にだけ bind する（外部ネットワークからは見えない）
- データは data/data.json に保存する（一時ファイル経由のアトミック書き込み）
- 起動: python server.py [--port 8766]
"""
import argparse
import json
import mimetypes
import os
import shutil
import sys
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Windows はレジストリ次第で .js を text/plain で返す。ESモジュールは JS の MIME でないと読めない
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "data.json"
MAX_BODY = 5 * 1024 * 1024
BACKUP_KEEP = 20
LIST_KEYS = ("schedules", "goals", "goal_logs", "weather_cache", "interventions")
lock = threading.Lock()


def empty_data():
    data = {"version": 1, "settings": None}
    data.update({k: [] for k in LIST_KEYS})
    return data


def load_data():
    if not DATA_FILE.exists():
        return empty_data()
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    DATA_DIR.mkdir(exist_ok=True)
    if DATA_FILE.exists():
        backups = DATA_DIR / "backups"
        backups.mkdir(exist_ok=True)
        # 1日1回だけ、書き換え前の状態を退避する
        target = backups / f"data-{time.strftime('%Y%m%d')}.json"
        if not target.exists():
            shutil.copy2(DATA_FILE, target)
            for old in sorted(backups.glob("data-*.json"))[:-BACKUP_KEEP]:
                old.unlink()
    tmp = DATA_FILE.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


def valid_shape(data):
    if not isinstance(data, dict):
        return False
    if not all(isinstance(data.get(k), list) for k in LIST_KEYS):
        return False
    return data.get("settings") is None or isinstance(data.get("settings"), dict)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    # DNS rebinding 対策: Host が localhost 系でなければ拒否
    def host_ok(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        return host in ("127.0.0.1", "localhost", "::1")

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        # 開発中に古いJSが残らないよう、静的ファイルも毎回確認させる
        if not self._headers_buffer_has("Cache-Control"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _headers_buffer_has(self, name):
        return any(line.lower().startswith(name.lower().encode() + b":") for line in getattr(self, "_headers_buffer", []))

    def do_GET(self):
        if not self.host_ok():
            return self.send_error(HTTPStatus.FORBIDDEN)
        if self.path.split("?")[0] == "/api/data":
            with lock:
                try:
                    return self.send_json(HTTPStatus.OK, load_data())
                except (OSError, json.JSONDecodeError) as e:
                    return self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(e)})
        return super().do_GET()

    def do_PUT(self):
        if not self.host_ok():
            return self.send_error(HTTPStatus.FORBIDDEN)
        if self.path.split("?")[0] != "/api/data":
            return self.send_error(HTTPStatus.NOT_FOUND)
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return self.send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "json only"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "bad size"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid json"})
        if not valid_shape(data):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid shape"})
        with lock:
            try:
                save_data(data)
            except OSError as e:
                return self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(e)})
        return self.send_json(HTTPStatus.OK, {"ok": True, "savedAt": int(time.time())})

    def log_message(self, fmt, *args):
        line = fmt % args
        if "/api/" in line or "code " in line:
            sys.stderr.write("[log] " + line + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"おかんアプリ: http://127.0.0.1:{args.port}/  (Ctrl+C で終了)")
    print(f"データ: {DATA_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
