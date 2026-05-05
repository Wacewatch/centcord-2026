import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export default function ModalShell({ title, subtitle, onClose, children, testId, wide, size }) {
  const widthClass = size === "lg" ? "max-w-2xl" : size === "xl" ? "max-w-4xl" : wide ? "max-w-3xl" : "max-w-md";
  return (
    <div className="fixed inset-0 z-50 cc-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
        className={`cc-card w-full ${widthClass} relative cc-brutal-shadow overflow-hidden`}
      >
        <button onClick={onClose} data-testid={`${testId}-close`} className="absolute right-4 top-4 p-2 hover:bg-cc-surface3 rounded-lg text-cc-subtext hover:text-cc-text transition-colors z-10">
          <X className="w-4 h-4" />
        </button>
        <div className="px-7 pt-7 pb-6">
          <div className="flex items-center gap-3">
            <span className="inline-block w-1 h-7 bg-gradient-to-b from-cc-accent to-cc-accentHover rounded-full" />
            <div>
              <h2 className="font-display text-2xl font-bold text-cc-text leading-tight">{title}</h2>
              {subtitle && <p className="text-sm text-cc-subtext mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className="mt-6">{children}</div>
        </div>
      </motion.div>
    </div>
  );
}
