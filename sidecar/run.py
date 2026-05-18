"""Frozen-binary entrypoint (PyInstaller). In dev the app spawns
``python -m uvicorn main:app``; the packaged build spawns this instead:

    lora-sidecar --host 127.0.0.1 --port <port>
"""

import argparse

import uvicorn

from main import app

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
