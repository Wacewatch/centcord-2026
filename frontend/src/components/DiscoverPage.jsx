import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { initials } from "../lib/utils";
import { Search, Users } from "lucide-react";
import UserBar from "./UserBar";
import { toast } from "sonner";

export default function DiscoverPage({ onJoined }) {
  const [q, setQ] = useState("");
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async (query = "") => {
    setLoading(true);
    try { const { data } = await api.get(`/servers/discover${query ? `?q=${encodeURIComponent(query)}` : ""}`); setServers(data); }
    catch (_) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const join = async (s) => {
    try {
      await api.post(`/invites/${s.invite_code}`);
      toast.success(`Vous avez rejoint ${s.name}`);
      onJoined && onJoined();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  return (
    <>
      <aside className="w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0">
        <div className="px-4 h-12 border-b border-cc-border flex items-center font-display font-extrabold uppercase text-sm tracking-tighter">DÉCOUVRIR</div>
        <div className="flex-1" />
        <div className="mt-auto"><UserBar /></div>
      </aside>
      <main className="flex-1 flex flex-col bg-cc-surface2 overflow-y-auto">
        <header className="h-12 border-b border-cc-border px-6 flex items-center">
          <span className="font-display font-bold uppercase tracking-tight">Découverte de serveurs</span>
        </header>
        <div className="px-10 py-12">
          <span className="text-xs uppercase tracking-[0.3em] font-bold text-cc-muted"><span className="inline-block w-3 h-3 bg-cc-accent mr-3 align-middle" /> Trouvez votre tribu</span>
          <h1 className="font-display text-5xl font-extrabold tracking-tighter uppercase mt-4">Serveurs publics.</h1>
          <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mt-8 flex items-center gap-3 max-w-2xl bg-cc-surface1 border border-cc-border focus-within:border-cc-accent px-4 py-3">
            <Search className="w-4 h-4 text-cc-muted" />
            <input data-testid="discover-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom ou description" className="flex-1 bg-transparent outline-none" />
            <button data-testid="discover-search-submit" className="text-xs uppercase tracking-widest font-bold text-cc-accent">Rechercher</button>
          </form>
          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-cc-border">
            {servers.map((s) => (
              <div key={s.server_id} className="bg-cc-surface2 p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border">
                    {s.icon_url ? <img src={s.icon_url} alt="" className="w-full h-full object-cover" /> : initials(s.name)}
                  </div>
                  <div>
                    <div className="font-display font-bold">{s.name}</div>
                    <div className="text-[10px] text-cc-muted uppercase tracking-widest flex items-center gap-1"><Users className="w-3 h-3" /> {s.member_count} membres</div>
                  </div>
                </div>
                <p className="text-sm text-cc-subtext line-clamp-3 flex-1">{s.description || "Aucune description."}</p>
                <button onClick={() => join(s)} data-testid={`discover-join-${s.server_id}`} className="mt-4 bg-cc-accent text-white font-bold uppercase tracking-wide py-2 cc-brutal-shadow cc-brutal-press">Rejoindre</button>
              </div>
            ))}
            {!loading && servers.length === 0 && (
              <div className="bg-cc-surface2 p-12 col-span-full text-center text-cc-muted text-xs uppercase tracking-widest">
                Aucun serveur public — soyez le premier à en rendre un public.
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
