import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { toast } from "sonner";
import ModalShell from "./ModalShell";
import { useAuth } from "../../lib/auth";
import { useNavigate } from "react-router-dom";
import { Copy, Trash2 } from "lucide-react";
import { initials } from "../../lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "roles", label: "Roles" },
  { id: "invites", label: "Invites" },
  { id: "bans", label: "Bans" },
  { id: "audit", label: "Audit log" },
  { id: "danger", label: "Danger zone" },
];

export default function ServerSettingsModal({ server, onClose, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState({ name: server.name, description: server.description, is_public: server.is_public });
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState([]);
  const [bans, setBans] = useState([]);
  const [audit, setAudit] = useState([]);
  const isOwner = server.owner_id === user?.user_id;

  useEffect(() => {
    if (tab === "invites") api.get(`/servers/${server.server_id}/invites`).then(r => setInvites(r.data)).catch(() => {});
    if (tab === "bans") api.get(`/servers/${server.server_id}/bans`).then(r => setBans(r.data)).catch(() => {});
    if (tab === "audit") api.get(`/servers/${server.server_id}/audit-log`).then(r => setAudit(r.data)).catch(() => {});
  }, [tab, server.server_id]);

  const save = async () => {
    setSaving(true);
    try { await api.patch(`/servers/${server.server_id}`, form); toast.success("Saved"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const newInvite = async () => {
    try { const { data } = await api.post(`/servers/${server.server_id}/invites`, { max_uses: 0, expires_in_minutes: 10080 }); setInvites([data, ...invites]); }
    catch (_) { toast.error("Failed"); }
  };
  const copy = (code) => { navigator.clipboard.writeText(code); toast.success("Copied"); };

  const deleteServer = async () => {
    if (!window.confirm(`Type "${server.name}" to confirm deletion?`)) return;
    try { await api.delete(`/servers/${server.server_id}`); toast.success("Server deleted"); onClose(); reload(); navigate("/app/me"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const leaveServer = async () => {
    if (!window.confirm(`Leave ${server.name}?`)) return;
    try { await api.post(`/servers/${server.server_id}/leave`); toast.success("Left server"); onClose(); reload(); navigate("/app/me"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <ModalShell title={`${server.name} · settings`} onClose={onClose} testId="server-settings-modal" wide>
      <div className="grid grid-cols-12 gap-6 mt-2">
        <nav className="col-span-3 space-y-1 border-r border-cc-border pr-3">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`server-tab-${t.id}`} className={`w-full text-left px-3 py-2 text-sm transition-colors ${tab === t.id ? "bg-cc-surface2 text-cc-text" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text"}`}>{t.label}</button>
          ))}
        </nav>
        <div className="col-span-9 max-h-[60vh] overflow-y-auto">
          {tab === "overview" && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Name</label>
                <input data-testid="server-edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Description</label>
                <textarea data-testid="server-edit-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} className="accent-cc-accent w-4 h-4" data-testid="server-edit-public" />
                <span className="text-sm">Public — appears in discovery</span>
              </label>
              <button data-testid="server-edit-save" onClick={save} disabled={saving} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-5 py-2.5 cc-brutal-shadow cc-brutal-press disabled:opacity-50">{saving ? "Saving" : "Save"}</button>
            </div>
          )}
          {tab === "roles" && (
            <div>
              <ul className="space-y-2">
                {(server.roles || []).map((r) => (
                  <li key={r.role_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-3">
                    <span className="w-3 h-3" style={{ background: r.color }} />
                    <span className="font-display font-bold">{r.name}</span>
                    {r.is_default && <span className="text-[9px] uppercase tracking-widest text-cc-muted">default</span>}
                    <span className="ml-auto text-[10px] uppercase tracking-widest text-cc-muted">perms: {r.permissions}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-cc-muted mt-3 uppercase tracking-widest">Custom role permissions UI in V2.</p>
            </div>
          )}
          {tab === "invites" && (
            <div>
              <button data-testid="invite-create" onClick={newInvite} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-4 py-2 cc-brutal-shadow cc-brutal-press mb-4">Create invite</button>
              <ul className="space-y-2">
                <li className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center justify-between">
                  <span className="font-mono text-sm">{server.invite_code} <span className="text-[10px] uppercase tracking-widest text-cc-muted ml-2">default</span></span>
                  <button onClick={() => copy(server.invite_code)} className="text-cc-subtext hover:text-cc-accent"><Copy className="w-3.5 h-3.5" /></button>
                </li>
                {invites.map((inv) => (
                  <li key={inv.invite_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center justify-between">
                    <span className="font-mono text-sm">{inv.code}</span>
                    <span className="text-[10px] uppercase tracking-widest text-cc-muted">uses: {inv.uses}/{inv.max_uses || "∞"}</span>
                    <button onClick={() => copy(inv.code)} className="text-cc-subtext hover:text-cc-accent"><Copy className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === "bans" && (
            <ul className="space-y-2">
              {bans.map((b) => (
                <li key={b.user_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-3">
                  <div className="w-7 h-7 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px]">{initials(b.user?.display_name || "?")}</div>
                  <span className="text-sm">{b.user?.display_name || b.user_id}</span>
                  <button onClick={async () => { await api.delete(`/servers/${server.server_id}/bans/${b.user_id}`); setBans(bans.filter(x => x.user_id !== b.user_id)); toast.success("Unbanned"); }} className="ml-auto text-xs uppercase tracking-widest font-bold text-cc-accent hover:text-cc-text">Unban</button>
                </li>
              ))}
              {bans.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">No bans.</li>}
            </ul>
          )}
          {tab === "audit" && (
            <ul className="space-y-2">
              {audit.map((a) => (
                <li key={a.audit_id} className="border-l-2 border-cc-accent pl-3 py-1 text-sm">
                  <div className="text-cc-text">{a.actor?.display_name || a.actor_id} · <span className="text-cc-accent uppercase tracking-widest text-[10px]">{a.action}</span></div>
                  <div className="text-[10px] text-cc-muted">{a.at}</div>
                </li>
              ))}
              {audit.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">No actions yet.</li>}
            </ul>
          )}
          {tab === "danger" && (
            <div className="space-y-3">
              {!isOwner && (
                <button onClick={leaveServer} data-testid="leave-server" className="w-full border border-cc-danger text-cc-danger uppercase tracking-widest font-bold py-3 hover:bg-cc-danger hover:text-white transition-colors">Leave server</button>
              )}
              {isOwner && (
                <button onClick={deleteServer} data-testid="delete-server" className="w-full border border-cc-danger text-cc-danger uppercase tracking-widest font-bold py-3 hover:bg-cc-danger hover:text-white transition-colors flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete server
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
