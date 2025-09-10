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

/* --- Config / ENV --- */
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET_KEY || "dev-secret";
const DAILY_API_KEY = process.env.DAILY_API_KEY || "";
const DAILY_ROOM_NAME = process.env.DAILY_ROOM_NAME || "";

function readOrigins() {
  const raw =
    process.env.FRONTEND_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173,https://nova-project-lac.vercel.app";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
const ALLOWED_ORIGINS = readOrigins();

/* --- DB (SQLite) --- */
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

/* --- App & HTTP server --- */
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

/* --- Helpers --- */
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

/* --- REST --- */
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/auth/register", (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "missing_fields" });
  }
  const normEmail = String(email).toLowerCase().trim();
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(normEmail);
  if (exists) return res.status(400).json({ error: "email_taken" });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"
  ).run(username, normEmail, hash);

  return res.json({ message: "User registered" });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "missing_fields" });
  }
  const normEmail = String(email).toLowerCase().trim();

  const user = db
    .prepare("SELECT id, username, email, password_hash FROM users WHERE email = ?")
    .get(normEmail);
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const access_token = makeToken(user);
  return res.json({
    access_token,
    user: { id: user.id, username: user.username, email: user.email },
  });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const row = db
    .prepare("SELECT id, username, email FROM users WHERE id = ?")
    .get(req.user.sub);
  if (!row) return res.status(404).json({ error: "user_not_found" });
  return res.json(row);
});

/* --- Daily helpers (optional) --- */
app.post("/api/daily/ensure-room", async (req, res) => {
  try {
    if (!DAILY_API_KEY) return res.status(500).json({ error: "DAILY_API_KEY not configured" });
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "missing_room_name" });

    const headers = { Authorization: `Bearer ${DAILY_API_KEY}` };
    try {
      const r = await axios.get(`https://api.daily.co/v1/rooms/${encodeURIComponent(name)}`, { headers });
      return res.json({ name, url: r.data.url });
    } catch (e) {
      if (e.response && e.response.status !== 404) throw e;
    }
    const body = { name, properties: { enable_screenshare: true, exp: Math.floor(Date.now()/1000) + 3600 } };
    const r = await axios.post("https://api.daily.co/v1/rooms", body, { headers });
    return res.json({ name, url: r.data.url });
  } catch (err) {
    console.error("ensure-room error", err?.response?.data || err.message);
    return res.status(502).json({ error: "daily_api_error", detail: err?.response?.data || err.message });
  }
});

app.get("/api/daily/token", async (req, res) => {
  try {
    if (!DAILY_API_KEY) return res.status(500).json({ error: "DAILY_API_KEY not configured" });
    const room = (req.query.room || DAILY_ROOM_NAME || "").trim();
    if (!room) return res.status(400).json({ error: "missing_room_name" });

    const headers = { Authorization: `Bearer ${DAILY_API_KEY}` };
    const body = { properties: { room_name: room, is_owner: false, exp: Math.floor(Date.now()/1000) + 10 * 60 } };
    const r = await axios.post("https://api.daily.co/v1/meeting-tokens", body, { headers });
    return res.json({ token: r.data.token });
  } catch (err) {
    console.error("daily-token error", err?.response?.data || err.message);
    return res.status(502).json({ error: "daily_api_error", detail: err?.response?.data || err.message });
  }
});

/* --- Socket.IO signaling (use adapter, not a custom map) --- */
const io = new IOServer(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"], credentials: true },
  path: "/socket.io",
});

function getCount(room) {
  return io.sockets.adapter.rooms.get(room)?.size ?? 0;
}

io.on("connection", (socket) => {
  console.log("[socket] connected:", socket.id);

  // when the socket is about to go away, notify peers in its rooms
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit("peer-left", { room });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("[socket] disconnected:", socket.id);
  });

  socket.on("join", async ({ room }) => {
    room = room || "demo";

    const count = getCount(room);
    if (count >= 2) {
      socket.emit("full", { room, count });
      console.warn("[room] full", room, "count=", count);
      return;
    }

    await socket.join(room);
    const newCount = getCount(room);

    socket.emit("joined", { room, count: newCount, sid: socket.id });
    console.log("[room] join", { room, newCount, sid: socket.id });

    if (newCount === 2) {
      // Make the *second* joiner the initiator
      const ids = Array.from(io.sockets.adapter.rooms.get(room) || []);
      const initiator = ids[ids.length - 1];
      io.to(room).emit("ready", { room, initiator });
      console.log("[room] ready → initiator", initiator, "room", room);
    }
  });

  socket.on("leave", async ({ room }) => {
    try {
      await socket.leave(room);
      socket.to(room).emit("peer-left", { room });
      console.log("[room] leave", { room, sid: socket.id, leftCount: getCount(room) });
    } catch {}
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

/* --- Start --- */
server.listen(PORT, () => {
  console.log(`Node backend listening on ${PORT}`);
  console.log("Allowed origins:", ALLOWED_ORIGINS);
});
