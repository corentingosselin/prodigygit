import { useState } from "react";
import { Check, LoaderCircle, Minus, Plus } from "lucide-react";
import type { FileChange, StatusInfo } from "../lib/api";
import { splitPath } from "../lib/format";

interface Props {
  status: StatusInfo;
  branch: string | null;
  selected: { path: string; staged: boolean } | null;
  committing: boolean;
  onOpen: (path: string, staged: boolean) => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommit: (summary: string, description: string) => Promise<boolean>;
}

export function ChangesPanel(p: Props) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const total = p.status.unstaged.length + p.status.staged.length;

  const submit = async () => {
    if (!p.status.staged.length) return setError("Stage au moins un fichier avant de committer");
    if (!summary.trim()) return setError("Écris un résumé pour ce commit");
    setError(null);
    if (await p.onCommit(summary, description)) {
      setSummary("");
      setDescription("");
    }
  };

  const fileRow = (f: FileChange, staged: boolean) => {
    const { dir, name } = splitPath(f.path);
    const sel = p.selected?.path === f.path && p.selected.staged === staged;
    return (
      <div
        key={`${staged}-${f.path}`}
        className={`file${sel ? " selected" : ""}`}
        title={f.path}
        onClick={() => p.onOpen(f.path, staged)}
      >
        <span className={`st ${f.status}`} aria-label={{ A: "Ajouté", M: "Modifié", D: "Supprimé", R: "Renommé" }[f.status]}>
          {f.status}
        </span>
        <span className="path">
          <span className="d">{dir}</span>
          {name}
        </span>
        <button
          className={`file-act ${staged ? "remove" : "add"}`}
          aria-label={staged ? `Retirer ${name} du stage` : `Stager ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            (staged ? p.onUnstage : p.onStage)([f.path]);
          }}
        >
          {staged ? <Minus size={13} strokeWidth={2.4} aria-hidden /> : <Plus size={13} strokeWidth={2.4} aria-hidden />}
        </button>
      </div>
    );
  };

  return (
    <aside className="changes" aria-label="Changements">
      <div className="changes-head">
        <strong>Changements</strong>
        <small>
          {total} fichier{total > 1 ? "s" : ""}
          {p.branch ? ` sur ${p.branch}` : ""}
        </small>
      </div>
      <div className="changes-scroll">
        <div className="group-head">
          <span>Non stagés · {p.status.unstaged.length}</span>
          {p.status.unstaged.length > 0 && (
            <button className="btn sm ghost" style={{ color: "var(--green)" }} onClick={p.onStageAll}>
              Tout stager
            </button>
          )}
        </div>
        {p.status.unstaged.map((f) => fileRow(f, false))}
        {!p.status.unstaged.length && <div className="empty-note">Aucun changement non stagé</div>}
        <div className="group-head">
          <span>Stagés · {p.status.staged.length}</span>
          {p.status.staged.length > 0 && (
            <button className="btn sm ghost" onClick={p.onUnstageAll}>
              Tout retirer
            </button>
          )}
        </div>
        {p.status.staged.map((f) => fileRow(f, true))}
        {!p.status.staged.length && <div className="empty-note">Rien de stagé pour l’instant</div>}
      </div>
      <form
        className="commit-box"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field-label" htmlFor="commit-summary">Message du commit</label>
        <input
          id="commit-summary"
          className={`field${error && !summary.trim() ? " invalid" : ""}`}
          placeholder="Résumé du commit"
          value={summary}
          maxLength={200}
          onChange={(e) => {
            setSummary(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
        />
        <textarea
          aria-label="Description du commit"
          className="field"
          placeholder="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
        />
        {error && <span className="field-error" role="alert">{error}</span>}
        <button type="submit" className="btn primary block">
          {p.committing ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Check size={16} strokeWidth={2.2} aria-hidden />}
          {p.status.staged.length
            ? `Commit ${p.status.staged.length} fichier${p.status.staged.length > 1 ? "s" : ""}`
            : "Commit"}
        </button>
        <span className="hint">⌘ Entrée pour committer</span>
      </form>
    </aside>
  );
}
