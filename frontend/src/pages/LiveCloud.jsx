import { useEffect, useState } from "react";

export default function LiveCloud() {
  const ROOM_URL = (import.meta.env.VITE_DAILY_ROOM_URL || "").trim();
  const API_BASE = (import.meta.env.VITE_API_URL || "").trim();
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const looksValid = /^https:\/\/[^/]+\.daily\.co\/[^/]+$/.test(ROOM_URL);
    if (!ROOM_URL || !looksValid) {
      setErr(
        `VITE_DAILY_ROOM_URL looks wrong: "${ROOM_URL}". Expected https://novaai.daily.co/nova`
      );
      return;
    }
    if (!API_BASE) {
      setErr("VITE_API_URL is missing. Set it to your Render backend URL.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/daily/token`, { credentials: "omit" });
        if (!res.ok) throw new Error(`Token endpoint failed: ${res.status}`);
        const { token } = await res.json();
        // Pass token in the iframe URL
        setSrc(`${ROOM_URL}?t=${encodeURIComponent(token)}&autojoin=1`);
      } catch (e) {
        console.error(e);
        setErr("Failed to fetch Daily token. See console.");
      }
    })();
  }, [ROOM_URL, API_BASE]);

  if (err) return <div className="container p-8 text-red-600">{err}</div>;
  if (!src) return <div className="container p-8">Preparing your call…</div>;

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-semibold mb-4">Live (Cloud)</h1>
      <iframe
        src={src}
        title="Daily Prebuilt Call"
        allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
        style={{ width: "100%", height: "80vh", border: 0, borderRadius: 12, background: "#000" }}
      />
    </div>
  );
}
