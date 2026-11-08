import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Undo2 } from "lucide-react";
import type { Branches, CommitInfo, History, StatusInfo } from "../lib/api";
import { relativeTime } from "../lib/format";
import { StoryView } from "./StoryView";

const VIEW_KEY = "prodigygit.historyView";
type View = "story" | "compare";

interface Props {
  history: History;
  branches: Branches;
  status: StatusInfo;
  selectedSha: string | null;
  onSelectCommit: (sha: string | null) => void;
  /** Branch shown instead of the current one, or null. */
  viewing: string | null;
  current: string | null;
  onExitView: () => void;
}

export function HistoryView({ history, branches, status, selectedSha: selected, onSelectCommit, viewing, current, onExitView }: Props) {
  // The chosen view is remembered between launches.
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === "compare" ? v : "story";
    } catch {
      return "story";
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* in memory only */
    }
  };
  const hasBase = !!history.base;

  const toggle = hasBase ? (
    <div className="segmented" role="group" aria-label="Mode d'historique">
      <button aria-pressed={view === "story"} onClick={() => setView("story")}>Récit</button>
      <button aria-pressed={view === "compare"} onClick={() => setView("compare")}>Comparer</button>
    </div>
  ) : null;

  return (
    <>
      {viewing && (
        <div className="view-banner">
          <Eye size={15} strokeWidth={1.8} aria-hidden />
          <span className="grow">
            Historique de <b>{viewing}</b>, sans checkout
          </span>
          <button className="btn sm" onClick={onExitView} title={current ? `Revenir à ${current}` : undefined}>
            <Undo2 size={14} strokeWidth={1.8} aria-hidden />
            Revenir à ma branche
          </button>
        </div>
      )}
      {view === "story" || !hasBase ? (
        <StoryView
          history={history}
          branches={branches}
          status={status}
          selectedSha={selected}
          onSelectCommit={onSelectCommit}
          viewing={viewing}
          onCompare={() => setView("compare")}
          toggle={toggle}
        />
      ) : (
        <>
          <div className="view-bar">
            {toggle}
            <span className="view-note">
              {history.head} comparée à {history.base}
            </span>
          </div>
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
            <CommitList commits={history.mine} empty={`Rien de nouveau par rapport à ${history.base}.`} dot="var(--accent)" selected={selected} onSelect={onSelectCommit} />
          </section>
          <section>
            <div className="compare-head">
              <span className="badge-icon" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
                <ArrowDown size={14} strokeWidth={2} aria-hidden />
              </span>
              <h2>
                {history.theirs.length} commit{history.theirs.length > 1 ? "s" : ""} de {history.base} qui te manquent
              </h2>
            </div>
            <CommitList commits={history.theirs} empty="Ta branche est à jour." dot="var(--dot-base)" selected={selected} onSelect={onSelectCommit} />
          </section>
        </div>
        </>
      )}
    </>
  );
}

function CommitList({
  commits,
  empty,
  dot,
  selected,
  onSelect,
}: {
  commits: CommitInfo[];
  empty: string;
  dot: string;
  selected: string | null;
  onSelect: (sha: string) => void;
}) {
  if (!commits.length) return <div className="empty-note">{empty}</div>;
  return (
    <div className="list-box">
      {commits.map((c) => (
        <div
          key={c.sha}
          className={`list-row clickable${selected === c.sha ? " selected" : ""}`}
          onClick={() => onSelect(c.sha)}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
          <span className="msg" title={c.summary}>{c.summary}</span>
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>{relativeTime(c.time)}</span>
          <span className="mono" style={{ color: "var(--text-4)", fontSize: 11.5 }}>{c.short}</span>
        </div>
      ))}
    </div>
  );
}
