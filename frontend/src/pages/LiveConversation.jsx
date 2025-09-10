// frontend/src/pages/LiveConversation.jsx
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_HTTP_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5001";

/** Hard-coded Metered TURN (relay only) */
const TURN_USERNAME = "ad95b37e4bf3b0eb9e14533d";
const TURN_CREDENTIAL = "8I1sZn4tjmFGtb0M";
const ICE_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  { urls: "turn:standard.relay.metered.ca:80?transport=tcp",  username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  { urls: "turn:standard.relay.metered.ca:80",                username: TURN_USERNAME, credential: TURN_CREDENTIAL },
];

/** SDP helper: move H264 to the front of the m=video payload list */
function preferH264(sdp) {
  try {
    const lines = sdp.split(/\r?\n/);
    const mIndex = lines.findIndex(l => l.startsWith("m=video"));
    if (mIndex === -1) return sdp;

    // Find all payload types and H264 payloads
    const h264Pts = lines
      .filter(l => /^a=rtpmap:\d+\s+H264\/90000/i.test(l))
      .map(l => Number(l.match(/^a=rtpmap:(\d+)\s/i)[1]));

    if (!h264Pts.length) return sdp;

    const parts = lines[mIndex].trim().split(" ");
    const header = parts.slice(0, 3);     // ["m=video", port, "RTP/AVP" | "UDP/TLS/RTP/SAVPF", ...]
    const payloads = parts.slice(3).map(Number);

    // Keep order: H264 first (dedup), then the rest
    const reordered = [
      ...h264Pts.filter(pt => payloads.includes(pt)),
      ...payloads.filter(pt => !h264Pts.includes(pt))
    ];

    lines[mIndex] = [...header, ...reordered].join(" ");
    return lines.join("\r\n");
  } catch {
    return sdp;
  }
}

export default function LiveConversation() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const mySidRef = useRef(null);

  const startedRef = useRef(false);
  const makingOfferRef = useRef(false);

  const [active, setActive] = useState(false);
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState("demo");
  const [status, setStatus] = useState("Idle");
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [remoteMuted, setRemoteMuted] = useState(true);

  const logPC = (pc, tag = "PC") => {
    setStatus(`${tag} sig=${pc.signalingState} ice=${pc.iceConnectionState} gather=${pc.iceGatheringState}`);
    console.log(`[${tag}]`, {
      signaling: pc.signalingState,
      ice: pc.iceConnectionState,
      gathering: pc.iceGatheringState,
    });
  };

  const resetNegotiationFlags = () => { startedRef.current = false; makingOfferRef.current = false; };

  const createPeer = () => {
    console.log("[ICE] Using servers:", ICE_SERVERS);

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: "relay",               // TURN-only for reliability across networks
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && joined) {
        socketRef.current.emit("ice-candidate", { room, candidate: event.candidate });
      }
    };

    pc.onicecandidateerror = (e) => {
      console.error("[ICE] candidate error:", e.errorText || e.errorCode, e.url || "");
    };

    pc.ontrack = (event) => {
      console.log("[track] remote streams:", event.streams?.length, "tracks:", event.streams?.[0]?.getTracks()?.map(t => t.kind));
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        // iOS autoplay: start muted, then user can unmute
        (async () => {
          try { await remoteVideoRef.current.play(); }
          catch { try { remoteVideoRef.current.muted = true; await remoteVideoRef.current.play(); } catch {} }
        })();
      }
    };

    pc.onconnectionstatechange = async () => {
      console.log("[PC] connectionState:", pc.connectionState);
      if (pc.connectionState === "connected" || pc.connectionState === "completed") {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
            console.log("[ICE] selected pair:", { local: r.localCandidateId, remote: r.remoteCandidateId, protocol: r.protocol });
          }
        });
      }
    };
    pc.oniceconnectionstatechange = () => logPC(pc, "PC");
    pc.onicegatheringstatechange = () => logPC(pc, "PC");
    pc.onsignalingstatechange = () => logPC(pc, "PC");

    return pc;
  };

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current;

    const s = io(SOCKET_HTTP_URL, {
      transports: ["websocket", "polling"],
      path: "/socket.io",
      withCredentials: false,
    });

    s.on("connect", () => {
      mySidRef.current = s.id;
      setStatus("Signaling connected");
      console.log("[socket] connected; sid:", mySidRef.current);
    });

    s.on("connect_error", (err) => {
      setStatus(`Signaling error: ${err.message}`);
      console.error("[socket] connect_error:", err);
    });

    s.on("disconnect", () => setStatus("Signaling disconnected"));

    s.on("joined", ({ room: r, count, sid }) => {
      console.log("[socket] joined:", { r, count, sid, me: mySidRef.current });
      setStatus(`Joined ${r} (count=${count})`);
      // Fallback initiator in case 'ready' is missed
      if (count === 2 && !startedRef.current && pcRef.current) {
        startedRef.current = true;
        setTimeout(() => void makeOffer(), 80);
      }
    });

    s.on("ready", async ({ initiator }) => {
      console.log("[socket] ready; initiator:", initiator, "me:", mySidRef.current);
      if (!pcRef.current) return;
      if (mySidRef.current === initiator && !startedRef.current) {
        startedRef.current = true;
        setStatus("I am initiator — creating offer");
        setTimeout(() => void makeOffer(), 80);
      } else {
        setStatus("Waiting for offer from initiator…");
      }
    });

    s.on("offer", async ({ sdp }) => {
      if (!pcRef.current) return;
      try {
        if (pcRef.current.signalingState !== "stable") {
          await pcRef.current.setLocalDescription({ type: "rollback" });
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        let answer = await pcRef.current.createAnswer();
        // Prefer H264 on the way out (Safari-friendly)
        answer = new RTCSessionDescription({ type: "answer", sdp: preferH264(answer.sdp || "") });
        await pcRef.current.setLocalDescription(answer);
        s.emit("answer", { room, sdp: pcRef.current.localDescription });
        setStatus("Received offer → sent answer");
      } catch (e) {
        console.error("Error handling offer:", e);
        setStatus("Error handling offer (see console)");
      }
    });

    s.on("answer", async ({ sdp }) => {
      if (!pcRef.current) return;
      if (pcRef.current.signalingState !== "have-local-offer") return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        setStatus("Received answer");
      } catch (e) {
        console.error("Error handling answer:", e);
        setStatus("Error handling answer (see console)");
      }
    });

    s.on("ice-candidate", async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(candidate); }
      catch (e) { console.error("Error adding ICE candidate", e); }
    });

    s.on("peer-left", () => {
      setStatus("Peer left");
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      resetNegotiationFlags();
    });

    s.on("full", () => {
      setStatus("Room is full (max 2)");
      console.warn("[socket] room full — tap Full Stop on both devices and rejoin if stuck.");
    });

    socketRef.current = s;
    return s;
  };

  // ----- actions -----
  async function startLocal() {
    if (active) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      try { await localVideoRef.current.play(); } catch {}
    }
    setActive(true);
    setStatus("Local media started");
  }

  function stopLocal() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }

  function teardownPeerOnly() {
    resetNegotiationFlags();
    if (pcRef.current) {
      try { pcRef.current.getSenders().forEach((s) => s.track && s.track.stop()); } catch {}
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }

  function fullStop() {
    leaveRoom();
    teardownPeerOnly();
    stopLocal();
    setStatus("Idle");
  }

  async function joinRoom() {
    if (!active) { setStatus("Start local media first"); return; }

    pcRef.current = createPeer();

    // Add local tracks BEFORE any offer
    streamRef.current.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, streamRef.current);
    });

    // If browser supports codec preferences, push H264 to the top explicitly
    try {
      const transceivers = pcRef.current.getTransceivers?.() || [];
      transceivers.forEach((t) => {
        if ((t.sender?.track?.kind || t.receiver?.track?.kind) === "video" && t.setCodecPreferences) {
          const caps = RTCRtpSender.getCapabilities("video")?.codecs || [];
          const h264 = caps.filter(c => /H264\/90000/i.test(c.mimeType));
          const rest = caps.filter(c => !/H264\/90000/i.test(c.mimeType));
          if (h264.length) t.setCodecPreferences([...h264, ...rest]);
        }
      });
    } catch {}

    const s = ensureSocket();
    s.emit("join", { room });
    setJoined(true);
  }

  function leaveRoom() {
    if (socketRef.current && joined) socketRef.current.emit("leave", { room });
    setJoined(false);
    resetNegotiationFlags();
  }

  async function makeOffer() {
    if (!pcRef.current || makingOfferRef.current) return;
    try {
      makingOfferRef.current = true;
      let offer = await pcRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      // Prefer H264 in the offer SDP
      offer = new RTCSessionDescription({ type: "offer", sdp: preferH264(offer.sdp || "") });
      await pcRef.current.setLocalDescription(offer);
      socketRef.current?.emit("offer", { room, sdp: pcRef.current.localDescription });
    } finally {
      makingOfferRef.current = false;
    }
  }

  useEffect(() => {
    return () => {
      try { leaveRoom(); } catch {}
      try { teardownPeerOnly(); } catch {}
      try { stopLocal(); } catch {}
      try { socketRef.current?.disconnect(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    const audioTrack = streamRef.current?.getAudioTracks()?.[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMuted(!audioTrack.enabled);
    }
  }
  function toggleCamera() {
    const videoTrack = streamRef.current?.getVideoTracks()?.[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraOn(videoTrack.enabled);
    }
  }
  function toggleRemoteAudio() {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
    setRemoteMuted(remoteVideoRef.current.muted);
  }

  return (
    <div className="container" style={{ paddingTop: "6vh", paddingBottom: "6vh" }}>
      <div className="card">
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>Live Conversation (2-way)</div>
          <div className="badge">Status: {status}</div>
        </div>

        <div className="card-body">
          <div className="mt-2" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ color: "var(--muted)", fontSize: 14 }}>Room</label>
            <input style={{ maxWidth: 220 }} value={room} onChange={(e) => setRoom(e.target.value.trim())} placeholder="demo" />
            {!active ? (
              <button className="btn" onClick={startLocal}>Start Local</button>
            ) : (
              <button className="btn secondary" onClick={stopLocal}>Stop Local</button>
            )}
            {!joined ? (
              <button className="btn" onClick={joinRoom} disabled={!active}>Join</button>
            ) : (
              <button className="btn ghost" onClick={leaveRoom}>Leave</button>
            )}
            {active && (
              <>
                <button className="btn ghost" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
                <button className="btn ghost" onClick={toggleCamera}>{cameraOn ? "Camera Off" : "Camera On"}</button>
              </>
            )}
            <button className="btn danger" onClick={fullStop}>Full Stop</button>
            {/* Remote audio control (helps iOS autoplay policy) */}
            <button className="btn ghost" onClick={toggleRemoteAudio}>
              {remoteMuted ? "Remote Sound Off" : "Remote Sound On"}
            </button>
          </div>

          <div className="mt-6 grid-2">
            <div className="card">
              <div className="card-header">Local</div>
              <div className="card-body">
                <video ref={localVideoRef} className="video" autoPlay playsInline muted />
              </div>
            </div>

            <div className="card">
              <div className="card-header">Remote</div>
              <div className="card-body">
                {/* start muted for mobile autoplay; user can enable with the button */}
                <video ref={remoteVideoRef} className="video" autoPlay playsInline muted />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
