import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Message from "./Message";
import { MessageListSkeleton } from "./Skeletons";

export default function MessageList({ messages, currentUser, onReact, onReply, onCreateThread, onOpenThread, onOpenProfile, memberColorMap, customEmojiMap, loading }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div data-testid="message-list" className="flex-1 overflow-y-auto bg-cc-surface2 py-4">
        <MessageListSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div ref={ref} data-testid="message-list" className="flex-1 overflow-y-auto bg-cc-surface2 py-4">
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.author_id === m.author_id && (new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000);
          return (
            <motion.div
              key={m.message_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Message
                msg={m}
                grouped={grouped}
                mine={m.author_id === currentUser?.user_id}
                onReact={onReact}
                onReply={onReply}
                onCreateThread={onCreateThread}
                onOpenThread={onOpenThread}
                onOpenProfile={onOpenProfile}
                authorColor={memberColorMap?.[m.author_id]}
                customEmojiMap={customEmojiMap}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {messages.length === 0 && (
        <div className="text-center py-20 text-cc-muted text-xs uppercase tracking-widest">
          <span className="cc-marker">Aucun message — brisez le silence.</span>
        </div>
      )}
    </div>
  );
}
