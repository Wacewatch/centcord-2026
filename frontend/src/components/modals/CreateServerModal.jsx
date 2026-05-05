import React, { useState } from "react";
import api from "../../lib/api";
import { toast } from "sonner";
import ModalShell from "./ModalShell";

export default function CreateServerModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/servers", { name, description, is_public: isPublic });
      toast.success(`Server "${data.name}" created`);
      onCreated(data); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };
  return (
    <ModalShell title="Create server" onClose={onClose} testId="create-server-modal">
      <h2 className="font-display text-3xl font-extrabold uppercase tracking-tighter mt-2">New community.</h2>
      <p className="text-cc-subtext text-sm mt-2">A server is your space — channels, roles, members, vibe. You can change it all later.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Server name</label>
          <input data-testid="create-server-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" required minLength={2} maxLength={64} />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Description</label>
          <textarea data-testid="create-server-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" maxLength={400} />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-cc-accent w-4 h-4" data-testid="create-server-public" />
          <span className="text-sm">Make public — appears in discovery</span>
        </label>
        <button data-testid="create-server-submit" disabled={loading} className="w-full bg-cc-accent text-white font-bold uppercase tracking-wide py-3 cc-brutal-shadow cc-brutal-press disabled:opacity-50">
          {loading ? "Creating..." : "Create server"}
        </button>
      </form>
    </ModalShell>
  );
}
