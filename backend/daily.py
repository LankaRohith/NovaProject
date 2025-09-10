# backend/daily.py
import os, time, re, requests
from flask import Blueprint, jsonify, request

daily_bp = Blueprint("daily", __name__, url_prefix="/api/daily")

DAILY_API_KEY = os.getenv("DAILY_API_KEY")  # set this on Render

def _auth_headers():
    return {"Authorization": f"Bearer {DAILY_API_KEY}"}

def _slugify(name: str) -> str:
    """lowercase, keep letters/numbers/dashes only"""
    return re.sub(r"[^a-z0-9-]", "", (name or "").lower())

@daily_bp.post("/rooms")
def create_room():
    """
    Body: { "name": "room-name", "privacy": "private"|"public" }
    Creates the room if missing. If it already exists, returns it.
    """
    if not DAILY_API_KEY:
        return jsonify({"error": "DAILY_API_KEY is not set on the server"}), 500

    data = request.get_json() or {}
    raw_name = data.get("name", "")
    name = _slugify(raw_name)
    privacy = data.get("privacy", "private")

    if not name:
        return jsonify({"error": "Invalid room name"}), 400

    url = "https://api.daily.co/v1/rooms"
    body = {
        "name": name,
        "privacy": privacy,  # "private" requires meeting tokens
        "properties": {
            # useful defaults; tweak as you like
            "enable_prejoin_ui": True,
            "max_participants": 4,
            "allow_knocking": False,
        },
    }
    r = requests.post(url, json=body, headers=_auth_headers(), timeout=10)

    if r.status_code == 409:
        # Room already exists — fetch it and return 200
        get_r = requests.get(f"https://api.daily.co/v1/rooms/{name}",
                             headers=_auth_headers(), timeout=10)
        if get_r.ok:
            return jsonify({"room": get_r.json()}), 200

    r.raise_for_status()
    return jsonify({"room": r.json()}), 201


@daily_bp.get("/token")
def meeting_token():
    """
    Query: ?room=<name>
    Returns { token } for a private room.
    """
    if not DAILY_API_KEY:
        return jsonify({"error": "DAILY_API_KEY is not set on the server"}), 500

    room = _slugify(request.args.get("room", ""))
    if not room:
        return jsonify({"error": "Missing room parameter"}), 400

    url = "https://api.daily.co/v1/meeting-tokens"
    body = {
        "properties": {
            "room_name": room,
            "exp": int(time.time()) + 10 * 60,  # token valid 10 minutes
            "is_owner": False,
        }
    }
    r = requests.post(url, json=body, headers=_auth_headers(), timeout=10)
    r.raise_for_status()
    return jsonify({"token": r.json()["token"]})
