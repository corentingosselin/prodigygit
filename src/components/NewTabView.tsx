import { useState } from "react";
import { CloudDownload, FolderOpen, FolderPlus, LoaderCircle } from "lucide-react";

interface Props {
  busy: string | null;
  hasTabs: boolean;
  onOpen: () => void;
  onInit: () => void;
  onClone: (url: string) => void;
}

export function NewTabView({ busy, hasTabs, onOpen, onInit, onClone }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clone = () => {
    const u = url.trim();
    if (!u) return setError("Colle l’URL du dépôt à cloner");
    if (!/^(https?:\/\/|git@|ssh:\/\/|file:\/\/|\/)/.test(u)) return setError("L’URL doit commencer par https://, git@ ou ssh://");
    setError(null);
    onClone(u);
  };

  return (
    <div className="newtab">
      <div className="newtab-inner">
        <h1>{hasTabs ? "Ouvrir un autre dépôt" : "Ouvre ton premier dépôt"}</h1>
        <p>Chaque dépôt s’ouvre dans son propre onglet.</p>
        <button className="card" onClick={onOpen}>
          <span className="ic accent">
            {busy === "open" ? <LoaderCircle size={20} className="spin" aria-hidden /> : <FolderOpen size={20} strokeWidth={1.8} aria-hidden />}
          </span>
          <span className="t">
            <b>Ouvrir un dossier</b>
            <span>Un dépôt Git déjà présent sur ton disque</span>
          </span>
        </button>
        <button className="card" onClick={onInit}>
          <span className="ic green">
            {busy === "init" ? <LoaderCircle size={20} className="spin" aria-hidden /> : <FolderPlus size={20} strokeWidth={1.8} aria-hidden />}
          </span>
          <span className="t">
            <b>Initialiser un dépôt</b>
            <span>Crée un nouveau dépôt Git dans un dossier</span>
          </span>
        </button>
        <form
          className="card column"
          onSubmit={(e) => {
            e.preventDefault();
            clone();
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="ic amber">
              {busy === "clone" ? <LoaderCircle size={20} className="spin" aria-hidden /> : <CloudDownload size={20} strokeWidth={1.8} aria-hidden />}
            </span>
            <span className="t">
              <b>Cloner un dépôt</b>
              <span>Depuis une URL HTTPS ou SSH, avec ton profil par défaut</span>
            </span>
          </div>
          <label className="field-label" htmlFor="clone-url">URL du dépôt</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="clone-url"
              className={`field mono${error ? " invalid" : ""}`}
              placeholder="git@github.com:prodigy/mon-projet.git"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
            />
            <button type="submit" className="btn primary" style={{ height: 38 }}>
              Cloner
            </button>
          </div>
          {error && <span className="field-error" role="alert">{error}</span>}
          <span className="hint">Tu choisiras ensuite le dossier où le cloner.</span>
        </form>
      </div>
    </div>
  );
}
