// frontend/src/pages/LiveCloud.jsx
import { useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, ""); // e.g. https://your-render.onrender.com

export default function LiveCloud() {
  const [room, setRoom] = useState("");
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function parseJsonOrThrow(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 160)}`);
    }
  }

  async function createAndJoin() {
    const clean = room.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!clean) {
      setMsg("Enter a room name (letters, numbers, dash).");
      return;
    }
    if (!API_BASE) {
      setMsg("VITE_API_URL is not set on the frontend.");
      return;
    }

    setBusy(true);
    setMsg("Creating (or finding) room…");

    try {
      // Create (idempotent: if exists, backend returns it)
      const mk = await fetch(`${API_BASE}/api/daily/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, privacy: "private" }),
      });
      const mkData = await parseJsonOrThrow(mk);
      if (!mk.ok) throw new Error(mkData.error || mk.statusText);

      const roomUrl = mkData.room?.url;
      if (!roomUrl) throw new Error("No room URL returned from server.");

      setMsg("Fetching token…");
      const tk = await fetch(`${API_BASE}/api/daily/token?room=${encodeURIComponent(clean)}`);
      const tkData = await parseJsonOrThrow(tk);
      if (!tk.ok) throw new Error(tkData.error || tk.statusText);

      const token = tkData.token;
      setSrc(`${roomUrl}?t=${encodeURIComponent(token)}&autojoin=1`);
      setMsg("");
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    setSrc("");
    setMsg("");
  }

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-semibold mb-4">Live (Cloud)</h1>

      {!src ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            Type a room name. If it doesn’t exist, we’ll create it and join. If it exists, we’ll just join.
          </div>
          <div className="flex gap-2 items-center">
            <input
              className="border rounded p-2 w-64"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="demo-room"
            />
            <button className="btn" onClick={createAndJoin} disabled={busy || !room}>
              {busy ? "Working…" : "Create & Join"}
            </button>
          </div>
          {msg && <div className="text-sm text-gray-500">{msg}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button className="btn" onClick={leave}>Leave</button>
          </div>
          <iframe
            src={src}
            title="Daily Prebuilt Call"
            allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
            style={{ width: "100%", height: "80vh", border: 0, borderRadius: 12, background: "#000" }}
          />
        </div>
      )}
    </div>
  );
}
