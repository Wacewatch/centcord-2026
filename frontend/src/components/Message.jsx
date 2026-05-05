import React, { useState } from "react";
import { initials, formatTime, formatDate } from "../lib/utils";
import { Smile, MoreHorizontal, Reply, Pin, Trash2, Edit2, Lock, Bookmark } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

const COMMON_EMOJIS = ["🔥", "💀", "🎯", "🧠", "👀", "❤️", "✨", "🚀"];

function renderContent(content) {
  if (!content) return null;
  // very small markdown: code blocks, inline code, bold, italics, mentions
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((p, i) => {
    if (p.startsWith("```")) {
      const code = p.replace(/```(\w+)?\n?|```$/g, "");
      return <pre key={i} className="cc-pre my-2 text-xs overflow-x-auto">{code}</pre>;
    }
    const lines = p.split("\n");
    return (
      <span key={i}>
        {lines.map((ln, j) => {
          const inline = ln.split(/(`[^`]+`)/g).map((part, k) =>
            part.startsWith("`") && part.endsWith("`") ? <code key={k} className="cc-code text-xs">{part.slice(1, -1)}</code> : part.split(/(@\w+)/g).map((token, kk) =>
              token.startsWith("@") ? <span key={kk} className="cc-mention">{token}</span> : <React.Fragment key={kk}>{token}</React.Fragment>
            )
          );
          return <React.Fragment key={j}>{inline}{j < lines.length - 1 && <br />}</React.Fragment>;
        })}
      </span>
    );
  });
}

export default function Message({ msg, grouped, mine, onReact }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [showEmoji, setShowEmoji] = useState(false);
  const author = msg.author || {};

  const submitEdit = async () => {
    try { await api.patch(`/messages/${msg.message_id}`, { content: draft }); setEditing(false); }
    catch (_) { toast.error("Edit failed"); }
  };
  const remove = async () => {
    if (!window.confirm("Supprimer ce message ?")) return;
    try { await api.delete(`/messages/${msg.message_id}`); }
    catch (_) { toast.error("Échec de la suppression"); }
  };
  const bookmark = async () => {
    try { await api.post(`/bookmarks/${msg.message_id}`); toast.success("Sauvegardé"); }
    catch (_) { toast.error("Échec"); }
  };

  return (
    <div className="cc-msg-row group flex gap-3 px-6 py-1 relative" data-testid={`msg-${msg.message_id}`}>
      {grouped ? (
        <div className="w-9 shrink-0 text-right text-[10px] text-cc-muted opacity-0 group-hover:opacity-100 pt-1 pr-1">{formatTime(msg.created_at)}</div>
      ) : (
        <div className="w-9 shrink-0 pt-0.5">
          <div className="w-9 h-9 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-xs">
            {author.avatar_url ? <img src={author.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(author.display_name || "?")}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-display font-extrabold text-cc-accent" data-testid={`msg-author-${msg.message_id}`}>{author.display_name || "Unknown"}</span>
            <span className="text-[10px] text-cc-muted">{formatDate(msg.created_at)} · {formatTime(msg.created_at)}</span>
            {msg._decrypted && <span className="text-[9px] text-cc-success uppercase tracking-widest flex items-center gap-1"><Lock className="w-2.5 h-2.5" />E2E</span>}
          </div>
        )}
        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none p-2 text-sm"
              rows={3}
            />
            <div className="text-[10px] uppercase tracking-widest text-cc-muted mt-1">Enter to save · Esc to cancel</div>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content)} {msg.edited_at && <span className="text-[10px] text-cc-muted ml-1">(edited)</span>}</div>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.attachments.map((a, i) => (
              a.content_type?.startsWith("image/") ? (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                  <img src={a.url} alt={a.original_filename} className="max-h-72 max-w-sm border border-cc-border" />
                </a>
              ) : (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="cc-link text-xs">{a.original_filename}</a>
              )
            ))}
          </div>
        )}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(msg.message_id, r.emoji)}
                className="text-xs border border-cc-border bg-cc-surface1 hover:border-cc-accent px-2 py-0.5 flex items-center gap-1"
              >
                <span>{r.emoji}</span>
                <span className="text-cc-muted">{r.users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="absolute right-4 -top-3 hidden group-hover:flex bg-cc-surface1 border border-cc-border shadow-lg">
        <div className="relative">
          <button onClick={() => setShowEmoji((s) => !s)} className="p-2 text-cc-subtext hover:text-cc-accent" data-testid={`msg-react-${msg.message_id}`}><Smile className="w-3.5 h-3.5" /></button>
          {showEmoji && (
            <div className="absolute right-0 top-full mt-1 bg-cc-surface1 border border-cc-border p-2 grid grid-cols-4 gap-1 z-50">
              {COMMON_EMOJIS.map((e) => (
                <button key={e} onClick={() => { onReact(msg.message_id, e); setShowEmoji(false); }} className="text-base hover:bg-cc-surface2 w-8 h-8 flex items-center justify-center">{e}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={bookmark} className="p-2 text-cc-subtext hover:text-cc-accent" data-testid={`msg-bookmark-${msg.message_id}`} title="Sauvegarder"><Bookmark className="w-3.5 h-3.5" /></button>
        <button className="p-2 text-cc-subtext hover:text-cc-text" title="Répondre"><Reply className="w-3.5 h-3.5" /></button>
        {!msg._decrypted && msg.server_id && <button className="p-2 text-cc-subtext hover:text-cc-text" onClick={() => api.post(`/messages/${msg.message_id}/pin`).catch(() => {})} title="Épingler"><Pin className="w-3.5 h-3.5" /></button>}
        {mine && !editing && <button onClick={() => setEditing(true)} className="p-2 text-cc-subtext hover:text-cc-text" data-testid={`msg-edit-${msg.message_id}`} title="Modifier"><Edit2 className="w-3.5 h-3.5" /></button>}
        {mine && <button onClick={remove} className="p-2 text-cc-subtext hover:text-cc-danger" data-testid={`msg-delete-${msg.message_id}`} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
}
