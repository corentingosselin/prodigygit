import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";
import { api, type ConflictFile } from "../lib/api";
import { errorText, splitPath } from "../lib/format";

interface Props {
  path: string;
  branch: string | null;
  mergeFrom: string | null;
  /** Every file that was in conflict during this merge. */
  files: string[];
  /** Files still in conflict. */
  conflicted: string[];
  busy: string | null;
  onResolveContent: (file: string, content: string) => Promise<void>;
  onResolveSide: (file: string, side: "a" | "b") => Promise<void>;
  onAbort: () => void;
  onFinish: () => void;
}

type Picks = Record<number, { a: boolean; b: boolean }>;

const SIDE = {
  a: { color: "var(--side-a)", bg: "rgba(45,212,191,0.10)", bgCur: "rgba(45,212,191,0.20)" },
  b: { color: "var(--side-b)", bg: "rgba(251,191,36,0.10)", bgCur: "rgba(251,191,36,0.20)" },
};

export function ConflictView(p: Props) {
  const [current, setCurrent] = useState<string | null>(null);
  const [file, setFile] = useState<ConflictFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [hi, setHi] = useState(0);

  // When the conflict list changes (a file was just resolved), move on to the next open file.
  const conflictKey = p.conflicted.join("\n");
  useEffect(() => {
    setCurrent((cur) => (cur && p.conflicted.includes(cur) ? cur : p.conflicted[0] ?? p.files[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictKey]);

  const isOpen = current !== null && p.conflicted.includes(current);

  useEffect(() => {
    setFile(null);
    setPicks({});
    setHi(0);
    setLoadError(null);
    if (!current || !isOpen) return;
    let alive = true;
    api
      .conflictFile(p.path, current)
      .then((f) => alive && setFile(f))
      .catch((e) => alive && setLoadError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [p.path, current, isOpen]);

  const hunkCount = file?.segments.filter((s) => s.kind === "hunk").length ?? 0;
  const pick = (k: number) => picks[k] ?? { a: false, b: false };
  const allPicked = hunkCount > 0 && Array.from({ length: hunkCount }, (_, k) => pick(k)).every((x) => x.a || x.b);

  useEffect(() => {
    document.querySelectorAll(`[data-hunk="${hi}"]`).forEach((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [hi, file]);

  const toggle = (k: number, side: "a" | "b") => {
    setPicks((ps) => ({ ...ps, [k]: { ...pick(k), [side]: !pick(k)[side] } }));
    setHi(k);
  };
  const toggleAll = (side: "a" | "b") => {
    const all = Array.from({ length: hunkCount }, (_, k) => pick(k)[side]).every(Boolean);
    setPicks((ps) => {
      const next = { ...ps };
      for (let k = 0; k < hunkCount; k++) next[k] = { ...(ps[k] ?? { a: false, b: false }), [side]: !all };
      return next;
    });
  };

  const output = useMemo(() => {
    if (!file) return [];
    const rows: { n: number | null; text: string; kind: "ctx" | "done" | "todo"; hunk?: number }[] = [];
    let n = 0;
    let k = 0;
    for (const seg of file.segments) {
      if (seg.kind === "ctx") {
        seg.lines.forEach((text) => rows.push({ n: ++n, text, kind: "ctx" }));
        continue;
      }
      const pk = picks[k] ?? { a: false, b: false };
      const lines = [...(pk.a ? seg.ours : []), ...(pk.b ? seg.theirs : [])];
      if (!lines.length) rows.push({ n: null, text: `Conflit ${k + 1} non résolu : coche le bloc A, B ou les deux`, kind: "todo", hunk: k });
      else lines.forEach((text, j) => rows.push({ n: ++n, text, kind: "done", hunk: j === 0 ? k : undefined }));
      k++;
    }
    return rows;
  }, [file, picks]);

  const buildContent = () => {
    if (!file) return "";
    const out: string[] = [];
    let k = 0;
    for (const seg of file.segments) {
      if (seg.kind === "ctx") out.push(...seg.lines);
      else {
        const pk = picks[k++] ?? { a: false, b: false };
        if (pk.a) out.push(...seg.ours);
        if (pk.b) out.push(...seg.theirs);
      }
    }
    return out.join("\n");
  };

  const pane = (side: "a" | "b") => {
    if (!file) return null;
    const rows: React.ReactNode[] = [];
    let n = 0;
    let k = 0;
    const st = SIDE[side];
    file.segments.forEach((seg, si) => {
      if (seg.kind === "ctx") {
        seg.lines.forEach((t, li) =>
          rows.push(
            <div className="cl" key={`${si}-${li}`}>
              <span className="gut" />
              <span className="ln tabular">{++n}</span>
              <span className="tx">{t}</span>
            </div>,
          ),
        );
        return;
      }
      const hk = k++;
      const on = pick(hk)[side];
      const lines = side === "a" ? seg.ours : seg.theirs;
      const bg = hk === hi ? st.bgCur : st.bg;
      if (!lines.length) {
        rows.push(
          <div className="cl hl" key={`${si}-empty`} data-hunk={hk} style={{ background: bg, boxShadow: `inset 3px 0 0 ${st.color}` }}>
            <span className="gut">
              <CheckBox on={on} color={st.color} label={`${on ? "Retirer" : "Garder"} le bloc ${hk + 1} de ${side.toUpperCase()}`} onClick={() => toggle(hk, side)} />
            </span>
            <span className="ln" />
            <span className="tx" style={{ color: "var(--text-3)", fontStyle: "italic" }}>(lignes supprimées de ce côté)</span>
          </div>,
        );
      }
      lines.forEach((t, j) =>
        rows.push(
          <div
            className="cl hl"
            key={`${si}-${j}`}
            data-hunk={j === 0 ? hk : undefined}
            style={{ background: bg, boxShadow: `inset 3px 0 0 ${st.color}` }}
            onClick={() => setHi(hk)}
          >
            <span className="gut">
              {j === 0 && (
                <CheckBox on={on} color={st.color} label={`${on ? "Retirer" : "Garder"} le bloc ${hk + 1} de ${side.toUpperCase()}`} onClick={() => toggle(hk, side)} />
              )}
            </span>
            <span className="ln tabular">{++n}</span>
            <span className="tx">{t}</span>
          </div>,
        ),
      );
    });
    const all = hunkCount > 0 && Array.from({ length: hunkCount }, (_, i) => pick(i)[side]).every(Boolean);
    return (
      <div className="pane">
        <div className="pane-head">
          <CheckBox on={all} color={st.color} label={`${all ? "Retirer" : "Garder"} tous les blocs de ${side.toUpperCase()}`} onClick={() => toggleAll(side)} />
          <span className="side-letter" style={{ color: st.color }}>{side.toUpperCase()}</span>
          <span className="who">
            {side === "a" ? "Ta version sur " : "Leur version sur "}
            <i style={{ fontWeight: 600, color: st.color }}>{side === "a" ? p.branch ?? "HEAD" : p.mergeFrom ?? "la branche mergée"}</i>
          </span>
        </div>
        <div className="code">{rows}</div>
      </div>
    );
  };

  const remaining = p.conflicted.length;
  const saving = p.busy === "resolve";

  return (
    <>
      <div className="merge-banner" role="status">
        <AlertTriangle size={17} strokeWidth={1.9} aria-hidden />
        <span className="grow">
          Merge {p.mergeFrom ? <>de <b>{p.mergeFrom}</b> </> : null}dans <b>{p.branch ?? "HEAD"}</b> :{" "}
          {remaining ? `${remaining} fichier${remaining > 1 ? "s" : ""} en conflit` : "tous les conflits sont résolus"}
        </span>
        <button className="btn sm" onClick={p.onAbort}>Annuler le merge</button>
      </div>
      <div className="conflict-body">
        <nav className="conflict-files" aria-label="Fichiers en conflit">
          <div className="side-head" style={{ paddingTop: 0 }}>Fichiers en conflit</div>
          {p.files.map((f) => {
            const done = !p.conflicted.includes(f);
            return (
              <button key={f} className={`cf-row${f === current ? " selected" : ""}`} title={f} onClick={() => setCurrent(f)}>
                <span className={`cf-mark ${done ? "done" : "todo"}`}>
                  {done ? <Check size={11} strokeWidth={3} aria-label="Résolu" /> : <AlertTriangle size={10} strokeWidth={2.6} aria-label="À résoudre" />}
                </span>
                <span className="name">{splitPath(f).name}</span>
              </button>
            );
          })}
        </nav>
        <div className="conflict-main">
          {remaining === 0 ? (
            <div className="whole-file">
              <strong style={{ color: "var(--text)", fontSize: 15 }}>Tous les conflits sont résolus</strong>
              Termine le merge pour créer le commit de merge.
              <button className="btn success" onClick={p.onFinish}>
                {p.busy === "finish" ? <LoaderCircle size={15} className="spin" aria-hidden /> : <Check size={15} strokeWidth={2.2} aria-hidden />}
                Terminer le merge
              </button>
            </div>
          ) : !isOpen ? (
            <div className="whole-file">Ce fichier est résolu. Choisis un fichier encore en conflit.</div>
          ) : loadError ? (
            <div className="whole-file">{loadError}</div>
          ) : !file ? (
            <div className="whole-file">Chargement…</div>
          ) : file.wholeFile ? (
            <div className="whole-file">
              <strong style={{ color: "var(--text)", fontSize: 15 }}>Ce conflit ne se résout pas ligne par ligne</strong>
              Le fichier est binaire, ou il a été supprimé d’un côté. Choisis la version à garder.
              <div className="actions">
                <button className="btn" onClick={() => p.onResolveSide(current!, "a")}>Garder A ({p.branch})</button>
                <button className="btn" onClick={() => p.onResolveSide(current!, "b")}>Garder B ({p.mergeFrom ?? "entrante"})</button>
              </div>
            </div>
          ) : (
            <>
              <div className="panes">
                {pane("a")}
                {pane("b")}
              </div>
              <div className="result-bar">
                <strong>Résultat</strong>
                <span className="nav tabular">Conflit {Math.min(hi + 1, hunkCount)} sur {hunkCount}</span>
                <button className="btn icon sm" aria-label="Conflit précédent" onClick={() => setHi((h) => (h - 1 + hunkCount) % hunkCount)}>
                  <ChevronUp size={14} strokeWidth={2.4} aria-hidden />
                </button>
                <button className="btn icon sm" aria-label="Conflit suivant" onClick={() => setHi((h) => (h + 1) % hunkCount)}>
                  <ChevronDown size={14} strokeWidth={2.4} aria-hidden />
                </button>
                <div className="end">
                  <button
                    className={`btn sm${allPicked ? " success" : ""}`}
                    aria-disabled={!allPicked}
                    title={allPicked ? undefined : "Choisis A, B ou les deux pour chaque conflit"}
                    onClick={() => allPicked && current && p.onResolveContent(current, buildContent())}
                  >
                    {saving ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Check size={14} strokeWidth={2.4} aria-hidden />}
                    Marquer comme résolu
                  </button>
                </div>
              </div>
              <div className="code" style={{ flex: 1 }}>
                {output.map((r, i) => (
                  <div
                    key={i}
                    className={`cl${r.kind === "ctx" ? "" : " hl"}`}
                    data-hunk={r.hunk}
                    style={
                      r.kind === "ctx"
                        ? undefined
                        : r.kind === "todo"
                          ? { background: "rgba(248,113,113,0.10)", boxShadow: "inset 3px 0 0 var(--red)", color: "#FCA5A5", fontStyle: "italic" }
                          : { background: "rgba(192,132,252,0.15)", boxShadow: "inset 3px 0 0 var(--resolved)" }
                    }
                  >
                    <span className="ln tabular" style={{ width: 66 }}>{r.n ?? ""}</span>
                    <span className="tx">{r.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CheckBox({ on, color, label, onClick }: { on: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button
      className="check"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      style={on ? { background: color, borderColor: color } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {on && <Check size={10} strokeWidth={3.5} aria-hidden />}
    </button>
  );
}
