import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { BACKEND_URL, getToken } from "./api";
import { useAuth } from "./auth";

const WSContext = createContext(null);

export function WSProvider({ children }) {
  const { user } = useAuth();
  const wsRef = useRef(null);
  const listenersRef = useRef(new Map());
  const [connected, setConnected] = useState(false);

  const subscribe = useCallback((event, fn) => {
    const list = listenersRef.current.get(event) || [];
    list.push(fn);
    listenersRef.current.set(event, list);
    return () => {
      const arr = listenersRef.current.get(event) || [];
      listenersRef.current.set(event, arr.filter((x) => x !== fn));
    };
  }, []);

  const send = useCallback((event, data) => {
    try { wsRef.current?.send(JSON.stringify({ event, data })); } catch (_) {}
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;
    const url = BACKEND_URL.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(token)}`;
    let alive = true;
    let pingInterval = null;
    let reconnectTimer = null;

    const connect = () => {
      if (!alive) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        pingInterval = setInterval(() => { try { ws.send(JSON.stringify({ event: "ping" })); } catch (_) {} }, 25000);
      };
      ws.onmessage = (msg) => {
        try {
          const { event, data } = JSON.parse(msg.data);
          (listenersRef.current.get(event) || []).forEach((fn) => fn(data));
          (listenersRef.current.get("*") || []).forEach((fn) => fn({ event, data }));
        } catch (_) {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        if (alive) reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    };
    connect();
    return () => {
      alive = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch (_) {}
    };
  }, [user]);

  return <WSContext.Provider value={{ connected, subscribe, send }}>{children}</WSContext.Provider>;
}

export const useWS = () => useContext(WSContext);
