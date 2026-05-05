import React, { useEffect, useState } from "react";
import api from "../lib/api";

const UNICODE = [
  "😀","😂","🤣","😍","😎","🤔","😢","😭","😡","🤯","🥶","🤡",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💯","💢","🔥",
  "✨","⭐","🌟","💫","🚀","🎯","🎉","🎊","🎁","🏆","🎖️","🥇",
  "👍","👎","👌","✌️","🤞","🤝","🙏","👏","🙌","👀","💀","🧠",
  "🐶","🐱","🦊","🐻","🐼","🐨","🦁","🐯","🐸","🐵","🦄","🐲",
  "🍕","🍔","🍟","🌮","🍣","🍩","🍰","🍦","🍫","🍿","☕","🍺",
];

export default function EmojiGifPicker({ serverId, channelId, onPickEmoji, onPickGif, onPickSticker, onClose }) {
  const [tab, setTab] = useState("emoji");
  const [custom, setCustom] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [gifs, setGifs] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!serverId) return;
    api.get(`/servers/${serverId}/emojis`).then(r => setCustom(r.data || [])).catch(() => {});
    api.get(`/servers/${serverId}/stickers`).then(r => setStickers(r.data || [])).catch(() => {});
  }, [serverId]);

  useEffect(() => {
    if (tab !== "gif") return;
    const q = search.trim();
    api.get(`/gifs/trending${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(r => setGifs(r.data || []))
      .catch(() => setGifs([]));
  }, [tab, search]);

  const filteredUnicode = search ? UNICODE.filter(e => e.includes(search)) : UNICODE;
  const filteredCustom = search ? custom.filter(c => c.name.includes(search.toLowerCase())) : custom;
  const filteredStickers = search ? stickers.filter(s => (s.name + " " + (s.tags || "")).toLowerCase().includes(search.toLowerCase())) : stickers;

  const sendSticker = async (st) => {
    if (onPickSticker) { onPickSticker(st); onClose(); return; }
    if (!channelId) return;
    try {
      await api.post(`/stickers/send`, { channel_id: channelId, sticker_id: st.sticker_id });
      onClose();
    } catch (e) { /* ignore */ }
  };

  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 bg-cc-surface1 border border-cc-border cc-brutal-shadow z-50" data-testid="emoji-gif-picker">
      <div className="flex border-b border-cc-border">
        {["emoji", "gif", "sticker"].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-widest font-bold ${tab === t ? "text-cc-text bg-cc-surface2" : "text-cc-muted hover:text-cc-text"}`}>
            {t === "emoji" ? "Émojis" : t === "gif" ? "GIFs" : "Stickers"}
          </button>
        ))}
      </div>
      <div className="p-2 border-b border-cc-border">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "emoji" ? "Rechercher un émoji" : tab === "gif" ? "Rechercher un GIF" : "Rechercher un sticker"} className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-2 py-1 text-xs" />
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {tab === "emoji" && (
          <>
            {filteredCustom.length > 0 && (
              <>
                <div className="text-[9px] uppercase tracking-widest text-cc-muted px-1 mb-1">Personnalisés</div>
                <div className="grid grid-cols-8 gap-1 mb-3">
                  {filteredCustom.map((c) => (
                    <button key={c.emoji_id} onClick={() => { onPickEmoji(`:${c.name}:`); onClose(); }} className="w-8 h-8 hover:bg-cc-surface2 flex items-center justify-center" title={`:${c.name}:`}>
                      <img src={c.image_url} alt={c.name} className="w-6 h-6 object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="text-[9px] uppercase tracking-widest text-cc-muted px-1 mb-1">Standard</div>
            <div className="grid grid-cols-8 gap-1">
              {filteredUnicode.map((e, i) => (
                <button key={i} onClick={() => { onPickEmoji(e); onClose(); }} className="w-8 h-8 hover:bg-cc-surface2 flex items-center justify-center text-lg">{e}</button>
              ))}
            </div>
          </>
        )}
        {tab === "gif" && (
          <div className="grid grid-cols-2 gap-1">
            {gifs.length === 0 && <div className="col-span-2 text-xs text-cc-muted py-6 text-center">Aucun GIF</div>}
            {gifs.map((g) => (
              <button key={g.id} onClick={() => { onPickGif(g.url); onClose(); }} title={g.title} className="hover:opacity-80 transition-opacity">
                <img src={g.preview || g.url} alt={g.title} className="w-full h-24 object-cover border border-cc-border" />
              </button>
            ))}
          </div>
        )}
        {tab === "sticker" && (
          <div className="grid grid-cols-3 gap-2">
            {filteredStickers.length === 0 && <div className="col-span-3 text-xs text-cc-muted py-6 text-center">Aucun sticker. Ajoute-en dans les paramètres du serveur.</div>}
            {filteredStickers.map((st) => (
              <button key={st.sticker_id} onClick={() => sendSticker(st)} className="hover:opacity-80 transition-opacity flex flex-col items-center gap-1">
                <img src={st.image_url} alt={st.name} className="w-16 h-16 object-cover border border-cc-border" />
                <span className="text-[9px] uppercase tracking-widest text-cc-muted truncate w-full text-center">{st.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

