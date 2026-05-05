import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import ServerRail from "../components/ServerRail";
import DMHome from "../components/DMHome";
import DMView from "../components/DMView";
import ServerView from "../components/ServerView";
import DiscoverPage from "../components/DiscoverPage";
import SettingsPage from "../components/SettingsPage";
import CreateServerModal from "../components/modals/CreateServerModal";
import JoinServerModal from "../components/modals/JoinServerModal";
import { toast } from "sonner";

export default function AppLayout() {
  const { user } = useAuth();
  const ws = useWS();
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      const { data } = await api.get("/servers");
      setServers(data);
    } catch (_) {}
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  useEffect(() => {
    if (!ws) return;
    const offDelete = ws.subscribe("server.delete", () => loadServers());
    const offUpdate = ws.subscribe("server.update", () => loadServers());
    const offKick = ws.subscribe("kicked", (d) => {
      toast.error("You were removed from a server");
      loadServers();
      navigate("/app/me");
    });
    return () => { offDelete(); offUpdate(); offKick(); };
  }, [ws, loadServers, navigate]);

  return (
    <div className="h-screen w-screen flex bg-cc-base text-cc-text overflow-hidden">
      <ServerRail
        servers={servers}
        onCreate={() => setOpenCreate(true)}
        onJoin={() => setOpenJoin(true)}
      />
      <Routes>
        <Route path="/" element={<Navigate to="/app/me" replace />} />
        <Route path="/me" element={<DMHome />} />
        <Route path="/me/:dmId" element={<DMView />} />
        <Route path="/discover" element={<DiscoverPage onJoined={loadServers} />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/servers/:serverId" element={<ServerView servers={servers} reload={loadServers} />} />
        <Route path="/servers/:serverId/channels/:channelId" element={<ServerView servers={servers} reload={loadServers} />} />
        <Route path="*" element={<Navigate to="/app/me" replace />} />
      </Routes>

      {openCreate && <CreateServerModal onClose={() => setOpenCreate(false)} onCreated={(s) => { loadServers(); navigate(`/app/servers/${s.server_id}`); }} />}
      {openJoin && <JoinServerModal onClose={() => setOpenJoin(false)} onJoined={(s) => { loadServers(); navigate(`/app/servers/${s.server_id}`); }} />}
    </div>
  );
}
