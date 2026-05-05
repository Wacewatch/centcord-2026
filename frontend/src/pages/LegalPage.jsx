import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { ArrowLeft, Shield, FileText } from "lucide-react";

export default function LegalPage() {
  const [policy, setPolicy] = useState(null);
  useEffect(() => {
    api.get("/legal/policy").then(r => setPolicy(r.data)).catch(() => {});
  }, []);
  return (
    <div className="min-h-screen bg-cc-base text-cc-text">
      <header className="border-b border-cc-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" data-testid="legal-back" className="flex items-center gap-2 group">
            <ArrowLeft className="w-4 h-4 group-hover:text-cc-accent" />
            <span className="font-display font-extrabold tracking-tighter">CENTCORD</span>
          </Link>
          <Link to="/auth" className="text-xs uppercase tracking-widest font-bold text-cc-subtext hover:text-cc-text">Connexion</Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-16">
        <span className="text-xs uppercase tracking-[0.3em] font-bold text-cc-muted">
          <span className="inline-block w-3 h-3 bg-cc-accent mr-3 align-middle" /> Politique de la plateforme · v{policy?.policy_version || "—"}
        </span>
        <h1 className="font-display text-5xl lg:text-6xl font-extrabold uppercase tracking-tighter mt-4 leading-[0.95]">
          Votre communauté,<br/><span className="text-cc-accent">protégée.</span>
        </h1>

        <div className="mt-12 border border-cc-border bg-cc-surface1 p-7 cc-brutal-shadow">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-cc-accent" />
            <h2 className="font-display font-extrabold text-2xl uppercase tracking-tighter">Politique anti-DMCA</h2>
          </div>
          <p className="text-cc-subtext leading-relaxed">
            Aucun serveur n'est supprimé sauf en cas d'activité illégale confirmée par la plateforme. CentCord n'honore pas les demandes de retrait DMCA standard non couvertes par le droit français/UE applicable. Les contenus signalés sont examinés par notre équipe avant toute action. Les propriétaires de serveur peuvent archiver leur communauté, jamais la voir disparaître arbitrairement.
          </p>
        </div>

        <div className="mt-8 grid md:grid-cols-2 gap-px bg-cc-border">
          {(policy?.highlights || []).map((h, i) => (
            <div key={i} className="bg-cc-surface1 p-6 flex items-start gap-3">
              <span className="w-2 h-2 bg-cc-accent mt-2 shrink-0" />
              <p className="text-sm text-cc-text leading-relaxed">{h}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 border-l-2 border-cc-accent pl-5">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight">Vous voulez signaler un contenu ?</h3>
          <p className="text-cc-subtext text-sm mt-2">
            Connectez-vous, ouvrez les paramètres du serveur ou du message concerné, puis utilisez le bouton « Signaler ». Notre équipe examine chaque rapport et agit si l'activité est illégale.
          </p>
        </div>

        <div className="mt-12 border border-cc-border p-6 bg-cc-surface1">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-cc-accent" />
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">Données et chiffrement</h3>
          </div>
          <ul className="space-y-2 text-sm text-cc-subtext">
            <li>• Vos messages privés sont chiffrés bout-en-bout (ECDH P-256 + AES-GCM). Le serveur ne les lit jamais.</li>
            <li>• Les mots de passe sont hashés avec bcrypt (coût 12).</li>
            <li>• Les sessions JWT sont en cookies httpOnly avec rotation.</li>
            <li>• Pour exercer vos droits RGPD, écrivez à <span className="text-cc-accent">admin@centcord.app</span>.</li>
          </ul>
        </div>

        <div className="mt-16 text-center">
          <Link to="/auth?mode=register" className="inline-flex items-center gap-2 bg-cc-accent text-white font-bold tracking-wide uppercase px-8 py-4 cc-brutal-shadow cc-brutal-press">
            Rejoindre CentCord
          </Link>
        </div>
      </main>
      <footer className="py-10 text-center text-xs text-cc-muted uppercase tracking-widest border-t border-cc-border mt-16">
        CentCord © 2026
      </footer>
    </div>
  );
}
