import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_HTTP_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5001";

export default function LiveConversation() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const mySidRef = useRef(null);

  const [active, setActive] = useState(false);   // local media started
  const [joined, setJoined] = useState(false);   // in signaling room
  const [room, setRoom] = useState("demo");      // room name
  const [status, setStatus] = useState("Idle");  // ui status line

  // Add near the top (below other consts)
const TURN_URLS = import.meta.env.VITE_TURN_URLS;              // e.g. "turn:turn.yourhost:3478?transport=udp,turn:turn.yourhost:3478?transport=tcp,turns:turn.yourhost:443?transport=tcp"
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;      // e.g. "nova"
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;  // e.g. "supersecret"

// Build iceServers from env
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


  // ----- helpers -----
  const logPC = (pc, tag = "PC") => {
    setStatus(`${tag} sig=${pc.signalingState} ice=${pc.iceConnectionState} gather=${pc.iceGatheringState}`);
    console.log(`[${tag}]`, {
      signaling: pc.signalingState,
      ice: pc.iceConnectionState,
      gathering: pc.iceGatheringState,
    });
  };

  const createPeer = () => {
    // const pc = new RTCPeerConnection({
    //   iceServers: [
    //     { urls: "stun:stun.l.google.com:19302" },
    //     // For cross-network/NAT testing add a TURN server:
    //     // { urls: "turn:YOUR_TURN_HOST:3478", username: "user", credential: "pass" },
    //   ],
    // });
    const pc = new RTCPeerConnection({
        iceServers: buildIceServers(),
        // optional: iceTransportPolicy: "all" (default); keep it so TURN is allowed
      });
      

    // Trickle ICE to the peer
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && joined) {
        socketRef.current.emit("ice-candidate", { room, candidate: event.candidate });
      }
    };

    // Remote media arrives here
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        // Nudge playback in case autoplay w/ audio is blocked
        (async () => {
          try { await remoteVideoRef.current.play(); } catch {}
        })();
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
      // Force polling to avoid WS issues with Werkzeug on Python 3.13
      transports: ["polling"],
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

    // Informational; also used as a fallback initiator signal
    s.on("joined", ({ room: r, count, sid }) => {
      setStatus(`Joined ${r} (count=${count})`);
      console.log("[socket] joined:", { r, count, sid, me: mySidRef.current });
      // Fallback: if count==2, the second joiner's SID is sent; make that peer the initiator
      if (count === 2 && sid && mySidRef.current === sid) {
        setStatus("I am initiator (joined fallback) — creating offer");
        void makeOffer();
      }
    });

    // Primary initiator signal sent to both peers
    s.on("ready", async ({ initiator }) => {
      console.log("[socket] ready, initiator:", initiator, "me:", mySidRef.current);
      if (!pcRef.current) return;
      if (mySidRef.current === initiator) {
        setStatus("I am initiator — creating offer");
        // tiny delay helps avoid races on some browsers
        await new Promise((r) => setTimeout(r, 100));
        void makeOffer();
      } else {
        setStatus("Waiting for offer from initiator…");
      }
    });

    // Offer from the initiator
    s.on("offer", async ({ sdp }) => {
      console.log("[socket] offer received");
      if (!pcRef.current) return;
      try {
        // perfect-negotiation: rollback if we're not stable
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

    // Answer from the non-initiator
    s.on("answer", async ({ sdp }) => {
      console.log("[socket] answer received");
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        setStatus("Received answer");
      } catch (e) {
        console.error("Error handling answer:", e);
        setStatus("Error handling answer (see console)");
      }
    });

    // Remote ICE candidate
    s.on("ice-candidate", async ({ candidate }) => {
      console.log("[socket] remote ICE candidate");
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch (e) {
        console.error("Error adding ICE candidate", e);
      }
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

  // ----- actions -----
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
    if (!active) {
      setStatus("Start local media first");
      return;
    }
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
    if (socketRef.current && joined) {
      socketRef.current.emit("leave", { room });
    }
    setJoined(false);
  }

  async function makeOffer() {
    if (!pcRef.current) return;
    console.log("[makeOffer] starting");
    const offer = await pcRef.current.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pcRef.current.setLocalDescription(offer);
    console.log("[makeOffer] localDescription set:", pcRef.current.localDescription?.type);
    socketRef.current?.emit("offer", { room, sdp: pcRef.current.localDescription });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { leaveRoom(); } catch {}
      try { teardownPeerOnly(); } catch {}
      try { stopLocal(); } catch {}
      try { socketRef.current?.disconnect(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI bits
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

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

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-semibold">Live Conversation (2-way)</h1>
      <p className="mt-2 text-gray-600">Start local media, join the same room from two browsers (or devices) to establish a P2P call.</p>
      <div className="mt-2 text-sm">Status: {status}</div>

      <div className="mt-4 flex gap-3 items-center">
        <label className="text-sm">Room</label>
        <input
          className="border rounded p-2"
          value={room}
          onChange={(e) => setRoom(e.target.value.trim())}
          placeholder="demo"
        />
        {!active ? (
          <button className="btn" onClick={startLocal}>Start Local</button>
        ) : (
          <button className="btn" onClick={stopLocal}>Stop Local</button>
        )}
        {!joined ? (
          <button className="btn" onClick={joinRoom} disabled={!active}>Join</button>
        ) : (
          <button className="btn" onClick={leaveRoom}>Leave</button>
        )}
        {active && (
          <>
            <button className="btn" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
            <button className="btn" onClick={toggleCamera}>{cameraOn ? "Camera Off" : "Camera On"}</button>
          </>
        )}
        <button className="btn" onClick={fullStop}>Full Stop</button>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <div className="border rounded overflow-hidden">
          <div className="p-2 text-sm">Local</div>
          <video ref={localVideoRef} className="w-full aspect-video bg-black" autoPlay playsInline muted />
        </div>
        <div className="border rounded overflow-hidden">
          <div className="p-2 text-sm">Remote</div>
          <video ref={remoteVideoRef} className="w-full aspect-video bg-black" autoPlay playsInline />
        </div>
      </div>
    </div>
  );
}
