#!/usr/bin/env python3
"""
model_stub_server.py

Tiny stdlib HTTP server for YuteStudio endpoint wiring.

Modes:
- `tts`: POST JSON, returns deterministic WAV bytes
- `image`: POST JSON, returns deterministic PNG bytes

This is not a real model backend. It exists to provide a stable HTTP surface
until real Kokoro / FLUX services are attached behind the same URLs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
import wave
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO


def silent_wav(duration_seconds: int = 2, sample_rate: int = 16000) -> bytes:
    n_samples = duration_seconds * sample_rate
    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(struct.pack("<" + "h" * n_samples, *([0] * n_samples)))
    return buf.getvalue()


def deterministic_png(seed: str, width: int = 1280, height: int = 720) -> bytes:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    base_r, base_g, base_b = digest[0], digest[1], digest[2]

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row_factor = y / max(height - 1, 1)
        for x in range(width):
            col_factor = x / max(width - 1, 1)
            r = int(base_r * (1 - col_factor) + (255 - base_r) * col_factor)
            g = int(base_g * (1 - row_factor) + (255 - base_g) * row_factor)
            b = int(base_b * (col_factor * row_factor))
            raw.extend((r & 0xFF, g & 0xFF, b & 0xFF))

    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat_data = zlib.compress(bytes(raw), level=6)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr_data)
        + chunk(b"IDAT", idat_data)
        + chunk(b"IEND", b"")
    )


def stub_mp4(duration_seconds: int = 2, width: int = 1280, height: int = 720) -> bytes:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
    with tempfile.TemporaryDirectory() as tmp:
        out = BytesIO()
        out_path = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        out_path.close()
        cmd = [
            ffmpeg,
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={width}x{height}:d={duration_seconds}",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r=16000:cl=mono",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            out_path.name,
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return open(out_path.name, "rb").read()
        finally:
            try:
                import os

                os.unlink(out_path.name)
            except OSError:
                pass


def make_handler(mode: str):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            if self.path.startswith("/health"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "mode": mode}).encode())
                return
            self.send_response(404)
            self.end_headers()

        def do_POST(self):  # noqa: N802
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(body.decode("utf-8") or "{}")
            except Exception:
                payload = {}
            if mode == "tts":
                duration = max(1, min(30, int(payload.get("duration", 2) or 2)))
                data = silent_wav(duration_seconds=duration)
                content_type = "audio/wav"
            elif mode == "image":
                prompt = str(payload.get("prompt") or payload.get("text") or "stub-image")
                data = deterministic_png(prompt)
                content_type = "image/png"
            else:
                duration = max(1, min(30, int(payload.get("duration", 2) or 2)))
                data = stub_mp4(duration_seconds=duration)
                content_type = "video/mp4"

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format, *args):  # noqa: A003
            return

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["tts", "image", "video"])
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(args.mode))
    print(json.dumps({"status": "listening", "mode": args.mode, "host": args.host, "port": args.port}))
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
