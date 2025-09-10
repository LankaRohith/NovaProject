/* eslint-disable no-console */
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const Database = require("better-sqlite3");
const { Server: IOServer } = require("socket.io");

dotenv.config();

/* ---------- Config / ENV ---------- */
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET_KEY || "dev-secret";
const DAILY_API_KEY = process.env.DAILY_API_KEY || "";
const DAILY_ROOM_NAME = process.env.DAILY_ROOM_NAME || "";

// Parse and normalize allowed origins (strip trailing slash)
function readOrigins() {
  const raw =
    process.env.FRONTEND_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}
const ALLOWED_ORIGINS = readOrigins();

/* ---------- DB (SQLite) ---------- */
const dbFile = process.env.DATABASE_PATH || path.join(process.cwd(), "nova.db");
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

/* ---------- App & HTTP server ---------- */
const app = express();
const server = http.createServer(app);

// Basic hardening + parsers
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS that tolerates trailing-slash differences
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // allow curl / health checks
      const cleaned = origin.replace(/\/$/, "");
      if (ALLOWED_ORIGINS.includes(cleaned)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

/* ---------- Helpers ---------- */
function makeToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || "";
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_token" });
  try {
    req.user = jwt.verify(m[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

/* ---------- REST (Auth + Health) ---------- */
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// POST /api/auth/register  {username|name, email, password}
app.post("/api/auth/register", (req, res) => {
  // accept both "username" (new UI) and "name" (older UI)
  const username = (req.body?.username ?? req.body?.name ?? "").toString().trim();
  const email = (req.body?.email ?? "").toString().trim().toLowerCase();
  const password = (req.body?.password ?? "").toString();

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "missing_fields", detail: { username: !!username, email: !!email, password: !!password } });
  }

  try {
    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) return res.status(400).json({ error: "email_taken" });

    const hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)")
      .run(username, email, hash);

    return res.json({ message: "User registered" });
  } catch (e) {
    console.error("REGISTER error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/auth/login  {email, password} -> {access_token, user}
app.post("/api/auth/login", (req, res) => {
  const email = (req.body?.email ?? "").toString().trim().toLowerCase();
  const password = (req.body?.password ?? "").toString();

  if (!email || !password) {
    return res.status(400).json({ error: "missing_fields" });
  }

  try {
    const user = db
      .prepare("SELECT id, username, email, password_hash FROM users WHERE email = ?")
      .get(email);
    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const access_token = makeToken(user);
    return res.json({
      access_token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (e) {
    console.error("LOGIN error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/auth/me (Bearer)
app.get("/api/auth/me", authMiddleware, (req, res) => {
  try {
    const row = db
      .prepare("SELECT id, username, email FROM users WHERE id = ?")
      .get(req.user.sub);
    if (!row) return res.status(404).json({ error: "user_not_found" });
    return res.json(row);
  } catch (e) {
    console.error("ME error:", e);
    return res.status(500).json({ error: "server_error" });
  }
});

/* ---------- Daily helpers (optional) ---------- */

// POST /api/daily/ensure-room { name }  (creates if missing; returns {name,url})
app.post("/api/daily/ensure-room", async (req, res) => {
  try {
    if (!DAILY_API_KEY) {
      return res.status(500).json({ error: "DAILY_API_KEY not configured" });
    }
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "missing_room_name" });

    const headers = { Authorization: `Bearer ${DAILY_API_KEY}` };

    // Try GET room
    try {
      const r = await axios.get(
        `https://api.daily.co/v1/rooms/${encodeURIComponent(name)}`,
        { headers }
      );
      return res.json({ name, url: r.data.url });
    } catch (e) {
      if (!e.response || e.response.status !== 404) throw e;
    }

    // Create room (public; switch to privacy: 'private' for tokens only)
    const body = {
      name,
      properties: { enable_screenshare: true, exp: Math.floor(Date.now() / 1000) + 3600 },
    };
    const r = await axios.post("https://api.daily.co/v1/rooms", body, { headers });
    return res.json({ name, url: r.data.url });
  } catch (err) {
    console.error("ensure-room error", err?.response?.data || err.message);
    return res.status(502).json({
      error: "daily_api_error",
      detail: err?.response?.data || err.message,
    });
  }
});

// GET /api/daily/token?room=<name>  -> {token}
app.get("/api/daily/token", async (req, res) => {
  try {
    if (!DAILY_API_KEY) return res.status(500).json({ error: "DAILY_API_KEY not configured" });
    const room = (req.query.room || DAILY_ROOM_NAME || "").trim();
    if (!room) return res.status(400).json({ error: "missing_room_name" });

    const headers = { Authorization: `Bearer ${DAILY_API_KEY}` };
    const body = {
      properties: {
        room_name: room,
        is_owner: false,
        exp: Math.floor(Date.now() / 1000) + 10 * 60,
      },
    };
    const r = await axios.post("https://api.daily.co/v1/meeting-tokens", body, { headers });
    return res.json({ token: r.data.token });
  } catch (err) {
    console.error("daily-token error", err?.response?.data || err.message);
    return res.status(502).json({
      error: "daily_api_error",
      detail: err?.response?.data || err.message,
    });
  }
});

/* ---------- Socket.IO signaling ---------- */
const io = new IOServer(server, {
  cors: {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const cleaned = origin.replace(/\/$/, "");
      if (ALLOWED_ORIGINS.includes(cleaned)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  path: "/socket.io",
});

const roomMembers = new Map(); // room -> Set(sid)

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    for (const [room, set] of roomMembers) {
      if (set.delete(socket.id)) {
        socket.leave(room);
        if (set.size === 0) roomMembers.delete(room);
        io.to(room).emit("peer-left", { room });
      }
    }
  });

  socket.on("join", ({ room }) => {
    room = room || "demo";
    const set = roomMembers.get(room) || new Set();
    if (set.size >= 2 && !set.has(socket.id)) {
      socket.emit("full", { room });
      return;
    }
    socket.join(room);
    set.add(socket.id);
    roomMembers.set(room, set);

    const count = set.size;
    socket.emit("joined", { room, count, sid: socket.id });

    if (count === 2) {
      const initiator = socket.id; // second joiner starts
      io.to(room).emit("ready", { room, initiator });
    }
  });

  socket.on("leave", ({ room }) => {
    const set = roomMembers.get(room);
    if (set && set.delete(socket.id)) {
      socket.leave(room);
      io.to(room).emit("peer-left", { room });
      if (set.size === 0) roomMembers.delete(room);
    }
  });

  socket.on("offer", ({ room, sdp }) => {
    if (!room || !sdp) return;
    socket.to(room).emit("offer", { sdp });
  });

  socket.on("answer", ({ room, sdp }) => {
    if (!room || !sdp) return;
    socket.to(room).emit("answer", { sdp });
  });

  socket.on("ice-candidate", ({ room, candidate }) => {
    if (!room || !candidate) return;
    socket.to(room).emit("ice-candidate", { candidate });
  });
});

/* ---------- Start ---------- */
server.listen(PORT, () => {
  console.log(`Node backend listening on ${PORT}`);
  console.log("Allowed origins:", ALLOWED_ORIGINS);
});
