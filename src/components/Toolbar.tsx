import { useEffect, useRef, useState } from "react";
import { ProfileAvatar } from "./ProfileAvatar";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranchPlus,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { Profile } from "../lib/api";

export type Op = "pull" | "push" | "stash" | "pop" | "fetch";

interface Props {
  repoName: string;
  branch: string | null;
  ahead: number;
  behind: number;
  stashes: number;
  busy: string | null;
  profiles: Profile[];
  profile: Profile | null;
  onOp: (op: Op) => void;
  onCreateBranch: () => void;
  onPickProfile: (id: string) => void;
  onManageProfiles: () => void;
}

function OpIcon({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return busy ? <LoaderCircle size={15} className="spin" aria-hidden /> : <>{children}</>;
}

export function Toolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const prof = p.profile;
  return (
    <div className="toolbar">
      <div className="crumbs">
        <div className="crumb">
          <small>Dépôt</small>
          <strong>{p.repoName}</strong>
        </div>
        <ChevronRight size={14} color="#5B6475" aria-hidden />
        <div className="crumb">
          <small>Branche</small>
          <span className="mono">{p.branch ?? "aucune"}</span>
        </div>
      </div>

      <div className="tool-group">
        <button className="btn" onClick={() => p.onOp("pull")} title="Récupérer et fusionner les commits distants">
          <OpIcon busy={p.busy === "pull"}><ArrowDown size={15} strokeWidth={1.8} aria-hidden /></OpIcon>
          Pull
          <span className={`count${p.behind ? " behind" : ""}`}>{p.behind}</span>
        </button>
        <button className="btn" onClick={() => p.onOp("push")} title="Envoyer tes commits">
          <OpIcon busy={p.busy === "push"}><ArrowUp size={15} strokeWidth={1.8} aria-hidden /></OpIcon>
          Push
          <span className={`count${p.ahead ? " ahead" : ""}`}>{p.ahead}</span>
        </button>
        <button className="btn icon" onClick={() => p.onOp("fetch")} aria-label="Fetch maintenant" title="Fetch maintenant. Il se fait aussi tout seul chaque minute et quand tu reviens sur la fenêtre.">
          <OpIcon busy={p.busy === "fetch"}><RefreshCw size={14} strokeWidth={1.8} aria-hidden /></OpIcon>
        </button>
        <div className="tool-sep" aria-hidden />
        <button className="btn" onClick={() => p.onOp("stash")} title="Mettre de côté les changements en cours">
          <OpIcon busy={p.busy === "stash"}><Archive size={15} strokeWidth={1.8} aria-hidden /></OpIcon>
          Stash
        </button>
        <button className="btn" onClick={() => p.onOp("pop")} title="Réappliquer le dernier stash">
          <OpIcon busy={p.busy === "pop"}><PackageOpen size={15} strokeWidth={1.8} aria-hidden /></OpIcon>
          Pop
          <span className="count">{p.stashes}</span>
        </button>
        <div className="tool-sep" aria-hidden />
        <button className="btn" onClick={p.onCreateBranch}>
          <GitBranchPlus size={15} strokeWidth={1.8} aria-hidden />
          Branche
        </button>
      </div>

      <div className="toolbar-end" ref={ref}>
        <button className="profile-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {prof ? (
            <ProfileAvatar profile={prof} />
          ) : (
            <span className="avatar" style={{ background: "#3A4150" }}>?</span>
          )}
          <span className="who">
            <span>{prof?.label ?? "Aucun profil"}</span>
            <small>{prof?.login || prof?.email || "config Git du dépôt"}</small>
          </span>
          <ChevronDown size={14} color="#8A92A3" aria-hidden />
        </button>
        {open && (
          <div className="menu anchored" role="menu">
            <div className="menu-label">Profil utilisé pour ce dépôt</div>
            {p.profiles.map((pr) => (
              <button
                key={pr.id}
                role="menuitemradio"
                aria-checked={pr.id === prof?.id}
                className="menu-item"
                onClick={() => {
                  p.onPickProfile(pr.id);
                  setOpen(false);
                }}
              >
                <ProfileAvatar profile={pr} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {pr.label}
                  {pr.login && ` · ${pr.login}`}
                  <span className="sub">{pr.email || "email non défini"}</span>
                </span>
                {pr.id === prof?.id && <Check size={16} color="#8B9CFF" aria-hidden />}
              </button>
            ))}
            {p.profiles.length === 0 && <div className="menu-label">Aucun profil pour l’instant.</div>}
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                p.onManageProfiles();
              }}
            >
              <Settings2 size={15} strokeWidth={1.8} aria-hidden />
              Gérer les profils
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
