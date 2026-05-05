import React, { useEffect, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import { Mic, MicOff, PhoneOff, Volume2, Headphones, HeadphoneOff } from "lucide-react";
import { initials } from "../lib/utils";
import { toast } from "sonner";

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export default function VoiceRoom({ channel, server }) {
  const { user } = useAuth();
  const ws = useWS();
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [participants, setParticipants] = useState([]); // [{user_id, display_name, avatar_url, speaking}]
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // { user_id: { pc, audioEl } }
  const audioContainerRef = useRef(null);

  const broadcast = useCallback((event, data) => {
    api.post("/voice/signal", {
      channel_id: channel.channel_id,
      to: data?.to || null,
      event,
      data,
    }).catch(() => {});
  }, [channel.channel_id]);

  const cleanupPeer = (uid) => {
    const p = peersRef.current[uid];
    if (p) {
      try { p.pc.close(); } catch (_) {}
      if (p.audioEl) p.audioEl.remove();
      delete peersRef.current[uid];
    }
    setParticipants((prev) => prev.filter(x => x.user_id !== uid));
  };

  const createPeer = useCallback((targetId, polite) => {
    if (peersRef.current[targetId]) return peersRef.current[targetId].pc;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    if (audioContainerRef.current) audioContainerRef.current.appendChild(audioEl);
    pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => {
      if (e.candidate) broadcast("ice", { to: targetId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) cleanupPeer(targetId);
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }
    peersRef.current[targetId] = { pc, audioEl, polite };
    return pc;
  }, [broadcast]);

  // Handle WS signals
  useEffect(() => {
    if (!ws || !joined) return;
    const off = ws.subscribe("voice.signal", async ({ from, event, data }) => {
      if (!from || from === user.user_id) return;
      if (event === "join") {
        // someone joined, we send them an offer
        const pc = createPeer(from, false);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        broadcast("offer", { to: from, sdp: pc.localDescription });
        setParticipants((prev) => prev.find(x => x.user_id === from) ? prev : [...prev, { user_id: from, display_name: data?.display_name || "?", avatar_url: data?.avatar_url }]);
      } else if (event === "offer") {
        const pc = createPeer(from, true);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        broadcast("answer", { to: from, sdp: pc.localDescription });
        setParticipants((prev) => prev.find(x => x.user_id === from) ? prev : [...prev, { user_id: from, display_name: "?" }]);
      } else if (event === "answer") {
        const pc = peersRef.current[from]?.pc;
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (event === "ice") {
        const pc = peersRef.current[from]?.pc;
        if (pc && data.candidate) try { await pc.addIceCandidate(data.candidate); } catch (_) {}
      } else if (event === "leave") {
        cleanupPeer(from);
      }
    });
    return () => off();
  }, [ws, joined, user, broadcast, createPeer]);

  const join = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setJoined(true);
      setParticipants([{ user_id: user.user_id, display_name: user.display_name, avatar_url: user.avatar_url, self: true }]);
      // Announce join
      broadcast("join", { display_name: user.display_name, avatar_url: user.avatar_url });
    } catch (e) { toast.error("Microphone refusé ou indisponible"); }
  };

  const leave = useCallback(() => {
    Object.keys(peersRef.current).forEach(cleanupPeer);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    broadcast("leave", {});
    setJoined(false);
    setParticipants([]);
  }, [broadcast]);

  useEffect(() => () => { if (joined) leave(); }, [channel.channel_id]); // eslint-disable-line
  useEffect(() => () => leave(), []); // eslint-disable-line

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !m));
  };
  const toggleDeafen = () => {
    const d = !deafened;
    setDeafened(d);
    Object.values(peersRef.current).forEach(p => { if (p.audioEl) p.audioEl.muted = d; });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-cc-surface2 p-10">
      <Volume2 className="w-12 h-12 text-cc-muted mb-4" />
      <div className="font-display font-extrabold text-2xl uppercase tracking-tight">{channel.name}</div>
      <p className="text-cc-subtext mt-2 max-w-md text-center text-sm">
        {joined ? `${participants.length} participant${participants.length > 1 ? "s" : ""} connecté${participants.length > 1 ? "s" : ""}` : "Salon vocal P2P · WebRTC"}
      </p>
      {joined && (
        <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-2xl">
          {participants.map((p) => (
            <li key={p.user_id} className="border border-cc-border bg-cc-surface1 p-3 flex flex-col items-center gap-2 min-w-[110px]">
              <div className="w-12 h-12 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(p.display_name)}
              </div>
              <div className="text-xs font-bold truncate max-w-[90px]">{p.display_name}{p.self && " (vous)"}</div>
              {p.self && muted && <span className="text-[9px] text-cc-danger uppercase tracking-widest">Muet</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 flex gap-3">
        {!joined ? (
          <button onClick={join} data-testid="join-voice" className="bg-cc-accent text-white font-bold uppercase tracking-wider px-6 py-3 cc-brutal-shadow cc-brutal-press">
            Rejoindre le vocal
          </button>
        ) : (
          <>
            <button onClick={toggleMute} className={`p-3 border border-cc-border ${muted ? "bg-cc-danger text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={muted ? "Activer le micro" : "Couper le micro"}>
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button onClick={toggleDeafen} className={`p-3 border border-cc-border ${deafened ? "bg-cc-danger text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={deafened ? "Activer le son" : "Couper le son"}>
              {deafened ? <HeadphoneOff className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
            </button>
            <button onClick={leave} className="bg-cc-danger text-white font-bold uppercase tracking-wider px-6 py-3" data-testid="leave-voice">
              <PhoneOff className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      <div ref={audioContainerRef} className="hidden" />
    </div>
  );
}
