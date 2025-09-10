import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_HTTP_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5001";

/** TURN settings pulled from .env (the logic you already had) */
const TURN_URLS        = import.meta.env.VITE_TURN_URLS;         // comma-separated URLs
const TURN_USERNAME    = import.meta.env.VITE_TURN_USERNAME;
const TURN_CREDENTIAL  = import.meta.env.VITE_TURN_CREDENTIAL;

function buildIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (TURN_URLS && TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push({
      urls: TURN_URLS.split(",").map((u) => u.trim()),
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL,
    });
  }
  return servers;
}

export default function LiveConversation() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const mySidRef = useRef(null);

  const [active, setActive]   = useState(false);
  const [joined, setJoined]   = useState(false);
  const [room, setRoom]       = useState("demo");
  const [status, setStatus]   = useState("Idle");

  const [muted, setMuted]       = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  // ---- helpers ----
  const logPC = (pc, tag = "PC") => {
    setStatus(`${tag} sig=${pc.signalingState} ice=${pc.iceConnectionState} gather=${pc.iceGatheringState}`);
    console.log(`[${tag}]`, {
      signaling: pc.signalingState,
      ice: pc.iceConnectionState,
      gathering: pc.iceGatheringState,
    });
  };

  const createPeer = () => {
    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && joined) {
        socketRef.current.emit("ice-candidate", { room, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        (async () => { try { await remoteVideoRef.current.play(); } catch {} })();
      }
    };

    pc.oniceconnectionstatechange = () => logPC(pc, "PC");
    pc.onicegatheringstatechange = () => logPC(pc, "PC");
    pc.onsignalingstatechange    = () => logPC(pc, "PC");

    return pc;
  };

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current;

    const s = io(SOCKET_HTTP_URL, {
      transports: ["polling"],   // safest with your setup
      upgrade: false,
      withCredentials: false,
      path: "/socket.io",
    });

    s.on("connect", () => {
      mySidRef.current = s.id;
      setStatus("Signaling connected");
      console.log("[socket] connected, mySid:", mySidRef.current);
    });

    s.on("connect_error", (err) => {
      setStatus(`Signaling error: ${err.message}`);
      console.error("[socket] connect_error:", err);
    });

    s.on("disconnect", () => setStatus("Signaling disconnected"));

    s.on("joined", ({ room: r, count, sid }) => {
      setStatus(`Joined ${r} (count=${count})`);
      if (count === 2 && sid && mySidRef.current === sid) {
        setStatus("I am initiator (joined fallback) — creating offer");
        void makeOffer();
      }
    });

    s.on("ready", async ({ initiator }) => {
      if (!pcRef.current) return;
      if (mySidRef.current === initiator) {
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
        if (pcRef.current.signalingState !== "stable") {
          await pcRef.current.setLocalDescription({ type: "rollback" });
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pcRef.current.createAnswer();
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
      teardownPeerOnly();
    });

    s.on("full", () => {
      setStatus("Room is full (max 2)");
    });

    socketRef.current = s;
    return s;
  };

  // ---- actions ----
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
    streamRef.current.getTracks().forEach((track) => pcRef.current.addTrack(track, streamRef.current));
    const s = ensureSocket();
    s.emit("join", { room });
    setJoined(true);
  }

  function leaveRoom() {
    if (socketRef.current && joined) socketRef.current.emit("leave", { room });
    setJoined(false);
  }

  async function makeOffer() {
    if (!pcRef.current) return;
    const offer = await pcRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pcRef.current.setLocalDescription(offer);
    socketRef.current?.emit("offer", { room, sdp: pcRef.current.localDescription });
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
    if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setMuted(!audioTrack.enabled); }
  }
  function toggleCamera() {
    const videoTrack = streamRef.current?.getVideoTracks()?.[0];
    if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setCameraOn(videoTrack.enabled); }
  }

  return (
    <div className="nova-page">
      <div className="nova-card">
        <div className="nova-card-head">
          <div className="nova-title">
            <span className="dot" /> Live Conversation <span className="muted">(2-way)</span>
          </div>
          <div className="nova-badge">Status: {status}</div>
        </div>

        <div className="nova-actions">
          <label className="nova-label">Room</label>
          <input
            className="nova-input"
            value={room}
            onChange={(e) => setRoom(e.target.value.trim())}
            placeholder="demo"
          />
          {!active ? (
            <button className="btn" onClick={startLocal}>Start Local</button>
          ) : (
            <button className="btn btn-secondary" onClick={stopLocal}>Stop Local</button>
          )}
          {!joined ? (
            <button className="btn" onClick={joinRoom} disabled={!active}>Join</button>
          ) : (
            <button className="btn btn-ghost" onClick={leaveRoom}>Leave</button>
          )}
          {active && (
            <>
              <button className="btn btn-ghost" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
              <button className="btn btn-ghost" onClick={toggleCamera}>{cameraOn ? "Camera Off" : "Camera On"}</button>
            </>
          )}
          <button className="btn btn-danger" onClick={fullStop}>Full Stop</button>
        </div>

        <div className="nova-grid">
          <div className="nova-panel">
            <div className="nova-panel-head">Local</div>
            <div className="nova-panel-body">
              <video ref={localVideoRef} className="nova-video" autoPlay playsInline muted />
            </div>
          </div>

          <div className="nova-panel">
            <div className="nova-panel-head">Remote</div>
            <div className="nova-panel-body">
              <video ref={remoteVideoRef} className="nova-video" autoPlay playsInline />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
