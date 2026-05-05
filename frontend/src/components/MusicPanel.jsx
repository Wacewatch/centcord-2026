import React, { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useWS } from '../lib/ws';
import { Music, Plus, X, SkipForward, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';

function extractYtId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  return null;
}

export default function MusicPanel({ channel, onClose }) {
  const ws = useWS();
  const [state, setState] = useState({ queue: [], current_idx: -1, playing: false });
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const iframeRef = useRef(null);

  const refresh = async () => {
    try {
      const { data } = await api.get(`/voice/channels/${channel.channel_id}/queue`);
      setState(data);
    } catch (_) {}
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [channel.channel_id]);

  useEffect(() => {
    if (!ws) return;
    const off = ws.subscribe('music.update', (p) => {
      if (p.channel_id !== channel.channel_id) return;
      setState({ queue: p.queue, current_idx: p.current_idx, playing: p.playing });
    });
    return off;
  }, [ws, channel.channel_id]);

  const add = async (e) => {
    e?.preventDefault();
    const v = url.trim();
    const yid = extractYtId(v);
    if (!yid) { toast.error('URL YouTube invalide'); return; }
    setBusy(true);
    try {
      await api.post(`/voice/channels/${channel.channel_id}/queue`, { url: v, title: '' });
      setUrl('');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erreur');
    } finally { setBusy(false); }
  };

  const remove = async (track_id) => {
    try { await api.delete(`/voice/channels/${channel.channel_id}/queue/${track_id}`); } catch (_) {}
  };

  const skip = async () => { try { await api.post(`/voice/channels/${channel.channel_id}/queue/skip`, {}); } catch (_) {} };
  const togglePlay = async () => { try { await api.post(`/voice/channels/${channel.channel_id}/queue/play`, { playing: !state.playing }); } catch (_) {} };

  const current = state.current_idx >= 0 ? state.queue[state.current_idx] : null;

  return (
    <div className="fixed right-3 sm:right-6 bottom-3 sm:bottom-6 w-[min(380px,calc(100vw-1.5rem))] max-h-[80vh] flex flex-col bg-cc-surface1 border border-cc-border cc-brutal-shadow z-40">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cc-border bg-cc-surface2">
        <div className="flex items-center gap-2 font-display font-extrabold uppercase text-sm"><Music className="w-4 h-4" />Musique</div>
        <button onClick={onClose} className="text-cc-muted hover:text-cc-danger" title="Fermer"><X className="w-4 h-4" /></button>
      </div>

      {current && (
        <div className="border-b border-cc-border bg-cc-base">
          <div className="aspect-video bg-black">
            <iframe
              ref={iframeRef}
              key={current.track_id + ':' + (state.playing ? '1' : '0')}
              title={current.title}
              width="100%" height="100%"
              src={`https://www.youtube.com/embed/${current.yt_id}?autoplay=${state.playing ? 1 : 0}&modestbranding=1&rel=0`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
          <div className="flex items-center justify-between p-2 gap-2">
            <div className="truncate text-xs font-bold flex-1" title={current.title}>{current.title}</div>
            <button onClick={togglePlay} className="px-2 py-1 border border-cc-border bg-cc-surface2 hover:bg-cc-surface1" title={state.playing ? 'Pause' : 'Lecture'}>
              {state.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button onClick={skip} className="px-2 py-1 border border-cc-border bg-cc-surface2 hover:bg-cc-surface1" title="Suivant"><SkipForward className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      <form onSubmit={add} className="p-2 flex gap-2 border-b border-cc-border">
        <input
          value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="URL YouTube ou ID"
          className="flex-1 bg-cc-base border border-cc-border px-2 py-1 text-xs font-jetbrains outline-none focus:border-cc-accent"
        />
        <button type="submit" disabled={busy || !url.trim()} className="bg-cc-accent text-white px-2 py-1 text-xs font-bold uppercase tracking-wider disabled:opacity-40"><Plus className="w-3.5 h-3.5" /></button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {state.queue.length === 0 ? (
          <div className="p-3 text-xs text-cc-muted uppercase tracking-widest text-center">File vide. Ajoutez un lien YouTube.</div>
        ) : (
          <ul>
            {state.queue.map((t, i) => (
              <li key={t.track_id} className={`flex items-center gap-2 px-2 py-1.5 text-xs border-b border-cc-border/60 ${i === state.current_idx ? 'bg-cc-accent/10' : ''}`}>
                <img src={t.thumbnail} alt="" className="w-12 h-7 object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-bold">{t.title}</div>
                  <div className="text-cc-muted text-[10px]">par {t.added_by_name}</div>
                </div>
                <button onClick={() => remove(t.track_id)} className="text-cc-muted hover:text-cc-danger"><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
