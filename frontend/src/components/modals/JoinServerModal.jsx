import React, { useState } from "react";
import api from "../../lib/api";
import { toast } from "sonner";
import ModalShell from "./ModalShell";

export default function JoinServerModal({ onClose, onJoined }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const trimmed = code.trim().split("/").pop();
      const { data } = await api.post(`/invites/${trimmed}`);
      toast.success(`Joined ${data.name}`);
      onJoined(data); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Invalid invite"); }
    finally { setLoading(false); }
  };
  return (
    <ModalShell title="Join a server" onClose={onClose} testId="join-server-modal">
      <h2 className="font-display text-3xl font-extrabold uppercase tracking-tighter mt-2">Got an invite?</h2>
      <p className="text-cc-subtext text-sm mt-2">Paste an invite code or full link below.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input data-testid="join-server-input" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD1234" className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5 font-jetbrains" />
        <button data-testid="join-server-submit" disabled={loading || !code.trim()} className="w-full bg-cc-accent text-white font-bold uppercase tracking-wide py-3 cc-brutal-shadow cc-brutal-press disabled:opacity-50">
          {loading ? "Joining..." : "Join"}
        </button>
      </form>
    </ModalShell>
  );
}
