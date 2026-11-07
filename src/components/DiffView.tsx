import { ArrowLeft, Minus, Plus, Undo2 } from "lucide-react";
import type { FileDiff } from "../lib/api";
import { splitPath } from "../lib/format";

interface Props {
  file: string;
  staged: boolean;
  diff: FileDiff | null;
  error: string | null;
  onBack: () => void;
  onToggleStage: () => void;
  onDiscard: () => void;
}

export function DiffView({ file, staged, diff, error, onBack, onToggleStage, onDiscard }: Props) {
  const { dir, name } = splitPath(file);
  return (
    <>
      <div className="view-bar">
        <button className="btn icon sm" aria-label="Retour à l’historique" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2} aria-hidden />
        </button>
        <div className="file-path" title={file}>
          {dir && <span className="dir">{dir}</span>}
          <span className="fn">{name}</span>
        </div>
        {diff && !diff.binary && (
          <>
            <span className="pill green tabular">+{diff.additions}</span>
            <span className="pill red tabular">−{diff.deletions}</span>
          </>
        )}
        <span style={{ marginLeft: "auto" }} />
        <span className="hint">{staged ? "Stagé" : "Non stagé"}</span>
        {!staged && (
          <button className="btn sm ghost danger" onClick={onDiscard}>
            <Undo2 size={14} strokeWidth={1.8} aria-hidden />
            Annuler les changements
          </button>
        )}
        <button className="btn sm" onClick={onToggleStage}>
          {staged ? <Minus size={14} strokeWidth={2} aria-hidden /> : <Plus size={14} strokeWidth={2} aria-hidden />}
          {staged ? "Retirer du stage" : "Stager le fichier"}
        </button>
      </div>
      <div className="diff-scroll">
        {error && <div className="placeholder"><strong>Diff indisponible</strong>{error}</div>}
        {!error && !diff && <div className="placeholder">Chargement du diff…</div>}
        {diff?.binary && <div className="placeholder"><strong>Fichier binaire</strong>Le contenu ne peut pas être affiché.</div>}
        {diff && !diff.binary && diff.hunks.length === 0 && (
          <div className="placeholder"><strong>Aucune différence</strong>Le fichier est vide ou identique.</div>
        )}
        {diff &&
          !diff.binary &&
          diff.hunks.map((h, hi) => (
            <div className="hunk" key={hi}>
              <div className="hunk-head">{h.header}</div>
              <div style={{ overflowX: "auto" }}>
                {h.lines.map((l, li) => (
                  <div key={li} className={`dl${l.kind === "+" ? " add" : l.kind === "-" ? " del" : ""}`}>
                    <span className="ln tabular">{l.old ?? ""}</span>
                    <span className="ln tabular">{l.new ?? ""}</span>
                    <span className="sg">{l.kind === "+" ? "+" : l.kind === "-" ? "−" : ""}</span>
                    <span className="tx">{l.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
