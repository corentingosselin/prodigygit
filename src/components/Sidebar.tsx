import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Archive,
  Check,
  ChevronDown,
  Cloud,
  Folder,
  GitBranch,
  GitBranchPlus,
  GitMerge,
  Laptop,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Branches, StashEntry } from "../lib/api";

export type BranchAction = "checkout" | "merge" | "create" | "delete";

interface Props {
  branches: Branches;
  current: string | null;
  stashes: StashEntry[];
  onAction: (action: BranchAction, branch: string, isRemote: boolean) => void;
  onCreate: () => void;
}

interface Node {
  folder: string | null;
  items: { full: string; label: string; ahead?: number; behind?: number; upstream?: string | null }[];
}

function group(names: { full: string; rel: string; ahead?: number; behind?: number; upstream?: string | null }[]): Node[] {
  const top: Node = { folder: null, items: [] };
  const folders = new Map<string, Node>();
  for (const n of names) {
    const i = n.rel.indexOf("/");
    if (i > 0) {
      const f = n.rel.slice(0, i);
      if (!folders.has(f)) folders.set(f, { folder: f, items: [] });
      folders.get(f)!.items.push({ ...n, label: n.rel.slice(i + 1) });
    } else {
      top.items.push({ ...n, label: n.rel });
    }
  }
  return [top, ...[...folders.values()].sort((a, b) => a.folder!.localeCompare(b.folder!))];
}

export function Sidebar({ branches, current, stashes, onAction, onCreate }: Props) {
  const [filter, setFilter] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; branch: string; remote: boolean } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const f = filter.trim().toLowerCase();
  const local = useMemo(
    () =>
      branches.local
        .filter((b) => b.name.toLowerCase().includes(f))
        .map((b) => ({ full: b.name, rel: b.name, ahead: b.ahead, behind: b.behind, upstream: b.upstream })),
    [branches.local, f],
  );
  const remotes = useMemo(() => {
    const byRemote = new Map<string, { full: string; rel: string }[]>();
    for (const b of branches.remote) {
      if (!b.name.toLowerCase().includes(f)) continue;
      const i = b.name.indexOf("/");
      const remote = i > 0 ? b.name.slice(0, i) : "remote";
      if (!byRemote.has(remote)) byRemote.set(remote, []);
      byRemote.get(remote)!.push({ full: b.name, rel: b.name.slice(i + 1) });
    }
    return [...byRemote.entries()];
  }, [branches.remote, f]);

  const renderNodes = (key: string, nodes: Node[], remote: boolean) =>
    nodes.map((node) => {
      const fk = `${key}/${node.folder}`;
      const isFolded = !!folded[fk] && !f;
      return (
        <div key={fk}>
          {node.folder && (
            <button
              className="row folder"
              aria-expanded={!isFolded}
              onClick={() => setFolded((s) => ({ ...s, [fk]: !s[fk] }))}
            >
              <ChevronDown size={12} strokeWidth={2.2} style={{ transform: isFolded ? "rotate(-90deg)" : undefined, transition: "transform 120ms" }} aria-hidden />
              <Folder size={14} strokeWidth={1.8} aria-hidden />
              <span className="name">{node.folder}</span>
              <span className="meta">{node.items.length}</span>
            </button>
          )}
          {!isFolded &&
            node.items.map((b) => {
              const isCur = !remote && b.full === current;
              return (
                <button
                  key={b.full}
                  title={b.full}
                  className={`row${isCur ? " current" : ""}${menu?.branch === b.full ? " menu-open" : ""}`}
                  style={{ paddingLeft: node.folder ? 30 : 10 }}
                  onDoubleClick={() => onAction("checkout", b.full, remote)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: Math.min(e.clientX, window.innerWidth - 270), y: Math.min(e.clientY, window.innerHeight - 200), branch: b.full, remote });
                  }}
                >
                  {isCur ? (
                    <Check size={14} strokeWidth={2.4} color="#8B9CFF" aria-hidden />
                  ) : (
                    <GitBranch size={14} strokeWidth={1.8} color="#6B7385" aria-hidden />
                  )}
                  <span className="name">{b.label}</span>
                  {!remote && b.upstream && (b.ahead || b.behind) ? (
                    <span className="ab">
                      {b.ahead ? <span>↑{b.ahead}</span> : null}
                      {b.behind ? <span>↓{b.behind}</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
        </div>
      );
    });

  const m = menu;
  const shortName = m ? m.branch.slice(m.branch.lastIndexOf("/") + 1) : "";
  const currentShort = current ? current.slice(current.lastIndexOf("/") + 1) : "";
  const isMine = m && (m.branch === current || (m.remote && current && m.branch.endsWith(`/${current}`)));

  return (
    <aside className="sidebar" aria-label="Branches">
      <label className="search">
        <Search size={14} strokeWidth={2} aria-hidden />
        <input
          aria-label="Filtrer les branches"
          placeholder="Filtrer les branches"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setFilter("")}
        />
      </label>
      <div className="side-scroll">
        <div className="side-head">
          <Laptop size={14} strokeWidth={1.8} aria-hidden />
          <span className="grow">Local</span>
          <span className="num">{local.length}</span>
          <button className="mini" aria-label="Créer une branche" onClick={onCreate}>
            <Plus size={12} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        {renderNodes("local", group(local), false)}
        {local.length === 0 && <div className="empty-note">Aucune branche{f ? " ne correspond" : ""}</div>}

        {remotes.map(([remote, list]) => (
          <div key={remote}>
            <div className="side-head">
              <Cloud size={14} strokeWidth={1.8} aria-hidden />
              <span className="grow">Remote · {remote}</span>
              <span className="num">{list.length}</span>
            </div>
            {renderNodes(remote, group(list), true)}
          </div>
        ))}

        <div className="side-head">
          <Archive size={14} strokeWidth={1.8} aria-hidden />
          <span className="grow">Stashes</span>
          <span className="num">{stashes.length}</span>
        </div>
        {stashes.map((s) => (
          <div key={s.index} className="stash-row" title={s.message}>
            <span className="mono">{`stash@{${s.index}}`}</span>
            <span>{s.message}</span>
          </div>
        ))}
      </div>

      {m && (
        <div className="menu" role="menu" style={{ left: m.x, top: m.y }} onClick={(e) => e.stopPropagation()}>
          {!isMine && current && (
            <button className="menu-item" role="menuitem" onClick={() => { setMenu(null); onAction("merge", m.branch, m.remote); }}>
              <GitMerge size={15} strokeWidth={1.8} aria-hidden />
              Merger {shortName} dans {currentShort}
            </button>
          )}
          {m.branch !== current && (
            <button className="menu-item" role="menuitem" onClick={() => { setMenu(null); onAction("checkout", m.branch, m.remote); }}>
              <ArrowRight size={15} strokeWidth={1.8} aria-hidden />
              Checkout
            </button>
          )}
          <button className="menu-item" role="menuitem" onClick={() => { setMenu(null); onAction("create", m.branch, m.remote); }}>
            <GitBranchPlus size={15} strokeWidth={1.8} aria-hidden />
            Nouvelle branche depuis {shortName}
          </button>
          {!m.remote && m.branch !== current && (
            <>
              <div className="menu-sep" />
              <button className="menu-item danger" role="menuitem" onClick={() => { setMenu(null); onAction("delete", m.branch, m.remote); }}>
                <Trash2 size={15} strokeWidth={1.8} aria-hidden />
                Supprimer la branche
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
