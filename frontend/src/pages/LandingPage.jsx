import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Lock, Zap, Users, Hash, Mic, ArrowRight } from "lucide-react";

const Marker = ({ children }) => (
  <span className="inline-flex items-center text-cc-subtext text-xs uppercase tracking-[0.25em] font-bold">
    <span className="w-3 h-3 bg-cc-accent mr-3" /> {children}
  </span>
);

const FEATURE = [
  { icon: Shield, title: "Hardened by default", body: "Bcrypt, JWT rotation, CSRF-safe cookies, rate limits, strict CSP. No half-measures." },
  { icon: Lock, title: "End-to-end DMs", body: "ECDH P-256 + AES-GCM. Your private conversations never leave your device readable." },
  { icon: Zap, title: "Realtime WebSockets", body: "Native FastAPI WS. Messages, typing, presence — all push, no polling." },
  { icon: Users, title: "Servers & roles", body: "Categories, channels, roles, bans, audit logs. Full moderation toolkit." },
  { icon: Hash, title: "Forum & threads", body: "Long-form discussions sit alongside chat. Pin, react, reply." },
  { icon: Mic, title: "Voice signaling", body: "WebRTC signaling baked in for peer-to-peer DM calls." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cc-base text-cc-text relative overflow-x-hidden">
      {/* Top nav */}
      <header className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3" data-testid="brand">
            <div className="w-8 h-8 bg-cc-accent flex items-center justify-center font-display font-extrabold text-white">C</div>
            <span className="font-display text-xl font-extrabold tracking-tighter">CENTCORD</span>
            <span className="text-xs uppercase tracking-widest text-cc-muted ml-2">v2.0</span>
          </div>
          <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.2em] font-bold">
            <a href="#features" className="text-cc-subtext hover:text-cc-text">Features</a>
            <a href="#security" className="text-cc-subtext hover:text-cc-text">Security</a>
            <Link to="/auth" data-testid="nav-login" className="text-cc-subtext hover:text-cc-text">Login</Link>
            <Link
              to="/auth?mode=register"
              data-testid="nav-register"
              className="bg-cc-accent text-white px-4 py-2 cc-brutal-shadow cc-brutal-press"
            >
              Get started <ArrowRight className="inline w-3 h-3 ml-1" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7"
          >
            <Marker>Encrypted community OS — 2026 edition</Marker>
            <h1 className="font-display text-5xl lg:text-7xl font-extrabold tracking-tighter uppercase mt-6 leading-[0.95]">
              Talk like<br />it’s <span className="text-cc-accent">yours.</span>
            </h1>
            <p className="text-cc-subtext text-base mt-8 max-w-xl leading-relaxed">
              CentCord is a community platform built from the ground up for serious privacy. Servers, channels, roles, voice, DMs with end-to-end encryption — no compromises, no telemetry.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/auth?mode=register"
                data-testid="hero-cta-register"
                className="bg-cc-accent text-white font-bold tracking-wide uppercase px-7 py-4 cc-brutal-shadow cc-brutal-press"
              >
                Create free account
              </Link>
              <Link
                to="/auth"
                data-testid="hero-cta-login"
                className="border border-cc-border text-cc-text px-7 py-4 hover:bg-cc-surface2 transition-colors"
              >
                I already have one
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {[
                ["E2E", "DMs"],
                ["WS", "Realtime"],
                ["RBAC", "Roles"],
              ].map(([k, v]) => (
                <div key={k} className="border-l-2 border-cc-accent pl-3">
                  <div className="font-display font-extrabold text-lg">{k}</div>
                  <div className="text-cc-muted uppercase tracking-widest text-[10px]">{v}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="lg:col-span-5"
          >
            <div className="border border-cc-border bg-cc-surface1 cc-brutal-shadow p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <Marker>// session/secure</Marker>
                <span className="text-cc-success text-xs">● live</span>
              </div>
              <div className="space-y-3 font-jetbrains text-sm">
                <div>
                  <span className="text-cc-accent font-display font-bold">@nyx</span>
                  <span className="text-cc-muted text-xs ml-2">— in #general</span>
                  <p className="text-cc-text mt-1">push the new build, the brutalist UI lands clean</p>
                </div>
                <div>
                  <span className="text-cc-accent font-display font-bold">@vector</span>
                  <span className="text-cc-muted text-xs ml-2">— DM (encrypted)</span>
                  <p className="text-cc-text mt-1 cc-stripe px-2 py-1 inline-block">●●●●●● cipher.received</p>
                </div>
                <div>
                  <span className="text-cc-accent font-display font-bold">@kira</span>
                  <span className="text-cc-muted text-xs ml-2">— in #design</span>
                  <p className="text-cc-text mt-1">the orange hits different at 2am</p>
                </div>
              </div>
              <div className="cc-divider my-5" />
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cc-accent animate-pulse-dot" />
                <span className="text-xs text-cc-muted uppercase tracking-widest">3 typing in #general</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
          <Marker>Capabilities</Marker>
          <h2 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter uppercase mt-6 mb-12">
            A complete community stack.
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-cc-border">
            {FEATURE.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-cc-base p-8 hover:bg-cc-surface1 transition-colors group">
                <div className="w-10 h-10 border border-cc-border flex items-center justify-center group-hover:border-cc-accent group-hover:text-cc-accent transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-display font-bold text-xl mt-6">{title}</h3>
                <p className="text-cc-subtext text-sm mt-3 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 grid lg:grid-cols-2 gap-10">
          <div>
            <Marker>Security</Marker>
            <h2 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter uppercase mt-6">
              Built defense-first.
            </h2>
            <p className="text-cc-subtext mt-6 leading-relaxed">
              We rebuilt the original CentCord PHP project on a modern, async stack — and pushed every security control further.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            {[
              "Bcrypt password hashing — slow by design",
              "JWT access + refresh rotation, httpOnly cookies",
              "ECDH P-256 + AES-GCM E2E for direct messages",
              "Per-IP and per-user rate limiting",
              "Strict security headers (no clickjack, no MIME sniff)",
              "Granular RBAC with role-bitmask permissions",
              "Audit logs for every moderation action",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 border-b border-cc-border pb-3">
                <span className="w-2 h-2 bg-cc-accent mt-1.5 shrink-0" />
                <span className="text-cc-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20 text-center">
          <Marker>Get started</Marker>
          <h2 className="font-display text-5xl lg:text-7xl font-extrabold tracking-tighter uppercase mt-6 mb-10">
            Your server.<br />Your <span className="text-cc-accent">rules.</span>
          </h2>
          <Link
            to="/auth?mode=register"
            data-testid="cta-register"
            className="inline-flex items-center gap-2 bg-cc-accent text-white font-bold tracking-wide uppercase px-10 py-5 cc-brutal-shadow cc-brutal-press"
          >
            Sign up free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="py-10 text-center text-xs text-cc-muted uppercase tracking-widest">
        CentCord © 2026 — Built encrypted, shipped fast.
      </footer>
    </div>
  );
}
