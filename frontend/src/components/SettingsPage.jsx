import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import UserBar from "./UserBar";
import { initials } from "../lib/utils";
import { toast } from "sonner";
import { ArrowLeft, User, Bell, Shield, Palette, Bookmark } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import BookmarksPanel from "./BookmarksPanel";

const TABS = [
  { id: "profile", label: "Profil", icon: User },
  { id: "appearance", label: "Apparence", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "bookmarks", label: "Sauvegardés", icon: Bookmark },
  { id: "privacy", label: "Confidentialité & sécurité", icon: Shield },
];

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({
    display_name: user?.display_name || "",
    bio: user?.bio || "",
    pronouns: user?.pronouns || "",
    accent_color: user?.accent_color || "#FF3B00",
    custom_status: user?.custom_status || "",
    avatar_url: user?.avatar_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await api.patch("/users/me", form); await refreshUser(); toast.success("Profil enregistré"); }
    catch (_) { toast.error("Échec de l'enregistrement"); }
    finally { setSaving(false); }
  };

  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", f);
    try {
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const fullUrl = `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
      setForm({ ...form, avatar_url: fullUrl });
      toast.success("Avatar téléversé — cliquez sur Enregistrer");
    } catch (_) { toast.error("Échec du téléversement"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <>
      <aside className="w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0">
        <button onClick={() => navigate("/app/me")} data-testid="settings-back" className="px-4 h-12 border-b border-cc-border flex items-center gap-2 hover:bg-cc-surface2">
          <ArrowLeft className="w-4 h-4" /> <span className="font-display font-extrabold uppercase text-sm">Retour</span>
        </button>
        <div className="p-4 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`settings-tab-${t.id}`}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${tab === t.id ? "bg-cc-surface2 text-cc-text" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text"}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="mt-auto"><UserBar /></div>
      </aside>

      <main className="flex-1 bg-cc-surface2 overflow-y-auto p-10">
        <div className="max-w-2xl">
          {tab === "profile" && (
            <>
              <span className="text-xs uppercase tracking-[0.3em] font-bold text-cc-muted"><span className="inline-block w-3 h-3 bg-cc-accent mr-3 align-middle" /> Compte</span>
              <h1 className="font-display text-4xl font-extrabold tracking-tighter uppercase mt-4 mb-8">Profil</h1>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border">
                    {form.avatar_url ? <img src={form.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(form.display_name)}
                  </div>
                  <label className="bg-cc-surface1 border border-cc-border hover:bg-cc-surface1/60 cursor-pointer px-4 py-2 text-xs uppercase tracking-widest font-bold">
                    {uploading ? "Téléversement..." : "Téléverser un avatar"}
                    <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} data-testid="settings-avatar-upload" />
                  </label>
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Pseudonyme</label>
                  <input data-testid="settings-display-name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="mt-2 w-full bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Bio</label>
                  <textarea data-testid="settings-bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="mt-2 w-full bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Pronoms</label>
                    <input data-testid="settings-pronouns" value={form.pronouns} onChange={(e) => setForm({ ...form, pronouns: e.target.value })} className="mt-2 w-full bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Couleur d'accent</label>
                    <div className="mt-2 flex items-center gap-2">
                      <input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="w-10 h-10 bg-transparent border border-cc-border cursor-pointer" />
                      <input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="flex-1 bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5 font-jetbrains" />
                    </div>
                  </div>
                </div>
                <button data-testid="settings-save" onClick={save} disabled={saving} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-6 py-3 cc-brutal-shadow cc-brutal-press disabled:opacity-50">
                  {saving ? "Enregistrement..." : "Enregistrer les modifications"}
                </button>
              </div>
            </>
          )}
          {tab === "privacy" && (
            <>
              <h1 className="font-display text-4xl font-extrabold tracking-tighter uppercase mb-8">Confidentialité & sécurité</h1>
              <div className="space-y-3">
                <div className="border border-cc-border bg-cc-surface1 p-4 text-sm">
                  <div className="text-cc-text font-bold mb-1">Clés de chiffrement bout-en-bout</div>
                  <p className="text-cc-subtext text-xs">Une paire de clés ECDH P-256 est stockée localement sur cet appareil. Votre clé privée ne le quitte jamais.</p>
                </div>
                <div className="border border-cc-border bg-cc-surface1 p-4 text-sm">
                  <div className="text-cc-text font-bold mb-1">Politique de la plateforme</div>
                  <p className="text-cc-subtext text-xs">Lisez notre <Link to="/legal" className="text-cc-accent">politique anti-DMCA</Link> pour comprendre vos droits et obligations.</p>
                </div>
                <div className="border border-cc-border bg-cc-surface1 p-4 text-sm">
                  <div className="text-cc-text font-bold mb-1">Session active</div>
                  <p className="text-cc-subtext text-xs">Connecté en tant que {user?.email}.</p>
                  <button data-testid="logout-all" onClick={async () => { await logout(); navigate("/"); }} className="mt-3 text-xs uppercase tracking-widest font-bold text-cc-danger hover:text-cc-accent">Se déconnecter</button>
                </div>
              </div>
            </>
          )}
          {tab === "appearance" && (
            <>
              <h1 className="font-display text-4xl font-extrabold tracking-tighter uppercase mb-8">Apparence</h1>
              <p className="text-cc-subtext text-sm">Thème sombre éditorial brutaliste. Mode clair prévu en V2.</p>
            </>
          )}
          {tab === "notifications" && (
            <>
              <h1 className="font-display text-4xl font-extrabold tracking-tighter uppercase mb-8">Notifications</h1>
              <p className="text-cc-subtext text-sm">Les notifications en temps réel arrivent via WebSocket. Le panneau ouvrable se trouve dans la barre supérieure d'un salon.</p>
            </>
          )}
          {tab === "bookmarks" && <BookmarksPanel />}
        </div>
      </main>
    </>
  );
}
