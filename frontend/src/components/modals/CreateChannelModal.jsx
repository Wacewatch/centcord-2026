import React, { useState } from "react";
import api from "../../lib/api";
import ModalShell from "./ModalShell";
import { Hash, Volume2, Megaphone, BookOpen, Lock, Globe, Sparkles } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { id: "text", label: "Texte", desc: "Échangez des messages, fichiers, images et plus.", icon: Hash, color: "from-orange-500/20 to-orange-600/5" },
  { id: "voice", label: "Vocal", desc: "Discutez en direct avec vos membres.", icon: Volume2, color: "from-violet-500/20 to-violet-600/5" },
  { id: "announcement", label: "Annonce", desc: "Salon réservé aux annonces officielles.", icon: Megaphone, color: "from-amber-500/20 to-amber-600/5" },
  { id: "forum", label: "Forum", desc: "Conversations organisées en posts.", icon: BookOpen, color: "from-emerald-500/20 to-emerald-600/5" },
];

export default function CreateChannelModal({ serverId, categories = [], defaultCategoryId = null, onClose, onCreated }) {
  const [type, setType] = useState("text");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

  const submit = async () => {
    const cleanName = type === "text" || type === "announcement" || type === "forum" ? slugify(name) : name.trim();
    if (cleanName.length < 1) { toast.error("Le nom est requis"); return; }
    setLoading(true);
    try {
      const { data } = await api.post(`/servers/${serverId}/channels`, {
        name: cleanName,
        type,
        topic: topic.trim() || "",
        category_id: categoryId || null,
      });
      toast.success(`Salon « ${cleanName} » créé`);
      onCreated && onCreated(data);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec de la création"); }
    finally { setLoading(false); }
  };

  const selectedType = TYPES.find(t => t.id === type);
  const SelectedIcon = selectedType.icon;

  return (
    <ModalShell title="Créer un salon" subtitle="Choisissez un type, donnez-lui un nom — c'est parti." onClose={onClose} testId="create-channel-modal" size="lg">
      <div className="space-y-6">
        {/* Type cards */}
        <div>
          <div className="cc-label mb-2.5">Type de salon</div>
          <div className="grid grid-cols-2 gap-2.5">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = t.id === type;
              return (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  data-testid={`channel-type-${t.id}`}
                  className={`group relative text-left p-4 rounded-xl border transition-all ${
                    active
                      ? "border-cc-accent bg-gradient-to-br " + t.color + " shadow-[0_0_0_3px_rgba(255,59,0,0.12)]"
                      : "border-cc-border bg-cc-surface1 hover:border-cc-accent/40 hover:bg-cc-surface2"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${active ? "bg-cc-accent text-white" : "bg-cc-surface2 text-cc-subtext group-hover:text-cc-accent"} transition-colors`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-semibold text-[15px] text-cc-text">{t.label}</div>
                      <div className="text-[12px] text-cc-subtext mt-0.5 leading-snug">{t.desc}</div>
                    </div>
                    {active && <Sparkles className="w-3.5 h-3.5 text-cc-accent shrink-0 mt-1" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Name */}
        <div>
          <div className="cc-label mb-2">Nom du salon</div>
          <div className="relative">
            <SelectedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cc-muted pointer-events-none" />
            <input
              autoFocus
              data-testid="channel-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              maxLength={32}
              placeholder={type === "voice" ? "Salon vocal général" : "nouveau-salon"}
              className="cc-input !pl-10"
            />
          </div>
          {(type === "text" || type === "announcement" || type === "forum") && name && (
            <p className="text-[11px] text-cc-muted mt-1.5 font-jetbrains">→ #{slugify(name) || "..."}</p>
          )}
        </div>

        {/* Topic (optional, text only) */}
        {(type === "text" || type === "announcement") && (
          <div>
            <div className="cc-label mb-2">Sujet <span className="text-cc-muted normal-case tracking-normal text-[11px] font-normal">(optionnel)</span></div>
            <input
              data-testid="channel-topic-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={500}
              placeholder="De quoi parle-t-on ici ?"
              className="cc-input"
            />
          </div>
        )}

        {/* Category */}
        {categories.length > 0 && (
          <div>
            <div className="cc-label mb-2">Catégorie</div>
            <select
              value={categoryId || ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              data-testid="channel-category-select"
              className="cc-input cursor-pointer"
            >
              <option value="">— Sans catégorie —</option>
              {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Private toggle */}
        <button
          onClick={() => setIsPrivate(!isPrivate)}
          data-testid="channel-private-toggle"
          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
            isPrivate ? "border-cc-accent bg-cc-accent/5" : "border-cc-border bg-cc-surface1 hover:bg-cc-surface2"
          }`}
        >
          <div className={`p-2 rounded-lg ${isPrivate ? "bg-cc-accent text-white" : "bg-cc-surface2 text-cc-subtext"}`}>
            {isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
          </div>
          <div className="flex-1 text-left">
            <div className="font-display font-semibold text-[14px]">{isPrivate ? "Salon privé" : "Salon public"}</div>
            <div className="text-[12px] text-cc-subtext">{isPrivate ? "Seuls les rôles autorisés y ont accès." : "Tous les membres peuvent y accéder."}</div>
          </div>
          <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${isPrivate ? "bg-cc-accent" : "bg-cc-surface3"}`}>
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${isPrivate ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </button>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-cc-borderSoft">
          <button onClick={onClose} className="cc-btn-ghost" data-testid="channel-cancel">Annuler</button>
          <button onClick={submit} disabled={loading || !name.trim()} className="cc-btn-accent flex items-center gap-2" data-testid="channel-submit">
            {loading ? <div className="cc-spinner !w-4 !h-4 !border-white/30 !border-t-white" /> : <SelectedIcon className="w-4 h-4" />}
            {loading ? "Création..." : `Créer le salon`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
