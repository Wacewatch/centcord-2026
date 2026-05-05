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
      toast.success(`Serveur « ${data.name} » créé`);
      onCreated(data); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
    finally { setLoading(false); }
  };
  return (
    <ModalShell title="Créer un serveur" onClose={onClose} testId="create-server-modal">
      <h2 className="font-display text-3xl font-extrabold uppercase tracking-tighter mt-2">Nouvelle communauté.</h2>
      <p className="text-cc-subtext text-sm mt-2">Un serveur, c'est votre espace — salons, rôles, membres, ambiance. Tout reste modifiable.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Nom du serveur</label>
          <input data-testid="create-server-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" required minLength={2} maxLength={64} />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Description</label>
          <textarea data-testid="create-server-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" maxLength={400} />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-cc-accent w-4 h-4" data-testid="create-server-public" />
          <span className="text-sm">Public — apparaît dans la découverte</span>
        </label>
        <p className="text-[10px] uppercase tracking-widest text-cc-muted border-l-2 border-cc-accent pl-3">
          En créant ce serveur, vous acceptez la politique anti-DMCA : aucun serveur n'est supprimé sauf en cas d'activité illégale confirmée.
        </p>
        <button data-testid="create-server-submit" disabled={loading} className="w-full bg-cc-accent text-white font-bold uppercase tracking-wide py-3 cc-brutal-shadow cc-brutal-press disabled:opacity-50">
          {loading ? "Création..." : "Créer le serveur"}
        </button>
      </form>
    </ModalShell>
  );
}
