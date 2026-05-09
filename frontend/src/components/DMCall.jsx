import React, { useEffect, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import { Mic, MicOff, PhoneOff, Video, VideoOff, ScreenShare, ScreenShareOff, X } from "lucide-react";
import { toast } from "sonner";

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/**
 * 1-1 DM call using existing /api/voice/signal (target_user_id mode).
 * Props: other (user obj), withVideo (bool initial state), onClose.
 */
export default function DMCall({ other, withVideo = false, onClose }) {
  const { user } = useAuth();
  const ws = useWS();
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(withVideo);
  const [screenSharing, setScreenSharing] = useState(false);
  const [connected, setConnected] = useState(false);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const signal = useCallback((event, data = {}) => {
    return api.post("/voice/signal", { to: other.user_id, event, data }).catch(() => {});
  }, [other.user_id]);

  const ensurePC = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream.getVideoTracks().length > 0 && remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== stream) remoteVideoRef.current.srcObject = stream;
      } else if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) signal("ice", { candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setConnected(true);
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setConnected(false);
    };
    pcRef.current = pc;
    return pc;
  }, [signal]);

  const renegotiate = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal("offer", { sdp: pc.localDescription, renegotiate: true });
    } catch (_) {}
  }, [signal]);

  // Start the call: get media, create offer
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current && video) localVideoRef.current.srcObject = stream;
        const pc = ensurePC();
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal("offer", { sdp: pc.localDescription, video });
      } catch (e) {
        if (!cancelled) {
          if (e?.name === "NotAllowedError") toast.error("Accès micro/caméra refusé");
          else toast.error("Impossible de démarrer l'appel");
          onClose?.();
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to signaling events
  useEffect(() => {
    if (!ws) return;
    const off = ws.subscribe("voice.signal", async (payload) => {
      const { from, event, data } = payload || {};
      if (from !== other.user_id) return;
      const pc = ensurePC();
      try {
        if (event === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signal("answer", { sdp: pc.localDescription });
        } else if (event === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (event === "ice") {
          if (data.candidate) try { await pc.addIceCandidate(data.candidate); } catch (_) {}
        } else if (event === "leave") {
          onClose?.();
        } else if (event === "call-declined") {
          toast.info("L'appel a été refusé");
          onClose?.();
        }
      } catch (e) { console.error("dm signal err", e); }
    });
    return off;
  }, [ws, other.user_id, ensurePC, signal, onClose]);

  const hangup = useCallback(() => {
    try { signal("leave", {}); } catch (_) {}
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} pcRef.current = null; }
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    onClose?.();
  }, [signal, onClose]);

  const toggleMute = () => {
    const m = !muted; setMuted(m);
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !m));
  };

  const toggleVideo = async () => {
    if (!pcRef.current) return;
    if (video) {
      // Stop video tracks
      localStreamRef.current?.getVideoTracks().forEach(t => { t.stop(); localStreamRef.current.removeTrack(t); });
      pcRef.current.getSenders().filter(s => s.track?.kind === "video").forEach(s => { try { pcRef.current.removeTrack(s); } catch (_) {} });
      setVideo(false);
    } else {
      try {
        const v = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = v.getVideoTracks()[0];
        localStreamRef.current?.addTrack(track);
        pcRef.current.addTrack(track, localStreamRef.current);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setVideo(true);
      } catch (_) { toast.error("Caméra refusée"); return; }
    }
    await renegotiate();
  };

  const stopScreen = useCallback(async () => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach(t => t.stop());
    if (pcRef.current) {
      pcRef.current.getSenders()
        .filter(s => s.track && screenStreamRef.current.getTracks().includes(s.track))
        .forEach(s => { try { pcRef.current.removeTrack(s); } catch (_) {} });
    }
    screenStreamRef.current = null;
    setScreenSharing(false);
    await renegotiate();
  }, [renegotiate]);

  const startScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      const pc = ensurePC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      setScreenSharing(true);
      stream.getVideoTracks()[0]?.addEventListener("ended", stopScreen);
      await renegotiate();
    } catch (_) { toast.error("Partage d'écran refusé"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col">
      <header className="h-14 px-4 flex items-center justify-between border-b border-cc-border bg-cc-surface2">
        <div className="font-display font-extrabold uppercase text-sm flex items-center gap-2">
          {video ? <Video className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          Appel avec {other.display_name}
          <span className={`ml-2 text-[10px] uppercase tracking-widest px-2 py-0.5 ${connected ? "bg-cc-success/20 text-cc-success" : "bg-cc-warning/20 text-cc-warning"}`}>
            {connected ? "Connecté" : "Connexion..."}
          </span>
        </div>
        <button onClick={hangup} className="p-2 text-cc-muted hover:text-cc-danger" title="Fermer"><X className="w-5 h-5" /></button>
      </header>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-cc-base">
        <div className="relative bg-black border border-cc-border aspect-video flex items-center justify-center overflow-hidden">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
          <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/70 text-white text-[10px] uppercase tracking-widest font-bold">{other.display_name}</div>
          <audio ref={remoteAudioRef} autoPlay />
        </div>
        <div className="relative bg-black border border-cc-border aspect-video flex items-center justify-center overflow-hidden">
          {video ? (
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
          ) : (
            <div className="text-cc-muted text-sm uppercase tracking-widest">Caméra désactivée</div>
          )}
          <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/70 text-white text-[10px] uppercase tracking-widest font-bold">Vous</div>
        </div>
      </div>

      <footer className="h-20 flex items-center justify-center gap-3 bg-cc-surface2 border-t border-cc-border">
        <button onClick={toggleMute} className={`p-3 border border-cc-border ${muted ? "bg-cc-danger text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={muted ? "Activer le micro" : "Couper le micro"}>
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <button onClick={toggleVideo} className={`p-3 border border-cc-border ${video ? "bg-cc-accent text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={video ? "Désactiver la caméra" : "Activer la caméra"}>
          {video ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button onClick={screenSharing ? stopScreen : startScreen} className={`p-3 border border-cc-border ${screenSharing ? "bg-cc-accent text-white" : "bg-cc-surface1 hover:bg-cc-base"}`} title={screenSharing ? "Arrêter le partage" : "Partager l'écran"}>
          {screenSharing ? <ScreenShareOff className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
        </button>
        <button onClick={hangup} className="bg-cc-danger text-white font-bold uppercase tracking-wider px-5 py-3" data-testid="dm-call-hangup">
          <PhoneOff className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
}
