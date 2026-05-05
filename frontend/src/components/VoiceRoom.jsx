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
  const [participants, setParticipants] = useState([]); // [{user_id, display_name, avatar_url, self?}]
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // { user_id: { pc, audioEl } }
  const audioContainerRef = useRef(null);

  const signal = useCallback((event, body = {}) => {
    return api.post("/voice/signal", {
      channel_id: channel.channel_id,
      to: body.to || null,
      event,
      data: body.data || {},
    }).catch(() => {});
  }, [channel.channel_id]);

  const cleanupPeer = useCallback((uid) => {
    const p = peersRef.current[uid];
    if (p) {
      try { p.pc.close(); } catch (_) {}
      if (p.audioEl) p.audioEl.remove();
      delete peersRef.current[uid];
    }
    setParticipants((prev) => prev.filter(x => x.user_id !== uid));
  }, []);

  const createPeer = useCallback((targetId) => {
    if (peersRef.current[targetId]) return peersRef.current[targetId].pc;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    if (audioContainerRef.current) audioContainerRef.current.appendChild(audioEl);
    pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => {
      if (e.candidate) signal("ice", { to: targetId, data: { candidate: e.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) cleanupPeer(targetId);
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }
    peersRef.current[targetId] = { pc, audioEl };
    return pc;
  }, [signal, cleanupPeer]);

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!ws || !joined) return;
    const off = ws.subscribe("voice.signal", async (payload) => {
      const { from, channel_id, event, data } = payload || {};
      if (!from || from === user.user_id) return;
      if (channel_id && channel_id !== channel.channel_id) return;
      try {
        if (event === "join") {
          // A new user joined the channel → we (already in) send them an offer
          const pc = createPeer(from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal("offer", { to: from, data: { sdp: pc.localDescription } });
          setParticipants((prev) =>
            prev.find(x => x.user_id === from)
              ? prev
              : [...prev, { user_id: from, display_name: data?.display_name || "Membre", avatar_url: data?.avatar_url }]
          );
        } else if (event === "offer") {
          const pc = createPeer(from);
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signal("answer", { to: from, data: { sdp: pc.localDescription } });
          setParticipants((prev) =>
            prev.find(x => x.user_id === from)
              ? prev
              : [...prev, { user_id: from, display_name: data?.display_name || "Membre", avatar_url: data?.avatar_url }]
          );
        } else if (event === "answer") {
          const pc = peersRef.current[from]?.pc;
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (event === "ice") {
          const pc = peersRef.current[from]?.pc;
          if (pc && data.candidate) try { await pc.addIceCandidate(data.candidate); } catch (_) {}
        } else if (event === "leave") {
          cleanupPeer(from);
        }
      } catch (err) {
        console.error("voice signal error", err);
      }
    });
    // Listen to global presence
    const offPresence = ws.subscribe("voice.presence", (payload) => {
      if (!payload || payload.channel_id !== channel.channel_id) return;
      const incoming = payload.participants || [];
      setParticipants((prev) => {
        const selfEntry = prev.find(p => p.self);
        const others = incoming.filter(p => p.user_id !== user.user_id);
        return selfEntry ? [selfEntry, ...others] : others;
      });
    });
    return () => { off(); offPresence(); };
  }, [ws, joined, user, channel.channel_id, createPeer, signal, cleanupPeer]);

  const leave = useCallback(async () => {
    // Inform peers
    try { await signal("leave", {}); } catch (_) {}
    try { await api.post(`/voice/channels/${channel.channel_id}/leave`, {}); } catch (_) {}
    Object.keys(peersRef.current).forEach((uid) => {
      const p = peersRef.current[uid];
      try { p.pc.close(); } catch (_) {}
      if (p.audioEl) p.audioEl.remove();
      delete peersRef.current[uid];
    });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setJoined(false);
    setParticipants([]);
  }, [signal, channel.channel_id]);

  const join = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      // Register presence on backend first (gets existing participants)
      const { data } = await api.post(`/voice/channels/${channel.channel_id}/join`, {});
      setJoined(true);
      setParticipants([
        { user_id: user.user_id, display_name: user.display_name, avatar_url: user.avatar_url, self: true },
        ...(data?.participants || []),
      ]);
      // Announce to all existing participants
      await signal("join", { data: { display_name: user.display_name, avatar_url: user.avatar_url } });
    } catch (e) {
      console.error(e);
      if (e?.name === "NotAllowedError") toast.error("Micro refusé. Autorisez le micro dans votre navigateur.");
      else if (e?.name === "NotFoundError") toast.error("Aucun micro détecté sur cet appareil.");
      else toast.error(e?.response?.data?.detail || "Impossible de rejoindre le salon vocal");
    }
  };

  // Cleanup on channel change or unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current || Object.keys(peersRef.current).length > 0) {
        leave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.channel_id]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !m));
  };
  const toggleDeafen = () => {
    const d = !deafened;
    setDeafened(d);
    Object.values(peersRef.current).forEach(p => { if (p.audioEl) p.audioEl.muted = d; });
    if (!muted && d) { // auto-mute when deafening
      setMuted(true);
      if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = false));
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-cc-surface2 p-6 sm:p-10 overflow-y-auto">
      <Volume2 className="w-10 h-10 sm:w-12 sm:h-12 text-cc-muted mb-4" />
      <div className="font-display font-extrabold text-xl sm:text-2xl uppercase tracking-tight text-center">{channel.name}</div>
      <p className="text-cc-subtext mt-2 max-w-md text-center text-sm px-2">
        {joined
          ? `${participants.length} participant${participants.length > 1 ? "s" : ""} connecté${participants.length > 1 ? "s" : ""}`
          : "Salon vocal P2P · WebRTC · Cliquez pour rejoindre"}
      </p>
      {joined && (
        <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full max-w-2xl">
          {participants.map((p) => (
            <li key={p.user_id} className="border border-cc-border bg-cc-surface1 p-3 flex flex-col items-center gap-2 min-w-0">
              <div className="w-12 h-12 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border overflow-hidden">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(p.display_name)}
              </div>
              <div className="text-xs font-bold truncate w-full text-center">{p.display_name}{p.self && " (vous)"}</div>
              {p.self && muted && <span className="text-[9px] text-cc-danger uppercase tracking-widest">Muet</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {!joined ? (
          <button
            onClick={join}
            data-testid="join-voice"
            className="bg-cc-accent text-white font-bold uppercase tracking-wider px-5 sm:px-6 py-3 cc-brutal-shadow cc-brutal-press text-sm sm:text-base"
          >
            Rejoindre le vocal
          </button>
        ) : (
          <>
            <button onClick={toggleMute} className={`p-3 border border-cc-border transition-colors ${muted ? "bg-cc-danger text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={muted ? "Activer le micro" : "Couper le micro"} data-testid="voice-mute">
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button onClick={toggleDeafen} className={`p-3 border border-cc-border transition-colors ${deafened ? "bg-cc-danger text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={deafened ? "Activer le son" : "Couper le son"} data-testid="voice-deafen">
              {deafened ? <HeadphoneOff className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
            </button>
            <button onClick={leave} className="bg-cc-danger text-white font-bold uppercase tracking-wider px-5 sm:px-6 py-3" data-testid="leave-voice">
              <PhoneOff className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      <div ref={audioContainerRef} className="hidden" />
    </div>
  );
}
