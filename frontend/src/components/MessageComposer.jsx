import React, { useRef, useState } from "react";
import { Send, Smile, BarChart3, Reply, X } from "lucide-react";
import EmojiGifPicker from "./EmojiGifPicker";
import PollComposer from "./PollComposer";
import MentionAutocomplete from "./MentionAutocomplete";

export default function MessageComposer({
  placeholder, onSend, testIdPrefix = "msg",
  serverId, channelId, replyTo, onCancelReply, compact,
}) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showPoll, setShowPoll] = useState(false);

  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    await onSend(content, [], replyTo?.message_id);
    onCancelReply && onCancelReply();
  };

  const insertEmoji = (e) => {
    const ta = inputRef.current;
    if (!ta) { setText(text + e); return; }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + e.length, start + e.length); setCursor(start + e.length); }, 0);
  };
  const sendGif = async (url) => {
    // GIF is sent as a URL (not a file transfer) — kept as-is.
    await onSend("", [{ url, original_filename: "gif", content_type: "image/gif", size: 0 }], replyTo?.message_id);
    onCancelReply && onCancelReply();
  };

  const handleMentionPick = (newText, newCursor) => {
    setText(newText);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCursor, newCursor);
      setCursor(newCursor);
    }, 0);
  };

  const trackCursor = () => {
    const ta = inputRef.current;
    if (ta) setCursor(ta.selectionStart ?? text.length);
  };

  return (
    <div className={`px-4 ${compact ? "pb-3 pt-1" : "pb-5 pt-2"} bg-cc-surface2 relative`}>
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-2 bg-cc-surface1 border-l-2 border-cc-accent px-3 py-1.5 text-xs">
          <Reply className="w-3 h-3 text-cc-accent" />
          <span className="text-cc-muted uppercase tracking-widest text-[10px]">Réponse à</span>
          <span className="font-bold text-cc-accent">{replyTo.author?.display_name}</span>
          <span className="text-cc-subtext truncate flex-1">{replyTo.content?.slice(0, 80) || "(message)"}</span>
          <button onClick={onCancelReply} className="text-cc-muted hover:text-cc-danger"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {/* Mention autocomplete dropdown — only when typing in a server channel */}
      {serverId && (
        <MentionAutocomplete text={text} cursor={cursor} serverId={serverId} onPick={handleMentionPick} />
      )}
      <div className="bg-cc-surface1 border border-cc-border focus-within:border-cc-accent transition-colors flex items-end gap-2 px-3 py-2">
        {channelId && !compact && (
          <button onClick={() => setShowPoll(true)} data-testid={`${testIdPrefix}-poll`} className="p-1.5 text-cc-subtext hover:text-cc-accent" title="Sondage">
            <BarChart3 className="w-4 h-4" />
          </button>
        )}
        <textarea
          ref={inputRef}
          data-testid={`${testIdPrefix}-input`}
          value={text}
          onChange={(e) => { setText(e.target.value); setCursor(e.target.selectionStart); }}
          onKeyUp={trackCursor}
          onClick={trackCursor}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent outline-none resize-none py-1 text-sm font-jetbrains placeholder:text-cc-muted max-h-40"
          style={{ minHeight: 24 }}
        />
        <div className="relative">
          <button onClick={() => setShowPicker(!showPicker)} data-testid={`${testIdPrefix}-emoji`} className="p-1.5 text-cc-subtext hover:text-cc-accent" title="Émoji & GIF">
            <Smile className="w-4 h-4" />
          </button>
          {showPicker && (
            <EmojiGifPicker
              serverId={serverId}
              channelId={channelId}
              onPickEmoji={insertEmoji}
              onPickGif={sendGif}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
        <button data-testid={`${testIdPrefix}-send`} onClick={submit} disabled={!text.trim()} className="bg-cc-accent text-white p-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cc-accentHover transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
      {!compact && (
        <div className="text-[10px] uppercase tracking-widest text-cc-muted mt-1.5 px-1">Markdown · Maj+Entrée saut · @membre · #salon</div>
      )}
      {showPoll && channelId && (
        <PollComposer channelId={channelId} onClose={() => setShowPoll(false)} />
      )}
    </div>
  );
}
