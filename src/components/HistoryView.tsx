import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GitMerge } from "lucide-react";
import type { Branches, CommitInfo, History, StatusInfo } from "../lib/api";
import { avatarColor, initials, lastSegment, relativeTime } from "../lib/format";

interface Props {
  history: History;
  branches: Branches;
  status: StatusInfo;
  onMergeBase: (base: string) => void;
}

type Lane = "a" | "b";
interface Row {
  key: string;
  wip?: boolean;
  commit?: CommitInfo;
  lane: Lane;
  fork?: boolean;
}

export function HistoryView({ history, branches, status, onMergeBase }: Props) {
  const [view, setView] = useState<"focus" | "compare">("focus");
  const [selected, setSelected] = useState<string | null>(null);
  const hasBase = !!history.base;
  const changes = status.unstaged.length + status.staged.length;

  const labels = useMemo(() => {
    const map = new Map<string, { text: string; kind: "current" | "local" | "remote" }[]>();
    const add = (sha: string | null, text: string, kind: "current" | "local" | "remote") => {
      if (!sha) return;
      if (!map.has(sha)) map.set(sha, []);
      map.get(sha)!.push({ text, kind });
    };
    for (const b of branches.local) add(b.tip, b.name, b.isHead ? "current" : "local");
    for (const b of branches.remote) add(b.tip, b.name, "remote");
    return map;
  }, [branches]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (changes) out.push({ key: "wip", wip: true, lane: "a" });
    if (!hasBase) {
      history.shared.forEach((c) => out.push({ key: c.sha, commit: c, lane: "a" }));
      return out;
    }
    const recent = [
      ...history.mine.map((c) => ({ c, lane: "a" as Lane })),
      ...history.theirs.map((c) => ({ c, lane: "b" as Lane })),
    ].sort((x, y) => y.c.time - x.c.time);
    recent.forEach(({ c, lane }) => out.push({ key: c.sha, commit: c, lane }));
    history.shared.forEach((c, i) => out.push({ key: c.sha, commit: c, lane: "b", fork: i === 0 }));
    return out;
  }, [history, hasBase, changes]);

  // Lane extents: A runs from the top row to the fork, B from the first base row to the end.
  const forkIndex = hasBase ? rows.findIndex((r) => r.fork) : rows.length - 1;
  const firstB = rows.findIndex((r) => r.lane === "b");
  const lastIndex = rows.length - 1;
  const aEnd = hasBase ? (forkIndex >= 0 ? forkIndex : lastIndex) : lastIndex;
  const singleLane = !hasBase;

  return (
    <>
      <div className="view-bar">
        {hasBase ? (
          <div className="segmented" role="group" aria-label="Mode d'historique">
            <button aria-pressed={view === "focus"} onClick={() => setView("focus")}>Focalisé</button>
            <button aria-pressed={view === "compare"} onClick={() => setView("compare")}>
              Ma branche vs {history.base}
            </button>
          </div>
        ) : (
          <strong style={{ fontWeight: 600 }}>Historique</strong>
        )}
        {hasBase && view === "focus" && (
          <span className="view-note">
            {history.head} comparée à {history.base}
          </span>
        )}
      </div>

      {view === "focus" || !hasBase ? (
        rows.length === 0 ? (
          <div className="placeholder">
            <strong>Aucun commit pour l’instant</strong>
            Stage des fichiers et fais ton premier commit.
          </div>
        ) : (
          <div className="commits" role="list">
            {rows.map((r, i) => {
              const aOn = i <= aEnd;
              const bOn = !singleLane && firstB >= 0 && i >= firstB;
              const c = r.commit;
              const tags = c ? labels.get(c.sha) ?? [] : [];
              return (
                <div
                  key={r.key}
                  role="listitem"
                  className={`commit${c && selected === c.sha ? " selected" : ""}`}
                  onClick={() => c && setSelected(c.sha)}
                >
                  <div className="lanes" aria-hidden>
                    {aOn && (
                      <div className="lane a" style={{ top: i === 0 ? 22 : 0, bottom: i === aEnd ? 22 : 0 }} />
                    )}
                    {bOn && <div className="lane b" style={{ top: i === firstB ? 22 : 0, bottom: 0 }} />}
                    {r.fork && <div className="lane conn" />}
                    <div className={`node ${r.wip ? "wip" : singleLane ? "a" : r.lane}`} />
                  </div>
                  {r.wip ? (
                    <>
                      <span className="wip-label">Changements en cours</span>
                      {status.unstaged.length > 0 && <span className="pill amber">{status.unstaged.length} non stagés</span>}
                      {status.staged.length > 0 && <span className="pill green">{status.staged.length} stagés</span>}
                    </>
                  ) : (
                    c && (
                      <>
                        {tags.slice(0, 3).map((t) => (
                          <span key={t.text} className={`tag ${t.kind}`}>{t.kind === "current" ? lastSegment(t.text) : t.text}</span>
                        ))}
                        <span className={`msg${r.lane === "b" && !singleLane ? " dim" : ""}`} title={c.summary}>{c.summary}</span>
                        <span className="avatar sm" style={{ background: avatarColor(c.author) }} title={c.author}>
                          {initials(c.author)}
                        </span>
                        <span className="when">{relativeTime(c.time)}</span>
                        <span className="sha mono">{c.short}</span>
                      </>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="compare">
          <section>
            <div className="compare-head">
              <span className="badge-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <ArrowUp size={14} strokeWidth={2} aria-hidden />
              </span>
              <h2>
                {history.mine.length} commit{history.mine.length > 1 ? "s" : ""} à toi, pas encore dans {history.base}
              </h2>
            </div>
            <CommitList commits={history.mine} empty={`Rien de nouveau par rapport à ${history.base}.`} dot="var(--accent)" />
          </section>
          <section>
            <div className="compare-head">
              <span className="badge-icon" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
                <ArrowDown size={14} strokeWidth={2} aria-hidden />
              </span>
              <h2>
                {history.theirs.length} commit{history.theirs.length > 1 ? "s" : ""} de {history.base} qui te manquent
              </h2>
              {history.theirs.length > 0 && (
                <button className="btn primary sm" onClick={() => onMergeBase(history.base!)}>
                  <GitMerge size={14} strokeWidth={2} aria-hidden />
                  Merger {history.base} ici
                </button>
              )}
            </div>
            <CommitList commits={history.theirs} empty="Ta branche est à jour." dot="var(--dot-base)" />
          </section>
        </div>
      )}
    </>
  );
}

function CommitList({ commits, empty, dot }: { commits: CommitInfo[]; empty: string; dot: string }) {
  if (!commits.length) return <div className="empty-note">{empty}</div>;
  return (
    <div className="list-box">
      {commits.map((c) => (
        <div key={c.sha} className="list-row">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
          <span className="msg" title={c.summary}>{c.summary}</span>
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>{relativeTime(c.time)}</span>
          <span className="mono" style={{ color: "var(--text-4)", fontSize: 11.5 }}>{c.short}</span>
        </div>
      ))}
    </div>
  );
}
