"""開発用の静的ファイルサーバ（データは保存しない。保存はブラウザ内）。

本番はGitHub Pagesに public/ を置くだけなのでサーバは要らない。
ローカルで確かめるときだけ使う: python server.py [--port 8766]
"""
import argparse
import mimetypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Windows はレジストリ次第で .js を text/plain で返す。ESモジュールは JS の MIME でないと読めない
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")

PUBLIC = Path(__file__).resolve().parent / "public"


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 開発中に古いJSが残らないよう、毎回確認させる
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(PUBLIC)))
    print(f"おかんアプリ(開発用): http://127.0.0.1:{args.port}/  (Ctrl+C で終了)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
