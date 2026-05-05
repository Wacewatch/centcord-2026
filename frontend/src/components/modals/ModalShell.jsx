import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export default function ModalShell({ title, onClose, children, testId, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
        className={`bg-cc-surface1 border border-cc-border w-full ${wide ? "max-w-3xl" : "max-w-md"} cc-brutal-shadow relative`}
      >
        <button onClick={onClose} data-testid={`${testId}-close`} className="absolute right-3 top-3 p-1.5 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text"><X className="w-4 h-4" /></button>
        <div className="p-7">
          <span className="text-xs uppercase tracking-[0.3em] font-bold text-cc-muted">
            <span className="inline-block w-3 h-3 bg-cc-accent mr-3 align-middle" /> {title}
          </span>
          <div className="mt-4">{children}</div>
        </div>
      </motion.div>
    </div>
  );
}
