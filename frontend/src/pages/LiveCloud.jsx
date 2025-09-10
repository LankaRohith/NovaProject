import { useEffect, useState } from "react";

export default function LiveCloud() {
  const API = import.meta.env.VITE_API_URL; // e.g. https://novaproject-node.onrender.com
  const [room, setRoom] = useState("demo");
  const [src, setSrc] = useState("");
  const [msg, setMsg] = useState("");

  async function createAndJoin(r) {
    setMsg("Preparing room…");
    setSrc("");

    try {
      // 1) Ensure room exists (creates if missing)
      const ensure = await fetch(`${API}/api/daily/ensure-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: r }),
      });
      if (!ensure.ok) throw new Error(`ensure-room failed (${ensure.status})`);
      const { url } = await ensure.json(); // url like https://<subdomain>.daily.co/<room>

      // 2) Get token for that room
      setMsg("Fetching token…");
      const tokRes = await fetch(`${API}/api/daily/token?room=${encodeURIComponent(r)}`);
      if (!tokRes.ok) throw new Error(`token failed (${tokRes.status})`);
      const { token } = await tokRes.json();

      // 3) Build iframe src with token & autojoin
      setSrc(`${url}?t=${encodeURIComponent(token)}&autojoin=1`);
      setMsg("");
    } catch (e) {
      console.error(e);
      setMsg(e.message || "Failed to create/join the room.");
    }
  }

  useEffect(() => {
    // auto load default room once
    createAndJoin(room);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container" style={{paddingTop:"6vh", paddingBottom:"6vh"}}>
      <div className="card">
        <div className="card-header" style={{display:"flex", gap:12, alignItems:"center"}}>
          <div style={{flex:1}}>Live (Cloud)</div>
          <input
            style={{maxWidth:240}}
            value={room}
            onChange={(e) => setRoom(e.target.value.trim())}
            placeholder="room name"
          />
          <button className="btn" onClick={() => createAndJoin(room)}>Create & Join</button>
        </div>
        <div className="card-body">
          {msg && <div className="badge" style={{marginBottom:12}}>{msg}</div>}
          <iframe
            src={src || "about:blank"}
            allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
            className="video"
            style={{height:"75vh", border:"0"}}
            title="Daily Prebuilt Call"
          />
        </div>
      </div>
    </div>
  );
}
