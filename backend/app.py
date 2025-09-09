import os
from collections import defaultdict

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO, join_room, leave_room, emit

from database import Base, engine
from models import User, bcrypt  # noqa: F401 (import ensures bcrypt.init_app works)
from auth import auth_bp


load_dotenv()

def read_origins():
    raw = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]

ALLOWED_ORIGINS = read_origins()


# ---------------------------
# Flask app (REST + JWT)
# ---------------------------
def create_app():
    app = Flask(__name__)
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret")

    # JWT + bcrypt
    JWTManager(app)
    bcrypt.init_app(app)

    # CORS for REST API
    # CORS for REST
    CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}}, supports_credentials=True)


    # DB init
    Base.metadata.create_all(bind=engine)

    # REST routes
    app.register_blueprint(auth_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app


app = create_app()

# ---------------------------
# Socket.IO (signaling)
# ---------------------------
socketio = SocketIO(
    app,
    cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    async_mode="threading",   # works with built-in dev server
    # logger=True,             # uncomment for verbose logs
    # engineio_logger=True,    # uncomment for verbose logs
    # path="/socket.io",       # default is "/socket.io" (matches client)
)

# Track room membership (max 2 peers/room)
room_members = defaultdict(set)


def room_count(room: str) -> int:
    return len(room_members[room])


@socketio.on("connect")
def on_connect():
    print("Socket connected:", request.sid)


@socketio.on("disconnect")
def on_disconnect():
    print("Socket disconnected:", request.sid)
    # remove SID from any rooms it was in
    to_notify = []
    for r in list(room_members.keys()):
        if request.sid in room_members[r]:
            room_members[r].discard(request.sid)
            leave_room(r)
            to_notify.append(r)
            if room_count(r) == 0:
                room_members.pop(r, None)
    # tell the remaining peer (if any)
    for r in to_notify:
        emit("peer-left", {"room": r}, to=r)


@socketio.on("join")
def on_join(data):
    """
    data: { room: string }
    """
    room = (data or {}).get("room", "demo")
    if room_count(room) >= 2 and request.sid not in room_members[room]:
        emit("full", {"room": room})
        return

    join_room(room)
    room_members[room].add(request.sid)
    count = room_count(room)
    print(f"{request.sid} joined {room}. count={count}")

    # Informational: also used by client as a fallback initiator signal
    emit("joined", {"room": room, "sid": request.sid, "count": count})

    if count == 2:
        # Make the *second* joiner the initiator
        initiator = request.sid
        print(f"room {room}: emitting ready (initiator={initiator})")
        emit("ready", {"room": room, "initiator": initiator}, to=room)


@socketio.on("leave")
def on_leave(data):
    room = (data or {}).get("room", "demo")
    if request.sid in room_members[room]:
        room_members[room].discard(request.sid)
    leave_room(room)
    emit("peer-left", {"room": room}, to=room)


# ---- Signaling relays ----

@socketio.on("offer")
def on_offer(data):
    room = (data or {}).get("room")
    sdp = (data or {}).get("sdp")
    if not room or not sdp:
        return
    print(f"offer -> room {room}")
    emit("offer", {"sdp": sdp}, to=room, include_self=False)


@socketio.on("answer")
def on_answer(data):
    room = (data or {}).get("room")
    sdp = (data or {}).get("sdp")
    if not room or not sdp:
        return
    print(f"answer -> room {room}")
    emit("answer", {"sdp": sdp}, to=room, include_self=False)


@socketio.on("ice-candidate")
def on_ice_candidate(data):
    room = (data or {}).get("room")
    candidate = (data or {}).get("candidate")
    if not room or not candidate:
        return
    print(f"ice-candidate -> room {room}")
    emit("ice-candidate", {"candidate": candidate}, to=room, include_self=False)


# ---------------------------
# Entrypoint
# ---------------------------
# if __name__ == "__main__":
#     socketio.run(app, host="0.0.0.0", port=5001, debug=True)
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
