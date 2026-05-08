import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalAudioTrack,
} from "livekit-client";
import { Mic, MicOff, PhoneOff, Headphones, HeadphoneOff, Music, Volume2, Loader2, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { initials } from "../lib/utils";
import { toast } from "sonner";
import MusicPanel from "./MusicPanel";

/**
 * VoiceRoom — real-time multi-user voice via LiveKit Cloud.
 * Uses our backend /api/voice/livekit/token to mint short-lived access tokens.
 */
export default function VoiceRoom({ channel, server }) {
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [participants, setParticipants] = useState([]); // [{ identity, name, isLocal, isSpeaking, audioLevel, metadata }]
  const [showMusic, setShowMusic] = useState(false);
  const audioContainerRef = useRef(null);
  const roomRef = useRef(null);

  /** Re-snapshot participants from the Room object */
  const refreshParticipants = useCallback((r) => {
    if (!r) return;
    const local = r.localParticipant;
    const remotes = Array.from(r.remoteParticipants?.values?.() || []);
    const all = [local, ...remotes].filter(Boolean).map((p) => {
      let meta = {};
      try { meta = p.metadata ? JSON.parse(p.metadata) : {}; } catch (_) {}
      return {
        identity: p.identity,
        name: p.name || meta.user_id || p.identity,
        avatar_url: meta.avatar_url || null,
        isLocal: p === local,
        isSpeaking: p.isSpeaking,
        audioLevel: p.audioLevel,
        isMuted: !p.isMicrophoneEnabled,
      };
    });
    setParticipants(all);
  }, []);

  /** Attach a remote audio track to the page */
  const attachAudioTrack = useCallback((track) => {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach();
    el.setAttribute("data-lk-id", track.sid);
    el.style.display = "none";
    audioContainerRef.current?.appendChild(el);
  }, []);

  const detachAudioTrack = useCallback((track) => {
    track.detach().forEach((el) => el.remove());
  }, []);

  const join = useCallback(async () => {
    if (connecting || connected) return;
    setError(null);
    setConnecting(true);
    try {
      // 0) Mark presence on our backend (broadcasts voice.presence WS event for sidebar count)
      try { await api.post(`/voice/channels/${channel.channel_id}/join`); } catch (_) {}

      // 1) Mint token from our backend
      const { data } = await api.post("/voice/livekit/token", { channel_id: channel.channel_id });

      // 2) Create the Room
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          dtx: true,
          red: true,
        },
      });

      // 3) Wire events BEFORE connecting
      r.on(RoomEvent.ParticipantConnected, () => refreshParticipants(r));
      r.on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(r));
      r.on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(r));
      r.on(RoomEvent.TrackMuted, () => refreshParticipants(r));
      r.on(RoomEvent.TrackUnmuted, () => refreshParticipants(r));
      r.on(RoomEvent.LocalTrackPublished, () => refreshParticipants(r));
      r.on(RoomEvent.LocalTrackUnpublished, () => refreshParticipants(r));
      r.on(RoomEvent.TrackSubscribed, (track /* , publication, participant */) => {
        if (track.kind === Track.Kind.Audio) attachAudioTrack(track);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) detachAudioTrack(track);
      });
      r.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setRoom(null);
        roomRef.current = null;
        setParticipants([]);
      });
      r.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Reconnecting) {
          toast.message("Reconnexion au salon vocal...");
        }
      });

      // 4) Connect
      await r.connect(data.server_url, data.token, { autoSubscribe: true });

      // 5) Enable microphone (publish a local audio track)
      try {
        const micTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        await r.localParticipant.publishTrack(micTrack);
      } catch (err) {
        console.error("Mic init failed:", err);
        toast.error("Impossible d'accéder au microphone. Vérifiez les permissions du navigateur.");
      }

      roomRef.current = r;
      setRoom(r);
      setConnected(true);
      refreshParticipants(r);
    } catch (e) {
      console.error("LiveKit join failed:", e);
      const detail = e?.response?.data?.detail || e?.message || "Échec de connexion au salon vocal";
      setError(detail);
      toast.error(detail);
    } finally {
      setConnecting(false);
    }
  }, [channel.channel_id, connecting, connected, refreshParticipants, attachAudioTrack, detachAudioTrack]);

  const leave = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try { await r.disconnect(); } catch (_) {}
    setConnected(false);
    setRoom(null);
    roomRef.current = null;
    setParticipants([]);
    // Clear any leftover audio elements
    if (audioContainerRef.current) audioContainerRef.current.innerHTML = "";
    // Notify backend to remove from VOICE_PRESENCE and broadcast
    try { await api.post(`/voice/channels/${channel.channel_id}/leave`); } catch (_) {}
  }, [channel.channel_id]);

  const toggleMute = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !muted;
    try {
      await r.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
      refreshParticipants(r);
    } catch (e) {
      console.error("Mute toggle failed:", e);
    }
  }, [muted, refreshParticipants]);

  const toggleDeafen = useCallback(() => {
    const next = !deafened;
    // Mute all remote audio elements (DOM-side; LiveKit doesn't have a "deafen" API)
    if (audioContainerRef.current) {
      audioContainerRef.current.querySelectorAll("audio").forEach((el) => {
        el.muted = next;
      });
    }
    setDeafened(next);
    if (next && !muted) {
      // When deafening, also mute mic (Discord-like behavior)
      toggleMute();
    }
  }, [deafened, muted, toggleMute]);

  // Auto-cleanup on unmount or channel change
  useEffect(() => {
    const channelIdAtMount = channel?.channel_id;
    const beforeUnload = () => {
      // Best-effort cleanup on tab close (sendBeacon-style via fetch with keepalive)
      if (channelIdAtMount && roomRef.current) {
        try {
          const url = `${process.env.REACT_APP_BACKEND_URL || ""}/api/voice/channels/${channelIdAtMount}/leave`;
          fetch(url, { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
        } catch (_) {}
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      const r = roomRef.current;
      if (r) {
        try { r.disconnect(); } catch (_) {}
        roomRef.current = null;
      }
      // Best-effort backend cleanup
      if (channelIdAtMount) {
        api.post(`/voice/channels/${channelIdAtMount}/leave`).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If channel changes, leave previous room
  useEffect(() => {
    if (roomRef.current && roomRef.current.options?.roomName !== channel?.channel_id) {
      leave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.channel_id]);

  // Periodic refresh for audioLevel/isSpeaking flicker
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      if (roomRef.current) refreshParticipants(roomRef.current);
    }, 800);
    return () => clearInterval(id);
  }, [connected, refreshParticipants]);

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
      {/* Header */}
      <div className="cc-card p-5 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-cc-accent/20 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-cc-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-lg sm:text-xl truncate">{channel.name}</h2>
            <div className="text-cc-subtext text-xs flex items-center gap-2 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cc-accent animate-pulse" />
              Salon vocal • {participants.length} {participants.length > 1 ? "connectés" : "connecté"}
            </div>
          </div>
          {connected && (
            <button
              onClick={() => setShowMusic((v) => !v)}
              data-testid="voice-music-toggle"
              className="cc-btn-ghost flex items-center gap-2 text-sm"
              title="Musique"
            >
              <Music className="w-4 h-4" /> {showMusic ? "Cacher" : "Musique"}
            </button>
          )}
        </div>
      </div>

      {/* Music panel */}
      {showMusic && connected && (
        <div className="cc-card p-4 mb-5">
          <MusicPanel channel={channel} server={server} />
        </div>
      )}

      {/* Participants grid */}
      <div className="flex-1 cc-card p-5">
        {!connected ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-cc-accent/15 flex items-center justify-center">
              <Volume2 className="w-7 h-7 text-cc-accent" />
            </div>
            <h3 className="font-display font-bold text-2xl tracking-tight">Rejoindre {channel.name}</h3>
            <p className="text-cc-subtext text-sm max-w-md">
              Discutez en temps réel avec les autres membres du serveur.
              Votre microphone sera demandé par le navigateur.
            </p>
            {error && (
              <div className="mt-2 px-4 py-2 bg-cc-danger/10 border border-cc-danger/30 rounded-lg text-cc-danger text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            <button
              onClick={join}
              disabled={connecting}
              data-testid="voice-join-btn"
              className="cc-btn-accent mt-2 inline-flex items-center gap-2 text-sm"
            >
              {connecting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Connexion...</>) : (<><Mic className="w-4 h-4" /> Rejoindre le salon vocal</>)}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {participants.map((p) => (
                <ParticipantTile key={p.identity} p={p} />
              ))}
              {participants.length === 0 && (
                <div className="col-span-full text-center text-cc-muted text-sm italic py-8">Aucun participant pour l'instant.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom control bar */}
      {connected && (
        <div className="mt-5 cc-card p-3 sm:p-4">
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={toggleMute}
              data-testid="voice-mute-btn"
              className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all ${
                muted
                  ? "bg-cc-danger text-white shadow-lg"
                  : "bg-white/5 hover:bg-white/10 text-cc-text border border-cc-border"
              }`}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span className="hidden sm:inline">{muted ? "Activer micro" : "Couper micro"}</span>
            </button>
            <button
              onClick={toggleDeafen}
              data-testid="voice-deafen-btn"
              className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all ${
                deafened
                  ? "bg-cc-danger text-white shadow-lg"
                  : "bg-white/5 hover:bg-white/10 text-cc-text border border-cc-border"
              }`}
            >
              {deafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
              <span className="hidden sm:inline">{deafened ? "Réactiver son" : "Couper son"}</span>
            </button>
            <button
              onClick={leave}
              data-testid="voice-leave-btn"
              className="px-5 py-2.5 rounded-xl bg-cc-danger hover:brightness-110 text-white flex items-center gap-2 text-sm font-medium shadow-lg transition-all"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Raccrocher</span>
            </button>
          </div>
        </div>
      )}

      {/* Hidden audio sink */}
      <div ref={audioContainerRef} aria-hidden="true" />
    </div>
  );
}

function ParticipantTile({ p }) {
  const speaking = !p.isMuted && (p.isSpeaking || (p.audioLevel || 0) > 0.05);
  return (
    <div
      className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 ${
        speaking
          ? "border-cc-accent shadow-[0_0_0_3px_rgba(255,59,0,0.15),0_8px_24px_-8px_rgba(255,59,0,0.5)] bg-cc-accent/5"
          : "border-cc-border bg-white/3"
      }`}
      data-testid={`participant-${p.identity}`}
    >
      <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center font-bold text-xl sm:text-2xl text-white overflow-hidden ${speaking ? "ring-2 ring-cc-accent" : ""}`}
           style={{ background: speaking ? "linear-gradient(135deg, #FF6F1F, #FF3B00)" : "linear-gradient(135deg, #5A5A6E, #3A3A48)" }}>
        {p.avatar_url
          ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
          : <span>{initials(p.name || p.identity)}</span>}
        {p.isMuted && (
          <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-cc-danger flex items-center justify-center border-2 border-cc-glass-1">
            <MicOff className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>
      <div className="text-center min-w-0 w-full">
        <div className="text-sm font-semibold truncate">{p.name}</div>
        {p.isLocal && <div className="text-[10px] uppercase tracking-widest text-cc-accent font-bold">Vous</div>}
      </div>
    </div>
  );
}
