"""Minimal ElevenLabs Agents API client shared by the deploy and eval scripts."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://api.elevenlabs.io"
STATE_FILE = ROOT / "agent" / "deployed.json"


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"'))


def api_key() -> str:
    _load_dotenv()
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("ELEVENLABS_API_KEY is not set (add it to .env, see .env.example).")
    return key


def call(method: str, path: str, payload: dict | None = None, retries: int = 3, **kwargs):
    """Call the API and return parsed JSON. Retries on rate limits and 5xx."""
    headers = {"xi-api-key": api_key()}
    for attempt in range(retries):
        resp = requests.request(method, BASE_URL + path, json=payload, headers=headers, timeout=120, **kwargs)
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries - 1:
            time.sleep(2 ** attempt * 2)
            continue
        if not resp.ok:
            raise RuntimeError(f"{method} {path} -> {resp.status_code}: {resp.text[:800]}")
        return resp.json() if resp.content else {}
    raise RuntimeError("unreachable")


def load_state() -> dict:
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
