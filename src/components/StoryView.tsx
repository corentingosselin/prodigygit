import { useMemo, useState } from "react";
import { ArrowDown, ChevronDown, Pencil } from "lucide-react";
import type { Branches, CommitInfo, History, StatusInfo } from "../lib/api";
import { avatarColor, initials, lastSegment, relativeTime } from "../lib/format";
import { Emoji, GITMOJIS } from "./GitmojiPicker";

interface Props {
  history: History;
  branches: Branches;
  status: StatusInfo;
  selectedSha: string | null;
  onSelectCommit: (sha: string | null) => void;
  /** Branch shown without checkout, or null for the current one. */
  viewing: string | null;
  onCompare: () => void;
  /** The Récit / Comparer switch, rendered in the header. */
  toggle: React.ReactNode;
}

// ------------------------------------------------------------ title parsing

const EMOJI_RE = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}))*️?)\s*/u;
const CODE_RE = /^:([a-z0-9_+-]+):\s*/;
const TICKET_RE = /^([A-Za-z][A-Za-z0-9]*-\d+)\b[:\s]*/;
const BY_CODE = new Map(GITMOJIS.map((g) => [g.code, g.emoji]));

/** Splits "🐛 LOY-463 Fix the crash" (or ":bug: LOY-463 …") into its parts. */
export function parseTitle(summary: string): { emoji: string | null; ticket: string | null; text: string } {
  let rest = summary.trim();
  let emoji: string | null = null;
  const e = rest.match(EMOJI_RE);
  if (e) {
    emoji = e[1];
    rest = rest.slice(e[0].length);
  } else {
    const c = rest.match(CODE_RE);
    if (c && BY_CODE.has(c[1])) {
      emoji = BY_CODE.get(c[1])!;
      rest = rest.slice(c[0].length);
    }
  }
  let ticket: string | null = null;
  const t = rest.match(TICKET_RE);
  if (t) {
    ticket = t[1].toUpperCase();
    rest = rest.slice(t[0].length);
  }
  return { emoji, ticket, text: rest || summary };
}

// ------------------------------------------------------------ days

const dayKey = (s: number) => {
  const d = new Date(s * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function dayLabel(s: number): string {
  const d = new Date(s * 1000);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    weekday: diff < 7 ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function byDay(list: CommitInfo[]): { key: string; label: string; commits: CommitInfo[] }[] {
  const out: { key: string; label: string; commits: CommitInfo[] }[] = [];
  for (const c of list) {
    const k = dayKey(c.time);
    const last = out[out.length - 1];
    if (last && last.key === k) last.commits.push(c);
    else out.push({ key: k, label: dayLabel(c.time), commits: [c] });
  }
  return out;
}

// ------------------------------------------------------------ pieces

/** Size of a commit: green and red split, length growing with the number of lines (log scale). */
function StatBar({ stats }: { stats: [number, number] | null }) {
  if (!stats) return <span className="statbar empty" aria-hidden />;
  const [a, d] = stats;
  const total = a + d;
  if (!total) return <span className="statbar empty" title="Aucune ligne modifiée" />;
  const width = Math.round(18 + Math.min(1, Math.log10(total + 1) / 3) * 46);
  return (
    <span className="statbar" style={{ width }} title={`+${a} −${d}`}>
      <span className="add" style={{ flex: a }} />
      <span className="del" style={{ flex: d }} />
    </span>
  );
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function StoryView({ history, branches, status, selectedSha, onSelectCommit, viewing, onCompare, toggle }: Props) {
  const [showOlder, setShowOlder] = useState(25);
  const hasBase = !!history.base;
  const changes = viewing ? 0 : status.unstaged.length + status.staged.length;
  const unpushed = useMemo(() => new Set(history.unpushed), [history.unpushed]);

  // Branch names pointing at each commit, current branch excluded (it is the header).
  const labels = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (sha: string | null, name: string) => {
      if (!sha || name === history.head || name === history.upstream) return;
      if (!map.has(sha)) map.set(sha, []);
      map.get(sha)!.push(name);
    };
    for (const b of branches.local) add(b.tip, b.name);
    for (const b of branches.remote) add(b.tip, b.name);
    return map;
  }, [branches, history.head, history.upstream]);

  // Own commits: the branch's work; without a base (develop, main) the whole history is "own".
  const own = hasBase ? history.mine : history.shared;
  const older = hasBase ? history.shared : [];
  const fork = older[0] ?? null;
  const totals = own.reduce((t, c) => (c.stats ? [t[0] + c.stats[0], t[1] + c.stats[1]] : t), [0, 0]);
  const statsComplete = own.length > 0 && own.every((c) => c.stats);
  const ownDays = byDay(own);
  // Keep titles aligned when only some commits start with a gitmoji.
  const reserveEmoji = own.some((c) => parseTitle(c.summary).emoji);
  const olderDays = byDay(older.slice(fork ? 1 : 0, showOlder));
  const headName = history.head ?? "HEAD détachée";

  const pushChip = (() => {
    if (viewing && !branches.local.some((b) => b.name === viewing)) return null;
    if (history.unpublished) return <span className="chip-s amber">Pas encore sur GitHub</span>;
    if (history.unpushed.length)
      return (
        <span className="chip-s accent">
          {history.unpushed.length} à pousser
        </span>
      );
    if (history.upstream) return <span className="chip-s muted">À jour avec {history.upstream.split("/")[0]}</span>;
    return null;
  })();

  const commitRow = (c: CommitInfo, dim = false) => {
    const t = parseTitle(c.summary);
    const isUnpushed = unpushed.has(c.sha) || (history.unpublished && !dim);
    const tags = labels.get(c.sha) ?? [];
    return (
      <div
        key={c.sha}
        role="listitem"
        className={`story-commit${dim ? " dim" : ""}${selectedSha === c.sha ? " selected" : ""}`}
        onClick={() => onSelectCommit(c.sha)}
      >
        <span className={`story-node${isUnpushed ? " unpushed" : ""}${dim ? " base" : ""}`} aria-hidden />
        <div className="story-body">
          <div className="story-title">
            {(t.emoji || (!dim && reserveEmoji)) && (
              <span className="story-emoji">{t.emoji && <Emoji value={t.emoji} size={dim ? 15 : 17} />}</span>
            )}
            {t.ticket && <span className="ticket mono">{t.ticket}</span>}
            <span className="text" title={c.summary}>{t.text}</span>
          </div>
          <div className="story-meta">
            <span className="avatar xs" style={{ background: avatarColor(c.author) }} aria-hidden>
              {initials(c.author)}
            </span>
            <span title={c.author}>{firstName(c.author)}</span>
            <span className="sep">·</span>
            <span title={new Date(c.time * 1000).toLocaleString("fr-FR")}>{relativeTime(c.time)}</span>
            <span className="sep">·</span>
            <span className="mono sha">{c.short}</span>
            {isUnpushed && <span className="chip-s accent">{history.unpublished ? "local" : "à pousser"}</span>}
            {tags.slice(0, 2).map((n) => (
              <span key={n} className="chip-s branch mono" title={n}>{lastSegment(n)}</span>
            ))}
            {tags.length > 2 && <span className="chip-s muted" title={tags.slice(2).join("\n")}>+{tags.length - 2}</span>}
            <span className="grow" />
            {!dim && c.stats && (
              <span className="story-lines tabular">
                <span className="add">+{c.stats[0]}</span>
                <span className="del">−{c.stats[1]}</span>
              </span>
            )}
            {!dim && <StatBar stats={c.stats} />}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="story">
      <header className="story-hero">
        <div className="hero-top">
          <span className="eyebrow">
            {viewing ? "Branche affichée" : "Ta branche"}
            {hasBase && <> · comparée à {history.base}</>}
          </span>
          {toggle}
        </div>
        <h1 className="mono" title={headName}>
          {headName.includes("/") && <span className="folder">{headName.slice(0, headName.lastIndexOf("/") + 1)}</span>}
          {lastSegment(headName)}
        </h1>
        <div className="hero-chips">
          {hasBase && (
            <span className="chip-s accent">
              {own.length} commit{own.length > 1 ? "s" : ""} {viewing ? "sur la branche" : "à toi"}
            </span>
          )}
          {hasBase && history.theirs.length > 0 && <span className="chip-s amber">{history.theirs.length} à récupérer</span>}
          {own.length > 0 && totals[0] + totals[1] > 0 && (
            <span className="chip-s lines tabular" title={statsComplete ? undefined : "Sur les commits les plus récents"}>
              <span className="add">+{totals[0]}</span> <span className="del">−{totals[1]}</span>
            </span>
          )}
          {pushChip}
        </div>
      </header>

      <div className="story-scroll" role="list">
        {changes > 0 && (
          <div
            role="listitem"
            className={`story-wip${!selectedSha ? " selected" : ""}`}
            onClick={() => onSelectCommit(null)}
          >
            <span className="story-node wip" aria-hidden />
            <Pencil size={14} strokeWidth={1.8} aria-hidden />
            <span className="grow">Changements en cours</span>
            {status.unstaged.length > 0 && <span className="chip-s amber">{status.unstaged.length} non stagé{status.unstaged.length > 1 ? "s" : ""}</span>}
            {status.staged.length > 0 && <span className="chip-s green">{status.staged.length} stagé{status.staged.length > 1 ? "s" : ""}</span>}
          </div>
        )}

        {hasBase && history.theirs.length > 0 && (
          <div className="story-callout">
            <ArrowDown size={15} strokeWidth={2} aria-hidden />
            <span className="grow">
              <b>{history.base}</b> a avancé de {history.theirs.length} commit{history.theirs.length > 1 ? "s" : ""} depuis le départ de ta branche
            </span>
            <button className="btn sm" onClick={onCompare}>Voir</button>
          </div>
        )}

        {own.length === 0 && (
          <div className="story-empty">
            {hasBase ? `Aucun commit sur cette branche par rapport à ${history.base} pour l’instant.` : "Aucun commit pour l’instant."}
          </div>
        )}

        <div className="story-rail mine">
          {ownDays.map((d) => (
            <section key={d.key} className="story-day">
              <h2>{d.label}</h2>
              {d.commits.map((c) => commitRow(c))}
            </section>
          ))}
        </div>

        {fork && (
          <>
            <div
              className={`story-fork${selectedSha === fork.sha ? " selected" : ""}`}
              onClick={() => onSelectCommit(fork.sha)}
              role="listitem"
            >
              <span className="story-node fork" aria-hidden />
              <span className="grow">
                Ta branche part d’ici · <span className="t" title={fork.summary}>{parseTitle(fork.summary).text}</span>
              </span>
              <span className="when">{relativeTime(fork.time)}</span>
            </div>
            {olderDays.length > 0 && (
              <div className="story-rail base">
                <div className="story-older-head">Avant ta branche, sur {history.base}</div>
                {olderDays.map((d) => (
                  <section key={d.key} className="story-day">
                    <h2>{d.label}</h2>
                    {d.commits.map((c) => commitRow(c, true))}
                  </section>
                ))}
                {older.length > showOlder && (
                  <button className="btn sm ghost story-more" onClick={() => setShowOlder((n) => n + 50)}>
                    <ChevronDown size={14} strokeWidth={2} aria-hidden />
                    Afficher plus
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
