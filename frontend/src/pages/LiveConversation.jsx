import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_HTTP_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5001";

// TURN (Metered or your provider) — set these on Vercel
const TURN_URLS = import.meta.env.VITE_TURN_URLS || "";
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || "";
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL || "";

// Build ICE servers (each TURN URL as its own entry)
function buildIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];

  if (TURN_URLS && TURN_USERNAME && TURN_CREDENTIAL) {
    const urls = TURN_URLS.split(",").map((u) => u.trim()).filter(Boolean);
    for (const u of urls) {
      servers.push({
        urls: u,
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      });
    }
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

  // negotiation guards
  const startedRef = useRef(false);       // made the first offer already?
  const makingOfferRef = useRef(false);   // avoid overlapping offers

  const [active, setActive] = useState(false);
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState("demo");
  const [status, setStatus] = useState("Idle");
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  const logPC = (pc, tag = "PC") => {
    setStatus(`${tag} sig=${pc.signalingState} ice=${pc.iceConnectionState} gather=${pc.iceGatheringState}`);
    console.log(`[${tag}]`, {
      signaling: pc.signalingState,
      ice: pc.iceConnectionState,
      gathering: pc.iceGatheringState,
    });
  };

  const resetNegotiationFlags = () => {
    startedRef.current = false;
    makingOfferRef.current = false;
  };

  const createPeer = () => {
    const servers = buildIceServers();
    console.log("[ICE] Using servers:", servers);

    const pc = new RTCPeerConnection({
      iceServers: servers,
      // TEMP: force TURN to prove cross-network; remove after it works
      iceTransportPolicy: "relay",
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("[ICE] local candidate:", event.candidate.candidate);
      }
      if (event.candidate && socketRef.current && joined) {
        socketRef.current.emit("ice-candidate", { room, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        (async () => {
          try { await remoteVideoRef.current.play(); } catch {}
        })();
      }
    };

    pc.onicecandidateerror = (e) => {
      console.error("[ICE] candidate error:", e.errorText || e.errorCode, e);
    };

    pc.oniceconnectionstatechange = () => logPC(pc, "PC");
    pc.onicegatheringstatechange = () => logPC(pc, "PC");
    pc.onsignalingstatechange = () => logPC(pc, "PC");

    pc.onconnectionstatechange = async () => {
      if (pc.connectionState === "connected" || pc.connectionState === "completed") {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
            console.log("[ICE] selected pair:", { local: r.localCandidateId, remote: r.remoteCandidateId, protocol: r.protocol });
          }
          if (r.type === "local-candidate")  console.log("[ICE] local cand:", r.candidateType, r.protocol);
          if (r.type === "remote-candidate") console.log("[ICE] remote cand:", r.candidateType, r.protocol);
        });
      }
    };

    return pc;
  };

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current;

    const s = io(SOCKET_HTTP_URL, {
      transports: ["polling"], // stable with Flask/Render
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

    // Informational — do NOT start negotiation here
    s.on("joined", ({ room: r, count, sid }) => {
      setStatus(`Joined ${r} (count=${count})`);
      console.log("[socket] joined:", { r, count, sid, me: mySidRef.current });
    });

    // Exactly one peer becomes initiator once
    s.on("ready", async ({ initiator }) => {
      console.log("[socket] ready, initiator:", initiator, "me:", mySidRef.current);
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

    // Offer from initiator
    s.on("offer", async ({ sdp }) => {
      console.log("[socket] offer received; state=", pcRef.current?.signalingState);
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

    // Answer from non-initiator — accept only in the correct state
    s.on("answer", async ({ sdp }) => {
      console.log("[socket] answer received; state=", pcRef.current?.signalingState);
      if (!pcRef.current) return;
      try {
        if (pcRef.current.signalingState !== "have-local-offer") {
          console.warn("Ignoring answer: signalingState =", pcRef.current.signalingState);
          return;
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        setStatus("Received answer");
      } catch (e) {
        console.error("Error handling answer:", e);
        setStatus("Error handling answer (see console)");
      }
    });

    // Trickle ICE from remote
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
    resetNegotiationFlags();
  }

  async function makeOffer() {
    if (!pcRef.current || makingOfferRef.current) return;
    try {
      makingOfferRef.current = true;
      console.log("[makeOffer] creating offer…");
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pcRef.current.setLocalDescription(offer);
      console.log("[makeOffer] localDescription:", pcRef.current.localDescription?.type);
      socketRef.current?.emit("offer", { room, sdp: pcRef.current.localDescription });
    } finally {
      makingOfferRef.current = false;
    }
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
