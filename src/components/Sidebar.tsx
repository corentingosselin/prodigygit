import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
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
import type { Branches } from "../lib/api";

export type BranchAction = "checkout" | "merge" | "create" | "delete";

interface Props {
  branches: Branches;
  current: string | null;
  onAction: (action: BranchAction, branch: string, isRemote: boolean) => void;
  /** Deletes the selected local branches (after confirmation). */
  onDeleteMany: (branches: string[]) => void;
  /** Shows a branch's history without checking it out (null: back to the current branch). */
  onView: (branch: string | null) => void;
  viewing: string | null;
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

const SECTIONS_KEY = "prodigygit.sidebar.sections";

function SectionHead({
  icon,
  label,
  count,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="side-head">
      <button className="side-toggle" aria-expanded={open} onClick={onToggle}>
        <ChevronDown
          size={12}
          strokeWidth={2.2}
          style={{ transform: open ? undefined : "rotate(-90deg)", transition: "transform 120ms" }}
          aria-hidden
        />
        {icon}
        <span className="grow">{label}</span>
        <span className="num">{count}</span>
      </button>
      {children}
    </div>
  );
}

export function Sidebar({ branches, current, onAction, onDeleteMany, onView, viewing, onCreate }: Props) {
  const [filter, setFilter] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [closed, setClosed] = useState<Record<string, boolean>>(() => {
    try {
      const saved: Record<string, boolean> = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}");
      return Object.fromEntries(Object.entries(saved).filter(([key]) => !key.startsWith("remote:")));
    } catch {
      return {};
    }
  });
  // Remote sections start collapsed every time the app opens; only Local is remembered.
  const closedState = (s: Record<string, boolean>, k: string) => s[k] ?? k.startsWith("remote:");
  const toggleSection = (k: string) =>
    setClosed((s) => {
      const next = { ...s, [k]: !closedState(s, k) };
      try {
        const kept = Object.fromEntries(Object.entries(next).filter(([key]) => !key.startsWith("remote:")));
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(kept));
      } catch {
        /* storage unavailable: state stays in memory */
      }
      return next;
    });
  // While filtering, every section stays open so matches are never hidden.
  const isClosed = (k: string) => closedState(closed, k) && !f;
  const [menu, setMenu] = useState<{ x: number; y: number; branch: string; remote: boolean } | null>(null);
  // Multi-selection, local branches only. `anchor` is where a Shift-click range starts.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  // Drop branches that no longer exist (deleted, renamed).
  useEffect(() => {
    const names = new Set(branches.local.map((b) => b.name));
    setSelected((s) => {
      const next = new Set([...s].filter((n) => names.has(n)));
      return next.size === s.size ? s : next;
    });
  }, [branches.local]);

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
  // Local branches in the order they are shown, for Shift-click ranges.
  const localOrder = useMemo(() => {
    if (closed.local && !f) return [];
    return group(local).flatMap((node) =>
      !!folded[`local/${node.folder}`] && !f ? node.items.filter((b) => b.full === current).map((b) => b.full) : node.items.map((b) => b.full),
    );
  }, [local, folded, closed, f, current]);

  const clickLocal = (e: React.MouseEvent, name: string) => {
    if (e.shiftKey && anchor) {
      const a = localOrder.indexOf(anchor);
      const b = localOrder.indexOf(name);
      if (a >= 0 && b >= 0) {
        const range = localOrder.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelected((s) => new Set(e.metaKey || e.ctrlKey ? [...s, ...range] : range));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    } else {
      setSelected(new Set([name]));
      onView(name === current ? null : name);
    }
    setAnchor(name);
  };

  const deletable = [...selected].filter((n) => n !== current);

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
      const hasCurrent = !remote && node.items.some((b) => b.full === current);
      // A folded folder still shows the branch you are on, so it is never hidden.
      const items = isFolded ? node.items.filter((b) => !remote && b.full === current) : node.items;
      return (
        <div key={fk}>
          {node.folder && (
            <button
              className={`row folder${hasCurrent ? " has-current" : ""}`}
              aria-expanded={!isFolded}
              onClick={() => setFolded((s) => ({ ...s, [fk]: !s[fk] }))}
            >
              <ChevronDown size={12} strokeWidth={2.2} style={{ transform: isFolded ? "rotate(-90deg)" : undefined, transition: "transform 120ms" }} aria-hidden />
              <Folder size={14} strokeWidth={1.8} aria-hidden />
              <span className="name">{node.folder}</span>
              <span className="meta">{node.items.length}</span>
            </button>
          )}
          {items.map((b) => {
              const isCur = !remote && b.full === current;
              const isSel = !remote && selected.has(b.full);
              return (
                <button
                  key={b.full}
                  title={b.full}
                  className={`row${isCur ? " current" : ""}${isSel || (remote && viewing === b.full) ? " selected" : ""}${viewing === b.full ? " viewing" : ""}${menu?.branch === b.full ? " menu-open" : ""}`}
                  aria-selected={remote ? undefined : isSel}
                  style={{ paddingLeft: node.folder ? 30 : 10 }}
                  onClick={(e) => {
                    if (!remote) return clickLocal(e, b.full);
                    setSelected(new Set());
                    onView(b.full);
                  }}
                  onDoubleClick={() => onAction("checkout", b.full, remote)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // Right-click outside the selection selects that branch alone.
                    if (remote) setSelected(new Set());
                    else if (!selected.has(b.full)) {
                      setSelected(new Set([b.full]));
                      setAnchor(b.full);
                    }
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
    <aside
      className="sidebar"
      aria-label="Branches"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if ((e.key === "Delete" || e.key === "Backspace") && deletable.length) {
          e.preventDefault();
          onDeleteMany(deletable);
        }
        if (e.key === "Escape") setSelected(new Set());
        if ((e.metaKey || e.ctrlKey) && e.key === "a" && localOrder.length) {
          e.preventDefault();
          setSelected(new Set(localOrder));
        }
      }}
    >
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
        <SectionHead
          icon={<Laptop size={14} strokeWidth={1.8} aria-hidden />}
          label="Local"
          count={local.length}
          open={!isClosed("local")}
          onToggle={() => toggleSection("local")}
        >
          <button className="mini" aria-label="Créer une branche" onClick={onCreate}>
            <Plus size={12} strokeWidth={2.4} aria-hidden />
          </button>
        </SectionHead>
        {isClosed("local") ? (
          // Collapsed: keep only the branch you are on, with its full name.
          renderNodes("local-closed", [{ folder: null, items: local.filter((b) => b.full === current).map((b) => ({ ...b, label: b.rel })) }], false)
        ) : (
          <>
            {renderNodes("local", group(local), false)}
            {local.length === 0 && <div className="empty-note">Aucune branche{f ? " ne correspond" : ""}</div>}
          </>
        )}

        {remotes.map(([remote, list]) => (
          <div key={remote}>
            <SectionHead
              icon={<Cloud size={14} strokeWidth={1.8} aria-hidden />}
              label={`Remote · ${remote}`}
              count={list.length}
              open={!isClosed(`remote:${remote}`)}
              onToggle={() => toggleSection(`remote:${remote}`)}
            />
            {!isClosed(`remote:${remote}`) && renderNodes(remote, group(list), true)}
          </div>
        ))}
      </div>

      {m && !m.remote && selected.size > 1 && selected.has(m.branch) ? (
        <div className="menu" role="menu" style={{ left: m.x, top: m.y }} onClick={(e) => e.stopPropagation()}>
          <div className="menu-label">{selected.size} branches sélectionnées</div>
          <button
            className="menu-item danger"
            role="menuitem"
            disabled={!deletable.length}
            onClick={() => {
              setMenu(null);
              onDeleteMany(deletable);
            }}
          >
            <Trash2 size={15} strokeWidth={1.8} aria-hidden />
            <span style={{ flex: 1 }}>
              Supprimer {deletable.length} branche{deletable.length > 1 ? "s" : ""}
              {deletable.length < selected.size && <span className="sub">sauf la branche courante</span>}
            </span>
          </button>
        </div>
      ) : m && (
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
