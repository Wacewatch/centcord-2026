import React from "react";
import BookmarksPanel from "../components/BookmarksPanel";
import UserBar from "../components/UserBar";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark } from "lucide-react";

export default function BookmarksPage() {
  const navigate = useNavigate();
  return (
    <>
      <aside className="w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0">
        <button onClick={() => navigate("/app/me")} className="px-4 h-12 border-b border-cc-border flex items-center gap-2 hover:bg-cc-surface2">
          <ArrowLeft className="w-4 h-4" /> <span className="font-display font-extrabold uppercase text-sm">Retour</span>
        </button>
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-cc-muted font-bold">Personnel</div>
        <button className="w-full flex items-center gap-3 px-4 py-2 bg-cc-surface2">
          <Bookmark className="w-4 h-4" /> <span className="text-sm font-bold">Sauvegardés</span>
        </button>
        <div className="mt-auto"><UserBar /></div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-cc-surface2 p-10">
        <div className="max-w-3xl"><BookmarksPanel /></div>
      </main>
    </>
  );
}
