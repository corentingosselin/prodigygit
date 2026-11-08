import { Copy, X } from "lucide-react";
import type { CommitDetails, CommitFile } from "../lib/api";
import { avatarColor, initials, splitPath } from "../lib/format";

interface Props {
  details: CommitDetails | null;
  error: string | null;
  selectedFile: string | null;
  onOpenFile: (file: CommitFile) => void;
  onClose: () => void;
  onCopied: (text: string) => void;
}

const fullDate = (s: number) =>
  new Date(s * 1000).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Right panel for a past commit: message, author, and the files it changed. */
export function CommitPanel({ details: d, error, selectedFile, onOpenFile, onClose, onCopied }: Props) {
  const adds = d?.files.reduce((n, f) => n + f.additions, 0) ?? 0;
  const dels = d?.files.reduce((n, f) => n + f.deletions, 0) ?? 0;

  return (
    <aside className="changes" aria-label="Détail du commit">
      <div className="changes-head">
        <strong>Commit</strong>
        {d && (
          <button
            className="sha-btn mono"
            title="Copier le SHA complet"
            onClick={() => navigator.clipboard.writeText(d.sha).then(() => onCopied(d.sha))}
          >
            {d.short}
            <Copy size={12} strokeWidth={2} aria-hidden />
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn icon sm ghost" aria-label="Revenir aux changements en cours" title="Revenir aux changements en cours" onClick={onClose}>
          <X size={15} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {error && <div className="placeholder"><strong>Commit indisponible</strong>{error}</div>}
      {!error && !d && <div className="placeholder">Chargement du commit…</div>}

      {d && (
        <div className="changes-scroll">
          <div className="commit-meta">
            <h3>{d.summary}</h3>
            {d.body && <p className="commit-body">{d.body}</p>}
            <div className="who">
              <span className="avatar sm" style={{ background: avatarColor(d.author) }}>{initials(d.author)}</span>
              <span className="t">
                <span>{d.author}</span>
                <small title={d.email}>{fullDate(d.time)}</small>
              </span>
            </div>
            {d.parents.length > 1 && <span className="hint">Merge de {d.parents.join(" et ")} · diff par rapport au premier parent</span>}
          </div>

          <div className="group-head">
            <span>
              {d.files.length} fichier{d.files.length > 1 ? "s" : ""}
            </span>
            <span className="pill green tabular" style={{ flex: "none" }}>+{adds}</span>
            <span className="pill red tabular" style={{ flex: "none" }}>−{dels}</span>
          </div>
          {d.files.map((f) => {
            const { dir, name } = splitPath(f.path);
            return (
              <div
                key={f.path}
                className={`file${selectedFile === f.path ? " selected" : ""}`}
                title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                onClick={() => onOpenFile(f)}
              >
                <span className={`st ${f.status}`} aria-label={{ A: "Ajouté", M: "Modifié", D: "Supprimé", R: "Renommé" }[f.status]}>
                  {f.status}
                </span>
                <span className="path">
                  <span className="d">{dir}</span>
                  {name}
                </span>
                {f.binary ? (
                  <span className="hint">binaire</span>
                ) : (
                  <span className="file-stats tabular">
                    {f.additions > 0 && <span className="add">+{f.additions}</span>}
                    {f.deletions > 0 && <span className="del">−{f.deletions}</span>}
                  </span>
                )}
              </div>
            );
          })}
          {!d.files.length && <div className="empty-note">Ce commit ne change aucun fichier</div>}
        </div>
      )}
    </aside>
  );
}
