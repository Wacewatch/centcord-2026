import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import api from "../lib/api";

/**
 * Cloudflare Turnstile widget.
 * - Loads the Turnstile script lazily.
 * - Fetches the public site key from /api/auth/captcha/config.
 * - Calls onToken(token) when verified, onToken(null) when expired/error.
 */
export default function TurnstileWidget({ onToken }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [siteKey, setSiteKey] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("loading"); // loading | ready | verified | error

  // 1) Get config from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/auth/captcha/config");
        if (cancelled) return;
        setSiteKey(data.site_key);
        setEnabled(data.enabled);
        if (!data.enabled) {
          // Captcha disabled: auto-pass
          onToken && onToken("disabled");
          setStatus("verified");
        }
      } catch (e) {
        // If config fails, still try with a known test key so UX is preserved
        if (!cancelled) {
          setSiteKey("1x00000000000000000000AA");
          setEnabled(true);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Load Turnstile script
  useEffect(() => {
    if (!siteKey || !enabled) return;
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (existing) {
      setStatus("ready");
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => setStatus("ready");
    s.onerror = () => setStatus("error");
    document.head.appendChild(s);
  }, [siteKey, enabled]);

  // 3) Render widget when script is ready
  useEffect(() => {
    if (status !== "ready" || !window.turnstile || !containerRef.current || widgetIdRef.current) return;
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => {
          setStatus("verified");
          onToken && onToken(token);
        },
        "error-callback": () => {
          setStatus("error");
          onToken && onToken(null);
        },
        "expired-callback": () => {
          setStatus("ready");
          onToken && onToken(null);
        },
      });
    } catch (e) {
      setStatus("error");
    }
    return () => {
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, siteKey]);

  if (!enabled) {
    return (
      <div className="border border-cc-border bg-cc-surface1 px-3 py-2 flex items-center gap-2" data-testid="turnstile-widget-disabled">
        <ShieldCheck className="w-4 h-4 text-cc-success" />
        <span className="text-xs text-cc-subtext">Vérification désactivée</span>
      </div>
    );
  }

  return (
    <div data-testid="turnstile-widget" className="border border-cc-border bg-cc-surface1 p-3">
      <div ref={containerRef} className="cf-turnstile" />
      {status === "loading" && (
        <div className="text-xs text-cc-muted mt-2 flex items-center gap-2">
          <div className="cc-spinner" /> Chargement de la vérification…
        </div>
      )}
      {status === "error" && (
        <div className="text-xs text-cc-danger mt-2">Erreur de vérification. Recharge la page.</div>
      )}
      {status === "verified" && (
        <div className="text-xs text-cc-success mt-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Vérifié
        </div>
      )}
    </div>
  );
}
