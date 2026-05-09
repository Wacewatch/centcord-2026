import React from "react";
import { Phone, Video, X } from "lucide-react";
import { initials } from "../lib/utils";

/**
 * Notification overlay for incoming DM calls
 * Shows caller info and Accept/Decline buttons
 */
export default function IncomingCallNotification({ caller, withVideo, onAccept, onDecline }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-cc-surface1 border border-cc-border rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-300">
        {/* Caller Avatar */}
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-24 h-24 bg-gradient-to-br from-cc-accent/20 to-cc-accent/5 flex items-center justify-center font-display font-extrabold rounded-full border-4 border-cc-border text-2xl shadow-lg">
              {caller?.avatar_url ? (
                <img src={caller.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                initials(caller?.display_name || "?")
              )}
            </div>
            {/* Animated ring */}
            <div className="absolute inset-0 rounded-full border-4 border-cc-accent animate-ping opacity-20" />
          </div>
          
          <div className="text-center">
            <h2 className="text-xl font-display font-bold text-cc-text mb-1">
              {caller?.display_name || "Utilisateur"}
            </h2>
            <div className="flex items-center justify-center gap-2 text-cc-subtext text-sm">
              {withVideo ? (
                <>
                  <Video className="w-4 h-4 text-cc-accent" />
                  <span>Appel vidéo entrant...</span>
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4 text-cc-accent" />
                  <span>Appel audio entrant...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onDecline}
            className="flex-1 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            data-testid="call-decline"
          >
            <X className="w-5 h-5" />
            <span>Refuser</span>
          </button>
          
          <button
            onClick={onAccept}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-green-500/30 flex items-center justify-center gap-2"
            data-testid="call-accept"
            autoFocus
          >
            {withVideo ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            <span>Accepter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
