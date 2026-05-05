import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Lock, Zap, Users, Hash, Mic, ArrowRight, ScrollText } from "lucide-react";

const Marker = ({ children }) => (
  <span className="inline-flex items-center text-cc-subtext text-xs uppercase tracking-[0.25em] font-bold">
    <span className="w-3 h-3 bg-cc-accent mr-3" /> {children}
  </span>
);

const FEATURE = [
  { icon: Shield, title: "Durci par défaut", body: "Bcrypt, rotation JWT, cookies SameSite, rate-limiting, CSP stricte. Aucun compromis." },
  { icon: Lock, title: "MP chiffrés bout-en-bout", body: "ECDH P-256 + AES-GCM. Vos conversations privées ne quittent jamais votre appareil en clair." },
  { icon: Zap, title: "WebSockets temps réel", body: "FastAPI WS natif. Messages, frappe, présence — tout en push, sans polling." },
  { icon: Users, title: "Serveurs & rôles", body: "Catégories, salons, rôles, bans, journaux d'audit. La boîte à outils complète de modération." },
  { icon: Hash, title: "Forum & fils", body: "Discussions longues côte à côte avec le chat. Épingler, réagir, répondre." },
  { icon: Mic, title: "Signalisation vocale", body: "Signalisation WebRTC intégrée pour des appels MP en pair-à-pair." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cc-base text-cc-text relative overflow-x-hidden">
      <header className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3" data-testid="brand">
            <div className="w-8 h-8 bg-cc-accent flex items-center justify-center font-display font-extrabold text-white">C</div>
            <span className="font-display text-xl font-extrabold tracking-tighter">CENTCORD</span>
            <span className="text-xs uppercase tracking-widest text-cc-muted ml-2">v2.0</span>
          </div>
          <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.2em] font-bold">
            <a href="#features" className="text-cc-subtext hover:text-cc-text">Fonctions</a>
            <a href="#security" className="text-cc-subtext hover:text-cc-text">Sécurité</a>
            <Link to="/legal" data-testid="nav-legal" className="text-cc-subtext hover:text-cc-text">Légal</Link>
            <Link to="/auth" data-testid="nav-login" className="text-cc-subtext hover:text-cc-text">Connexion</Link>
            <Link to="/auth?mode=register" data-testid="nav-register" className="bg-cc-accent text-white px-4 py-2 cc-brutal-shadow cc-brutal-press">
              Commencer <ArrowRight className="inline w-3 h-3 ml-1" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="lg:col-span-7">
            <Marker>OS communautaire chiffré — édition 2026</Marker>
            <h1 className="font-display text-5xl lg:text-7xl font-extrabold tracking-tighter uppercase mt-6 leading-[0.95]">
              Parlez<br/>sans <span className="text-cc-accent">compromis.</span>
            </h1>
            <p className="text-cc-subtext text-base mt-8 max-w-xl leading-relaxed">
              CentCord est une plateforme communautaire conçue pour la confidentialité sérieuse. Serveurs, salons, rôles, vocal, MP chiffrés bout-en-bout — sans concessions, sans télémétrie.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/auth?mode=register" data-testid="hero-cta-register" className="bg-cc-accent text-white font-bold tracking-wide uppercase px-7 py-4 cc-brutal-shadow cc-brutal-press">
                Créer un compte gratuit
              </Link>
              <Link to="/auth" data-testid="hero-cta-login" className="border border-cc-border text-cc-text px-7 py-4 hover:bg-cc-surface2 transition-colors">
                J'en ai déjà un
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {[["E2E","MP"],["WS","Temps réel"],["RBAC","Rôles"]].map(([k,v]) => (
                <div key={k} className="border-l-2 border-cc-accent pl-3">
                  <div className="font-display font-extrabold text-lg">{k}</div>
                  <div className="text-cc-muted uppercase tracking-widest text-[10px]">{v}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="lg:col-span-5">
            <div className="border border-cc-border bg-cc-surface1 cc-brutal-shadow p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <Marker>// session/sécurisée</Marker>
                <span className="text-cc-success text-xs">● en direct</span>
              </div>
              <div className="space-y-3 font-jetbrains text-sm">
                <div>
                  <span className="text-cc-accent font-display font-bold">@nyx</span>
                  <span className="text-cc-muted text-xs ml-2">— dans #général</span>
                  <p className="text-cc-text mt-1">je pousse le nouveau build, l'UI brutaliste tape juste</p>
                </div>
                <div>
                  <span className="text-cc-accent font-display font-bold">@vector</span>
                  <span className="text-cc-muted text-xs ml-2">— MP (chiffré)</span>
                  <p className="text-cc-text mt-1 cc-stripe px-2 py-1 inline-block">●●●●●● cipher.reçu</p>
                </div>
                <div>
                  <span className="text-cc-accent font-display font-bold">@kira</span>
                  <span className="text-cc-muted text-xs ml-2">— dans #design</span>
                  <p className="text-cc-text mt-1">l'orange tape différemment à 2h du mat</p>
                </div>
              </div>
              <div className="cc-divider my-5" />
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cc-accent animate-pulse-dot" />
                <span className="text-xs text-cc-muted uppercase tracking-widest">3 personnes écrivent dans #général</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="features" className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
          <Marker>Capacités</Marker>
          <h2 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter uppercase mt-6 mb-12">Une stack communautaire complète.</h2>
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

      <section id="security" className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 grid lg:grid-cols-2 gap-10">
          <div>
            <Marker>Sécurité</Marker>
            <h2 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter uppercase mt-6">Construit défense en premier.</h2>
            <p className="text-cc-subtext mt-6 leading-relaxed">
              Nous avons reconstruit le projet PHP CentCord original sur une stack moderne et asynchrone — en poussant chaque contrôle de sécurité plus loin.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            {[
              "Hachage bcrypt — lent par conception",
              "JWT avec accès + refresh, cookies httpOnly",
              "Chiffrement bout-en-bout ECDH P-256 + AES-GCM des MP",
              "Rate-limiting par IP et par utilisateur",
              "En-têtes de sécurité stricts (anti-clickjack, anti-MIME-sniff)",
              "RBAC granulaire avec permissions en bitmask",
              "Journaux d'audit pour chaque action de modération",
              "Politique anti-DMCA : aucune suppression sans activité illégale prouvée",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 border-b border-cc-border pb-3">
                <span className="w-2 h-2 bg-cc-accent mt-1.5 shrink-0" />
                <span className="text-cc-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-cc-border bg-cc-surface1">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-2">
            <ScrollText className="w-12 h-12 text-cc-accent" />
          </div>
          <div className="lg:col-span-7">
            <Marker>Politique anti-DMCA</Marker>
            <h2 className="font-display text-3xl lg:text-4xl font-extrabold uppercase tracking-tighter mt-4">
              Votre serveur reste votre serveur.
            </h2>
            <p className="text-cc-subtext mt-4">
              Aucun serveur n'est supprimé sauf en cas d'activité illégale confirmée par la plateforme. Pas de demandes de retrait DMCA non couvertes par le droit applicable. Vous gardez le contrôle de votre communauté.
            </p>
          </div>
          <div className="lg:col-span-3 flex justify-end">
            <Link to="/legal" data-testid="legal-cta" className="inline-flex items-center gap-2 border border-cc-border bg-cc-base px-6 py-3 hover:border-cc-accent hover:text-cc-accent transition-colors">
              Lire la politique <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-cc-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20 text-center">
          <Marker>Commencer</Marker>
          <h2 className="font-display text-5xl lg:text-7xl font-extrabold tracking-tighter uppercase mt-6 mb-10">
            Votre serveur.<br/>Vos <span className="text-cc-accent">règles.</span>
          </h2>
          <Link to="/auth?mode=register" data-testid="cta-register" className="inline-flex items-center gap-2 bg-cc-accent text-white font-bold tracking-wide uppercase px-10 py-5 cc-brutal-shadow cc-brutal-press">
            S'inscrire gratuitement <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="py-10 text-center text-xs text-cc-muted uppercase tracking-widest">
        CentCord © 2026 — Conçu chiffré, livré rapide. <Link to="/legal" className="text-cc-accent ml-2">Mentions légales</Link>
      </footer>
    </div>
  );
}
