import React from "react";
import api from "../lib/api";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function BoostBadge({ server, onChange }) {
  const [busy, setBusy] = useState(false);
  const count = server.boost_count || 0;
  const tier = count >= 14 ? 3 : count >= 7 ? 2 : count >= 2 ? 1 : 0;

  const boost = async () => {
    setBusy(true);
    try { await api.post(`/servers/${server.server_id}/boost`); toast.success("Serveur boosté ✨"); onChange && onChange(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
    finally { setBusy(false); }
  };

  return (
    <button onClick={boost} disabled={busy} data-testid="boost-btn" className="flex items-center gap-1.5 px-2 py-1 border border-cc-border hover:border-cc-accent transition-colors text-xs" title="Booster ce serveur">
      <Rocket className={`w-3.5 h-3.5 ${tier > 0 ? "text-cc-accent" : "text-cc-muted"}`} />
      <span className="font-jetbrains tabular-nums">{count}</span>
      {tier > 0 && <span className="text-[9px] uppercase tracking-widest text-cc-accent font-bold">T{tier}</span>}
    </button>
  );
}
