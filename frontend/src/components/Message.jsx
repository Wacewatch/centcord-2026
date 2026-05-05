import React, { useState } from "react";
import { initials, formatTime, formatDate } from "../lib/utils";
import { Smile, Reply, Pin, Trash2, Edit2, Lock, Bookmark, MessagesSquare } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";
import PollCard from "./PollCard";

const COMMON_EMOJIS = ["🔥", "💀", "🎯", "🧠", "👀", "❤️", "✨", "🚀"];

function isOnlyImageUrl(content) {
  if (!content) return null;
  const t = content.trim();
  if (/^https?:\/\/\S+\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(t)) return t;
  return null;
}

function renderContent(content, customEmojiMap = {}) {
  if (!content) return null;
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
          // Split by inline code, custom emojis :name:, mentions @name
          const tokens = ln.split(/(`[^`]+`|:[a-z0-9_]{2,32}:|@\w+)/g);
          const rendered = tokens.map((part, k) => {
            if (part.startsWith("`") && part.endsWith("`")) return <code key={k} className="cc-code text-xs">{part.slice(1, -1)}</code>;
            if (part.startsWith(":") && part.endsWith(":")) {
              const name = part.slice(1, -1);
              const url = customEmojiMap[name];
              if (url) return <img key={k} src={url} alt={name} title={part} className="inline-block w-5 h-5 align-text-bottom mx-0.5" />;
              return <React.Fragment key={k}>{part}</React.Fragment>;
            }
            if (part.startsWith("@")) return <span key={k} className="cc-mention">{part}</span>;
            return <React.Fragment key={k}>{part}</React.Fragment>;
          });
          return <React.Fragment key={j}>{rendered}{j < lines.length - 1 && <br />}</React.Fragment>;
        })}
      </span>
    );
  });
}

export default function Message({ msg, grouped, mine, onReact, onReply, onCreateThread, onOpenThread, customEmojiMap, onOpenProfile }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [showEmoji, setShowEmoji] = useState(false);
  const author = msg.author || {};
  const displayName = msg.webhook_name || author.display_name || "?";
  const avatarUrl = msg.webhook_avatar || author.avatar_url;
  const isWebhook = !!msg.webhook_id;
  const onlyImg = isOnlyImageUrl(msg.content);

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
  const pinToggle = async () => {
    try {
      if (msg.pinned) { await api.delete(`/messages/${msg.message_id}/pin`); toast.success("Désépinglé"); }
      else { await api.post(`/messages/${msg.message_id}/pin`); toast.success("Épinglé"); }
    } catch (_) { toast.error("Échec"); }
  };
  const startThread = async () => {
    if (onCreateThread) return onCreateThread(msg);
    const name = prompt("Nom du fil ?", msg.content?.slice(0, 50) || "Discussion");
    if (!name) return;
    try {
      const { data } = await api.post(`/channels/${msg.channel_id}/threads`, { name, parent_message_id: msg.message_id });
      toast.success("Fil créé");
      onOpenThread && onOpenThread(data, msg);
    } catch (_) { toast.error("Échec"); }
  };

  return (
    <div className={`cc-msg-row group flex gap-3 px-6 py-1 relative ${msg.pinned ? "bg-cc-accent/5" : ""}`} data-testid={`msg-${msg.message_id}`}>
      {grouped ? (
        <div className="w-9 shrink-0 text-right text-[10px] text-cc-muted opacity-0 group-hover:opacity-100 pt-1 pr-1">{formatTime(msg.created_at)}</div>
      ) : (
        <button
          type="button"
          onClick={() => !isWebhook && onOpenProfile && onOpenProfile(author.user_id)}
          disabled={isWebhook || !onOpenProfile}
          className="w-9 shrink-0 pt-0.5 cursor-pointer disabled:cursor-default"
          data-testid={`msg-avatar-${msg.message_id}`}
        >
          <div className="w-9 h-9 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-xs hover:border-cc-accent transition-colors">
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(displayName)}
          </div>
        </button>
      )}
      <div className="flex-1 min-w-0">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => !isWebhook && onOpenProfile && onOpenProfile(author.user_id)}
              disabled={isWebhook || !onOpenProfile}
              className="font-display font-extrabold text-cc-accent hover:underline disabled:no-underline disabled:cursor-default"
              data-testid={`msg-author-${msg.message_id}`}
            >
              {displayName}
            </button>
            {isWebhook && <span className="text-[9px] uppercase tracking-widest text-cc-muted bg-cc-surface2 border border-cc-border px-1.5">BOT</span>}
            <span className="text-[10px] text-cc-muted">{formatDate(msg.created_at)} · {formatTime(msg.created_at)}</span>
            {msg._decrypted && <span className="text-[9px] text-cc-success uppercase tracking-widest flex items-center gap-1"><Lock className="w-2.5 h-2.5" />E2E</span>}
            {msg.pinned && <span className="text-[9px] text-cc-accent uppercase tracking-widest flex items-center gap-1"><Pin className="w-2.5 h-2.5" />ÉPINGLÉ</span>}
          </div>
        )}
        {msg.reply_to_data && (
          <div className="text-xs text-cc-subtext border-l-2 border-cc-border pl-2 my-1 truncate">
            <Reply className="inline w-3 h-3 mr-1 text-cc-muted" />
            <span className="font-bold text-cc-accent">{msg.reply_to_data.author?.display_name || "?"}</span>
            <span className="ml-1">{msg.reply_to_data.content?.slice(0, 100) || "(pièce jointe)"}</span>
          </div>
        )}
        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); } if (e.key === "Escape") setEditing(false); }}
              className="w-full bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none p-2 text-sm" rows={3}
            />
            <div className="text-[10px] uppercase tracking-widest text-cc-muted mt-1">Enter to save · Esc to cancel</div>
          </div>
        ) : (
          msg.content && (
            onlyImg ? (
              <a href={onlyImg} target="_blank" rel="noopener noreferrer">
                <img src={onlyImg} alt="" className="max-h-72 max-w-md border border-cc-border mt-1" />
              </a>
            ) : (
              <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content, customEmojiMap)} {msg.edited_at && <span className="text-[10px] text-cc-muted ml-1">(edited)</span>}</div>
            )
          )
        )}
        {msg.poll && <PollCard poll={msg.poll} />}
        {msg.sticker && (
          <div className="mt-1" data-testid={`sticker-msg-${msg.message_id}`}>
            <img src={msg.sticker.image_url} alt={msg.sticker.name} title={`:${msg.sticker.name}:`} className="max-h-32 max-w-[160px] border border-cc-border" />
          </div>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.attachments.map((a, i) => {
              const url = a.url?.startsWith("http") ? a.url : `${process.env.REACT_APP_BACKEND_URL}${a.url}`;
              return a.content_type?.startsWith("image/") ? (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={a.original_filename} className="max-h-72 max-w-sm border border-cc-border" />
                </a>
              ) : (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="cc-link text-xs">{a.original_filename || "fichier"}</a>
              );
            })}
          </div>
        )}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {msg.reactions.map((r) => {
              const isCustom = r.emoji?.startsWith(":") && r.emoji?.endsWith(":");
              const customUrl = isCustom ? customEmojiMap?.[r.emoji.slice(1, -1)] : null;
              return (
                <button key={r.emoji} onClick={() => onReact(msg.message_id, r.emoji)} className="text-xs border border-cc-border bg-cc-surface1 hover:border-cc-accent px-2 py-0.5 flex items-center gap-1">
                  {customUrl ? <img src={customUrl} alt={r.emoji} className="w-4 h-4" /> : <span>{r.emoji}</span>}
                  <span className="text-cc-muted">{r.users.length}</span>
                </button>
              );
            })}
          </div>
        )}
        {msg.thread_id && onOpenThread && (
          <button onClick={() => onOpenThread({ thread_id: msg.thread_id, name: "Fil", channel_id: msg.channel_id, server_id: msg.server_id }, msg)} className="mt-1.5 inline-flex items-center gap-1.5 text-xs border border-cc-border bg-cc-surface1 hover:border-cc-accent px-2 py-1 transition-colors">
            <MessagesSquare className="w-3 h-3 text-cc-accent" />
            <span className="text-cc-accent uppercase tracking-widest text-[10px] font-bold">Voir le fil</span>
          </button>
        )}
      </div>
      <div className="absolute right-4 -top-3 hidden group-hover:flex bg-cc-surface1 border border-cc-border shadow-lg z-10">
        <div className="relative">
          <button onClick={() => setShowEmoji((s) => !s)} className="p-2 text-cc-subtext hover:text-cc-accent" data-testid={`msg-react-${msg.message_id}`} title="Réagir"><Smile className="w-3.5 h-3.5" /></button>
          {showEmoji && (
            <div className="absolute right-0 top-full mt-1 bg-cc-surface1 border border-cc-border p-2 grid grid-cols-4 gap-1 z-50">
              {COMMON_EMOJIS.map((e) => (
                <button key={e} onClick={() => { onReact(msg.message_id, e); setShowEmoji(false); }} className="text-base hover:bg-cc-surface2 w-8 h-8 flex items-center justify-center">{e}</button>
              ))}
            </div>
          )}
        </div>
        {onReply && <button onClick={() => onReply(msg)} className="p-2 text-cc-subtext hover:text-cc-text" data-testid={`msg-reply-${msg.message_id}`} title="Répondre"><Reply className="w-3.5 h-3.5" /></button>}
        {msg.server_id && !msg.thread_id && (
          <button onClick={startThread} className="p-2 text-cc-subtext hover:text-cc-text" data-testid={`msg-thread-${msg.message_id}`} title="Démarrer un fil"><MessagesSquare className="w-3.5 h-3.5" /></button>
        )}
        <button onClick={bookmark} className="p-2 text-cc-subtext hover:text-cc-accent" data-testid={`msg-bookmark-${msg.message_id}`} title="Sauvegarder"><Bookmark className="w-3.5 h-3.5" /></button>
        {msg.server_id && <button onClick={pinToggle} className="p-2 text-cc-subtext hover:text-cc-text" data-testid={`msg-pin-${msg.message_id}`} title={msg.pinned ? "Désépingler" : "Épingler"}><Pin className={`w-3.5 h-3.5 ${msg.pinned ? "text-cc-accent" : ""}`} /></button>}
        {mine && !editing && <button onClick={() => setEditing(true)} className="p-2 text-cc-subtext hover:text-cc-text" data-testid={`msg-edit-${msg.message_id}`} title="Modifier"><Edit2 className="w-3.5 h-3.5" /></button>}
        {mine && <button onClick={remove} className="p-2 text-cc-subtext hover:text-cc-danger" data-testid={`msg-delete-${msg.message_id}`} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
}
