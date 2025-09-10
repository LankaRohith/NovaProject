// frontend/src/pages/LiveConversation.jsx
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_HTTP_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5001";

/* Hard-coded Metered TURN */
const TURN_USERNAME = "ad95b37e4bf3b0eb9e14533d";
const TURN_CREDENTIAL = "8I1sZn4tjmFGtb0M";
const ICE_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  { urls: "turn:standard.relay.metered.ca:80?transport=tcp",  username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  { urls: "turn:standard.relay.metered.ca:80",                username: TURN_USERNAME, credential: TURN_CREDENTIAL },
];

// Toggle this to false later; keep true while debugging connectivity.
const FORCE_TURN = true;

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
    console.log("[ICE] Using servers:", ICE_SERVERS, "force TURN:", FORCE_TURN);

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: FORCE_TURN ? "relay" : "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    // Ensure receivers exist so iOS/Safari reliably fires ontrack
    try {
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });
    } catch {}

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && joined) {
        socketRef.current.emit("ice-candidate", { room, candidate: event.candidate });
      }
    };

    pc.onicecandidateerror = (e) => {
      console.error("[ICE] candidate error:", e.errorText || e.errorCode, e.url || "");
    };

    pc.ontrack = (event) => {
      const el = remoteVideoRef.current;
      if (!el) return;

      // Some browsers give event.streams[0], some only event.track
      if (event.streams && event.streams[0]) {
        el.srcObject = event.streams[0];
      } else {
        const ms = el.srcObject instanceof MediaStream ? el.srcObject : new MediaStream();
        ms.addTrack(event.track);
        el.srcObject = ms;
      }

      // Allow autoplay by keeping muted initially; user can unmute
      el.muted = true;
      (async () => {
        try { await el.play(); }
        catch (err) { console.warn("remote play blocked, will require unmute click:", err?.message); }
      })();
    };

    pc.oniceconnectionstatechange = () => logPC(pc, "PC");
    pc.onicegatheringstatechange = () => logPC(pc, "PC");
    pc.onsignalingstatechange = () => logPC(pc, "PC");

    pc.onconnectionstatechange = async () => {
      console.log("[PC] connectionState =", pc.connectionState);
      if (pc.connectionState === "connected" || pc.connectionState === "completed") {
        // Log selected pair (helps confirm TURN vs. direct)
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
            console.log("[ICE] selected:", {
              local: r.localCandidateId, remote: r.remoteCandidateId, protocol: r.protocol,
              bytesSent: r.bytesSent, bytesReceived: r.bytesReceived,
            });
          }
        });
      }
    };

    return pc;
  };

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current;
    const s = io(SOCKET_HTTP_URL, { transports: ["polling"], upgrade: false, path: "/socket.io" });

    s.on("connect", () => { mySidRef.current = s.id; setStatus("Signaling connected"); });
    s.on("disconnect", () => setStatus("Signaling disconnected"));

    s.on("joined", ({ room: r, count, sid }) => {
      setStatus(`Joined ${r} (count=${count})`);
      console.log("[socket] joined:", { r, count, sid, me: mySidRef.current });
    });

    s.on("ready", async ({ initiator }) => {
      if (!pcRef.current) return;
      if (mySidRef.current === initiator && !startedRef.current) {
        startedRef.current = true;
        setStatus("I am initiator — creating offer");
        await new Promise((r) => setTimeout(r, 100));
        void makeOffer();
      } else {
        setStatus("Waiting for offer from initiator…");
      }
    });

    s.on("offer", async ({ sdp }) => {
      if (!pcRef.current) return;
      try {
        if (pcRef.current.signalingState !== "stable") await pcRef.current.setLocalDescription({ type: "rollback" });
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        s.emit("answer", { room, sdp: pcRef.current.localDescription });
        setStatus("Received offer → sent answer");
      } catch (e) { console.error("offer err", e); setStatus("Error handling offer (see console)"); }
    });

    s.on("answer", async ({ sdp }) => {
      if (!pcRef.current) return;
      if (pcRef.current.signalingState !== "have-local-offer") return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      setStatus("Received answer");
    });

    s.on("ice-candidate", async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(candidate); }
      catch (e) { console.error("ICE add error", e); }
    });

    s.on("peer-left", () => { setStatus("Peer left"); teardownPeerOnly(); });
    s.on("full", () => setStatus("Room is full (max 2)"));

    socketRef.current = s; return s;
  };

  // --- actions ---
  async function startLocal() {
    if (active) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
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

  function fullStop() { leaveRoom(); teardownPeerOnly(); stopLocal(); setStatus("Idle"); }

  async function joinRoom() {
    if (!active) { setStatus("Start local media first"); return; }
    pcRef.current = createPeer();

    // Add local tracks BEFORE any offer
    streamRef.current.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, streamRef.current);
    });

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
      const offer = await pcRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pcRef.current.setLocalDescription(offer);
      socketRef.current?.emit("offer", { room, sdp: pcRef.current.localDescription });
    } finally { makingOfferRef.current = false; }
  }

  useEffect(() => {
    return () => {
      try { leaveRoom(); } catch {}
      try { teardownPeerOnly(); } catch {}
      try { stopLocal(); } catch {}
      try { socketRef.current?.disconnect(); } catch {}
    };
  }, []);

  function toggleMute() {
    const a = streamRef.current?.getAudioTracks()?.[0];
    if (a) { a.enabled = !a.enabled; setMuted(!a.enabled); }
  }
  function toggleCamera() {
    const v = streamRef.current?.getVideoTracks()?.[0];
    if (v) { v.enabled = !v.enabled; setCameraOn(v.enabled); }
  }
  function unmuteRemote() {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.muted = false;
    setRemoteMuted(false);
    el.play().catch(() => {});
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
            <input style={{ maxWidth: 220 }} value={room} onChange={(e)=>setRoom(e.target.value.trim())} placeholder="demo" />
            {!active ? <button className="btn" onClick={startLocal}>Start Local</button> : <button className="btn secondary" onClick={stopLocal}>Stop Local</button>}
            {!joined ? <button className="btn" onClick={joinRoom} disabled={!active}>Join</button> : <button className="btn ghost" onClick={leaveRoom}>Leave</button>}
            {active && (<>
              <button className="btn ghost" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
              <button className="btn ghost" onClick={toggleCamera}>{cameraOn ? "Camera Off" : "Camera On"}</button>
            </>)}
            <button className="btn danger" onClick={fullStop}>Full Stop</button>
          </div>

          <div className="mt-6 grid-2">
            <div className="card">
              <div className="card-header">Local</div>
              <div className="card-body">
                <video ref={localVideoRef} className="video" autoPlay playsInline muted />
              </div>
            </div>

            <div className="card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Remote</span>
                {remoteMuted && (
                  <button className="btn ghost" onClick={unmuteRemote} title="Enable remote audio">
                    Unmute Remote
                  </button>
                )}
              </div>
              <div className="card-body">
                <video ref={remoteVideoRef} className="video" autoPlay playsInline />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
