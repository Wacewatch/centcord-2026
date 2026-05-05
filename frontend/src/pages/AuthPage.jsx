import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { formatApiError } from "../lib/api";
import { ArrowRight, Mail, Lock, User } from "lucide-react";

export default function AuthPage() {
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, register, googleLogin, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        toast.success("Connexion réussie");
      } else {
        await register(email.trim(), password, displayName.trim() || email.split("@")[0]);
        toast.success("Compte créé");
      }
      navigate("/app", { replace: true });
    } catch (e) {
      const msg = formatApiError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-cc-base text-cc-text">
      <div className="lg:col-span-5 flex flex-col px-8 lg:px-14 py-10">
        <Link to="/" data-testid="auth-back-home" className="flex items-center gap-3 group w-fit">
          <div className="w-7 h-7 bg-cc-accent flex items-center justify-center font-display font-extrabold text-white">C</div>
          <span className="font-display text-lg font-extrabold tracking-tighter group-hover:text-cc-accent transition-colors">CENTCORD</span>
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
          <span className="text-xs uppercase tracking-[0.3em] text-cc-muted font-bold">
            <span className="inline-block w-3 h-3 bg-cc-accent mr-3 align-middle" />
            {mode === "login" ? "Authentification" : "Création de compte"}
          </span>
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter uppercase mt-4 leading-[0.95]">
            {mode === "login" ? <>Heureux de<br/>vous revoir.</> : <>Faites-en<br/><span className="text-cc-accent">votre espace.</span></>}
          </h1>

          <form onSubmit={onSubmit} className="mt-10 space-y-6">
            {mode === "register" && (
              <div>
                <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Pseudonyme</label>
                <div className="flex items-center gap-3 border-b border-cc-border focus-within:border-cc-accent transition-colors mt-2">
                  <User className="w-4 h-4 text-cc-muted" />
                  <input data-testid="auth-input-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Vector" className="flex-1 bg-transparent py-3 outline-none placeholder:text-cc-muted" required />
                </div>
              </div>
            )}
            <div>
              <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">E-mail</label>
              <div className="flex items-center gap-3 border-b border-cc-border focus-within:border-cc-accent transition-colors mt-2">
                <Mail className="w-4 h-4 text-cc-muted" />
                <input data-testid="auth-input-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@centcord.app" className="flex-1 bg-transparent py-3 outline-none placeholder:text-cc-muted" required />
              </div>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Mot de passe</label>
              <div className="flex items-center gap-3 border-b border-cc-border focus-within:border-cc-accent transition-colors mt-2">
                <Lock className="w-4 h-4 text-cc-muted" />
                <input data-testid="auth-input-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="flex-1 bg-transparent py-3 outline-none placeholder:text-cc-muted font-jetbrains" minLength={8} required />
              </div>
              {mode === "register" && <p className="text-[10px] text-cc-muted mt-2 uppercase tracking-widest">Min. 8 caractères · stocké en bcrypt</p>}
            </div>

            {error && (
              <div data-testid="auth-error" className="text-cc-danger text-sm border-l-2 border-cc-danger pl-3">{error}</div>
            )}

            <button data-testid="auth-submit" disabled={loading} className="w-full bg-cc-accent text-white font-bold tracking-wide uppercase py-4 cc-brutal-shadow cc-brutal-press disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? <div className="cc-spinner" /> : <>{mode === "login" ? "Se connecter" : "Créer le compte"} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-cc-border" />
            <span className="text-[10px] tracking-[0.3em] uppercase text-cc-muted">ou</span>
            <div className="flex-1 h-px bg-cc-border" />
          </div>

          <button data-testid="auth-google" type="button" onClick={googleLogin} className="w-full border border-cc-border bg-cc-surface1 hover:bg-cc-surface2 font-bold uppercase tracking-wide py-4 transition-colors flex items-center justify-center gap-3">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1H12v3.2h5.35c-.23 1.27-.91 2.34-1.94 3.06v2.55h3.13c1.83-1.69 2.89-4.18 2.89-7.13 0-.65-.06-1.27-.18-1.68z"/><path d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.13-2.55c-.87.58-1.98.92-3.49.92-2.68 0-4.95-1.81-5.76-4.24H3.05v2.66A9.99 9.99 0 0 0 12 22z"/><path d="M6.24 13.7a5.94 5.94 0 0 1 0-3.4V7.65H3.05a10 10 0 0 0 0 8.7l3.19-2.65z"/><path d="M12 6.36c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.95 3.4 14.7 2.5 12 2.5a9.99 9.99 0 0 0-8.95 5.15l3.19 2.65C7.05 8.17 9.32 6.36 12 6.36z"/></svg>
            Continuer avec Google
          </button>

          <p className="text-center text-cc-subtext text-sm mt-8">
            {mode === "login" ? "Première fois ici ?" : "Déjà un compte ?"}{" "}
            <button data-testid="auth-toggle-mode" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="text-cc-accent font-bold uppercase tracking-wider">
              {mode === "login" ? "S'inscrire" : "Se connecter"}
            </button>
          </p>
          <p className="text-center text-[10px] uppercase tracking-widest text-cc-muted mt-4">
            En continuant, vous acceptez notre <Link to="/legal" className="text-cc-accent">politique anti-DMCA</Link>
          </p>
        </div>

        <div className="text-cc-muted text-[10px] tracking-widest uppercase mt-10">
          v2.0 · Chiffré · 2026
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="hidden lg:block lg:col-span-7 relative bg-cc-surface1 border-l border-cc-border overflow-hidden">
        <img alt="" src="https://static.prod-images.emergentagent.com/jobs/a5c2efcc-de7a-4769-b97b-5f02393024a7/images/93de6890741f329a6c03ab059fbad0b4325d61e957e4cae8da90ea78e9fd9274.png" className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity" />
        <div className="absolute inset-0 bg-gradient-to-tr from-cc-base via-transparent to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 max-w-lg">
          <span className="text-xs uppercase tracking-[0.3em] text-cc-muted font-bold">
            <span className="inline-block w-3 h-3 bg-cc-accent mr-3 align-middle" /> Au cœur du build
          </span>
          <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter uppercase mt-5 leading-[0.95]">
            Là où le signal<br/>rencontre la <span className="text-cc-accent">confidentialité.</span>
          </h2>
          <p className="text-cc-subtext mt-6">
            CentCord allie le plaisir des communautés et la rigueur cryptographique. Serveurs, vocal, fils, amis — défendus par défaut.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
