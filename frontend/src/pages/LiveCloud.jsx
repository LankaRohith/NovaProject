// frontend/src/pages/LiveCloud.jsx
import { useEffect, useMemo, useState } from "react";

export default function LiveCloud() {
  const API = import.meta.env.VITE_API_URL; // e.g. https://your-node.onrender.com
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const room = (query.get("room") || import.meta.env.VITE_DAILY_ROOM_NAME || "demo").trim();

  const [src, setSrc] = useState("");
  const [msg, setMsg] = useState("Connecting…");

  useEffect(() => {
    if (!API) {
      setMsg("Missing VITE_API_URL (backend URL)");
      return;
    }

    (async () => {
      try {
        // 1) Ensure the room exists (creates if missing) and get its Daily URL
        const ensure = await fetch(`${API}/api/daily/ensure-room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: room }),
        });
        if (!ensure.ok) throw new Error(`ensure-room failed (${ensure.status})`);
        const { url } = await ensure.json(); // https://<subdomain>.daily.co/<room>

        // 2) Fetch a short-lived token for this room
        const tokRes = await fetch(`${API}/api/daily/token?room=${encodeURIComponent(room)}`);
        if (!tokRes.ok) throw new Error(`token failed (${tokRes.status})`);
        const { token } = await tokRes.json();

        // 3) Build iframe src and auto-join
        setSrc(`${url}?t=${encodeURIComponent(token)}&autojoin=1`);
        setMsg("");
      } catch (e) {
        console.error(e);
        setMsg(e.message || "Failed to start the call.");
      }
    })();
  }, [API, room]);

  return (
    <div className="container" style={{ paddingTop: "6vh", paddingBottom: "6vh" }}>
      <div className="card">
        <div className="card-body">
          {msg && <div className="badge" style={{ marginBottom: 12 }}>{msg}</div>}
          <iframe
            src={src || "about:blank"}
            title="Daily Call"
            allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
            className="video"
            style={{ height: "75vh", width: "100%", border: 0, borderRadius: 12, background: "#000" }}
          />
        </div>
      </div>
    </div>
  );
}
