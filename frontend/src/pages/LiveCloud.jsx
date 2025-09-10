// src/pages/LiveCloud.jsx
export default function LiveCloud() {
    const ROOM_URL =
      import.meta.env.VITE_DAILY_ROOM_URL || "https://nova-project.daily.co/demo"; // fallback for local
  
    // Add any Daily Prebuilt query params you like:
    // - autojoin=1  -> join automatically
    // - userName=Bob  -> default display name
    // - enableRecording=cloud / transcriptionLang=en-US (if enabled on your account)
    const src = `${ROOM_URL}?autojoin=1`;
  
    return (
      <div className="container py-16">
        <h1 className="text-3xl font-semibold mb-4">Live (Cloud)</h1>
        <iframe
          src={src}
          title="Daily Prebuilt Call"
          // important permissions:
          allow="
            camera; microphone; display-capture; autoplay; clipboard-write;
            fullscreen; speaker-selection
          "
          style={{
            width: "100%",
            height: "80vh",
            border: 0,
            borderRadius: 12,
            background: "#000",
          }}
        />
      </div>
    );
  }
  