import os
import time
import requests
from flask import Blueprint, jsonify

daily_bp = Blueprint("daily", __name__, url_prefix="/api/daily")

DAILY_API_KEY = os.getenv("DAILY_API_KEY")          # set on Render
DAILY_ROOM_NAME = os.getenv("DAILY_ROOM_NAME", "")  # set on Render (e.g., "demo")

@daily_bp.get("/token")
def daily_token():
    if not DAILY_API_KEY:
        return jsonify({"error": "DAILY_API_KEY not configured"}), 500
    if not DAILY_ROOM_NAME:
        return jsonify({"error": "DAILY_ROOM_NAME not configured"}), 500

    url = "https://api.daily.co/v1/meeting-tokens"
    headers = {"Authorization": f"Bearer {DAILY_API_KEY}"}
    body = {
        "properties": {
            "room_name": DAILY_ROOM_NAME,
            # short expiry (10 mins)
            "exp": int(time.time()) + 10 * 60,
            "is_owner": False,
        }
    }
    r = requests.post(url, json=body, headers=headers, timeout=10)
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        return jsonify({"error": "daily_api_error", "detail": detail}), 502

    token = r.json().get("token")
    return jsonify({"token": token})
