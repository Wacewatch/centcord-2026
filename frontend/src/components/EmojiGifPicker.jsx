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

// Curated trending GIFs (Giphy public CDN, no key required)
const CURATED_GIFS = [
  "https://media.giphy.com/media/3o7TKsQ8gqVrHIw1lO/giphy.gif",
  "https://media.giphy.com/media/3o7abAHdYvZdBNnGZq/giphy.gif",
  "https://media.giphy.com/media/l0HlDBSfRZoAlmKuI/giphy.gif",
  "https://media.giphy.com/media/26ufnwz3wDUli7GU0/giphy.gif",
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/xT5LMHxhOfscxPfIfm/giphy.gif",
  "https://media.giphy.com/media/3oEdv6DEYWqPAxN0Wc/giphy.gif",
  "https://media.giphy.com/media/26FLgGTPUDH6UGAbm/giphy.gif",
  "https://media.giphy.com/media/3o7TKEP6YngkCKFofu/giphy.gif",
];

export default function EmojiGifPicker({ serverId, onPickEmoji, onPickGif, onClose }) {
  const [tab, setTab] = useState("emoji");
  const [custom, setCustom] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!serverId) return;
    api.get(`/servers/${serverId}/emojis`).then(r => setCustom(r.data || [])).catch(() => {});
  }, [serverId]);

  const filteredUnicode = search ? UNICODE.filter(e => e.includes(search)) : UNICODE;
  const filteredCustom = search ? custom.filter(c => c.name.includes(search.toLowerCase())) : custom;

  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 bg-cc-surface1 border border-cc-border cc-brutal-shadow z-50" data-testid="emoji-gif-picker">
      <div className="flex border-b border-cc-border">
        {["emoji", "gif"].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-widest font-bold ${tab === t ? "text-cc-text bg-cc-surface2" : "text-cc-muted hover:text-cc-text"}`}>
            {t === "emoji" ? "Émojis" : "GIFs"}
          </button>
        ))}
      </div>
      <div className="p-2 border-b border-cc-border">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "emoji" ? "Rechercher un émoji" : "Rechercher un GIF"} className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-2 py-1 text-xs" />
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
            {CURATED_GIFS.map((url, i) => (
              <button key={i} onClick={() => { onPickGif(url); onClose(); }} className="hover:opacity-80 transition-opacity">
                <img src={url} alt="" className="w-full h-24 object-cover border border-cc-border" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
