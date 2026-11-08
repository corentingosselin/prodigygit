import { useEffect, useRef, useState } from "react";
import { Check, Download, GitBranchPlus, LoaderCircle, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { api, type GhAccount, type Profile } from "../lib/api";
import { ProfileAvatar } from "./ProfileAvatar";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------ create branch

interface CreateProps {
  base: string;
  prefix: string;
  onCancel: () => void;
  onCreate: (name: string, checkout: boolean) => Promise<string | null>;
}

const INVALID = /[\s~^:?*[\\]|\.\.|@\{|\/\/|^\/|\/$|\.lock$|^\.|\.$/;

export function CreateBranchDialog({ base, prefix, onCancel, onCreate }: CreateProps) {
  const [name, setName] = useState(prefix);
  const [checkout, setCheckout] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.setSelectionRange(prefix.length, prefix.length);
  }, [prefix]);

  const submit = async () => {
    const n = name.trim();
    if (!n || n === prefix) return setError("Donne un nom à la branche");
    if (INVALID.test(n)) return setError("Ce nom n’est pas valide : pas d’espace ni de caractères spéciaux comme ~ ^ : ? *");
    const err = await onCreate(n, checkout);
    if (err) setError(err);
  };

  return (
    <Scrim onClose={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-labelledby="create-branch-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="dialog-head">
          <span className="ic accent" style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center" }}>
            <GitBranchPlus size={17} strokeWidth={1.8} aria-hidden />
          </span>
          <h2 id="create-branch-title">Créer une branche</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-2)", fontSize: 12.5 }}>
          Depuis <span className="chip">{base}</span>
        </div>
        <div className="stack">
          <label className="field-label" htmlFor="branch-name">Nom de la branche</label>
          <input
            id="branch-name"
            ref={input}
            className={`field mono${error ? " invalid" : ""}`}
            placeholder="prenom/loy-123-ma-feature"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          {error && <span className="field-error" role="alert">{error}</span>}
        </div>
        <button type="button" className="checkline" role="checkbox" aria-checked={checkout} onClick={() => setCheckout((c) => !c)}>
          <span className="check" style={checkout ? { background: "var(--accent)", borderColor: "var(--accent)", width: 16, height: 16 } : { width: 16, height: 16 }}>
            {checkout && <Check size={11} strokeWidth={3.5} aria-hidden />}
          </span>
          Faire le checkout après la création
        </button>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Annuler</button>
          <button type="submit" className="btn primary">Créer la branche</button>
        </div>
      </form>
    </Scrim>
  );
}

// ------------------------------------------------------------ confirm

interface ConfirmProps {
  title: string;
  body: React.ReactNode;
  confirm: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ title, body, confirm, danger, onCancel, onConfirm }: ConfirmProps) {
  return (
    <Scrim onClose={onCancel}>
      <div className="dialog" role="alertdialog" aria-labelledby="confirm-title">
        <div className="dialog-head">
          <h2 id="confirm-title">{title}</h2>
        </div>
        {typeof body === "string" ? <p>{body}</p> : <div className="dialog-body">{body}</div>}
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel} autoFocus>Annuler</button>
          <button
            className={`btn${danger ? "" : " primary"}`}
            style={danger ? { background: "var(--red)", borderColor: "var(--red)", color: "#0B0C0F", fontWeight: 600 } : undefined}
            onClick={onConfirm}
          >
            {confirm}
          </button>
        </div>
      </div>
    </Scrim>
  );
}

// ------------------------------------------------------------ profiles

interface ProfilesProps {
  profiles: Profile[];
  defaultId: string | null;
  onClose: () => void;
  onSave: (profiles: Profile[], defaultId: string | null) => void;
}

const EMPTY: Profile = { id: "", label: "", login: "", name: "", email: "", sshKey: "" };

export function ProfilesDialog({ profiles, defaultId, onClose, onSave }: ProfilesProps) {
  const [list, setList] = useState(profiles);
  const [def, setDef] = useState(defaultId);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gh, setGh] = useState<{ loading: boolean; accounts: GhAccount[] | null; error: string | null }>({
    loading: false,
    accounts: null,
    error: null,
  });

  const loadGh = async (fallbackToForm: boolean) => {
    setGh({ loading: true, accounts: null, error: null });
    try {
      setGh({ loading: false, accounts: await api.ghAccounts(), error: null });
    } catch (err) {
      setGh({ loading: false, accounts: null, error: String(err) });
      if (fallbackToForm) setEdit({ ...EMPTY });
    }
  };

  // First run: offer the accounts gh already knows instead of an empty form.
  useEffect(() => {
    if (!profiles.length) loadGh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasLogin = (login: string) => list.some((p) => p.login.toLowerCase() === login.toLowerCase());
  const importAccounts = (accounts: GhAccount[]) => {
    const added = accounts
      .filter((a) => !hasLogin(a.login))
      .map((a) => ({ id: crypto.randomUUID(), label: a.login, login: a.login, name: a.name, email: a.email, sshKey: "", avatarUrl: a.avatarUrl }));
    if (!added.length) return;
    setList((l) => [...l, ...added]);
    if (!def) {
      const active = accounts.find((a) => a.active)?.login;
      setDef((added.find((p) => p.login === active) ?? added[0]).id);
    }
  };

  const saveEdit = () => {
    if (!edit) return;
    if (!edit.label.trim()) return setError("Donne un nom au profil, par exemple Perso ou Pro");
    if (!edit.name.trim() || !edit.email.trim()) return setError("Le nom et l’email servent à signer tes commits : remplis les deux");
    if (!/^\S+@\S+\.\S+$/.test(edit.email.trim())) return setError("Cet email n’a pas l’air valide");
    const p = { ...edit, id: edit.id || crypto.randomUUID(), label: edit.label.trim(), email: edit.email.trim(), name: edit.name.trim(), login: edit.login.trim(), sshKey: edit.sshKey.trim() };
    const next = edit.id ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
    setList(next);
    if (!def) setDef(p.id);
    setEdit(null);
    setError(null);
  };

  const field = (key: keyof Profile, label: string, placeholder: string, mono = false) => (
    <div className="stack">
      <label className="field-label" htmlFor={`pf-${key}`}>{label}</label>
      <input
        id={`pf-${key}`}
        className={`field${mono ? " mono" : ""}`}
        placeholder={placeholder}
        value={edit?.[key] ?? ""}
        onChange={(e) => {
          setEdit((p) => (p ? { ...p, [key]: e.target.value } : p));
          setError(null);
        }}
      />
    </div>
  );

  return (
    <Scrim onClose={onClose}>
      <div className="dialog wide" role="dialog" aria-labelledby="profiles-title">
        <div className="dialog-head">
          <span className="ic accent" style={{ width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center" }}>
            <UserRound size={17} strokeWidth={1.8} aria-hidden />
          </span>
          <h2 id="profiles-title">Profils GitHub</h2>
        </div>
        <p>Un profil fixe l’auteur de tes commits et le compte utilisé pour pull et push. Tu choisis le profil de chaque dépôt depuis la barre d’outils.</p>

        {list.map((p) => (
          <div key={p.id} className="profile-row">
            <ProfileAvatar profile={p} />
            <span className="t">
              <b style={{ fontWeight: 500 }}>
                {p.label}
                {p.login && ` · ${p.login}`}
              </b>
              <span>{p.name} &lt;{p.email}&gt;{p.sshKey ? ` · clé ${p.sshKey}` : ""}</span>
            </span>
            {def === p.id ? (
              <span className="hint">Par défaut</span>
            ) : (
              <button className="btn sm ghost" onClick={() => setDef(p.id)}>Par défaut</button>
            )}
            <button className="btn icon sm ghost" aria-label={`Modifier ${p.label}`} onClick={() => setEdit({ ...p })}>
              <Pencil size={14} strokeWidth={1.8} aria-hidden />
            </button>
            <button
              className="btn icon sm ghost danger"
              aria-label={`Supprimer ${p.label}`}
              onClick={() => {
                setList((l) => l.filter((x) => x.id !== p.id));
                if (def === p.id) setDef(null);
              }}
            >
              <Trash2 size={14} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        ))}

        {edit ? (
          <form
            className="stack"
            style={{ gap: 12, padding: 14, border: "1px solid var(--border)", borderRadius: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <div className="grid2">
              {field("label", "Nom du profil", "Perso")}
              {field("login", "Login GitHub", "prodigy")}
              {field("name", "Auteur des commits", "Corentin Gosselin")}
              {field("email", "Email des commits", "toi@exemple.com")}
            </div>
            {field("sshKey", "Clé SSH (optionnelle)", "~/.ssh/id_ed25519_pro", true)}
            <span className="hint">En HTTPS, pull et push utilisent le compte gh de ce login s’il existe, sinon le trousseau macOS. En SSH, sans clé, ton agent SSH.</span>
            {error && <span className="field-error" role="alert">{error}</span>}
            <div className="dialog-actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn sm" onClick={() => { setEdit(null); setError(null); }}>Annuler</button>
              <button type="submit" className="btn sm primary">{edit.id ? "Enregistrer" : "Ajouter le profil"}</button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => loadGh(false)} disabled={gh.loading}>
              {gh.loading ? (
                <LoaderCircle size={15} strokeWidth={2} className="spin" aria-hidden />
              ) : (
                <Download size={15} strokeWidth={2} aria-hidden />
              )}
              Importer depuis GitHub CLI
            </button>
            <button className="btn ghost" onClick={() => setEdit({ ...EMPTY })}>
              <Plus size={15} strokeWidth={2} aria-hidden />
              Profil manuel
            </button>
          </div>
        )}

        {gh.error && !edit && <span className="field-error" role="alert">{gh.error}</span>}
        {gh.error && edit && <span className="hint">{gh.error}</span>}
        {gh.accounts && (
          <div className="gh-import" aria-label="Comptes GitHub CLI">
            <span className="hint">Comptes connectés dans gh sur ce Mac</span>
            {gh.accounts.map((a) => (
              <div key={a.login} className="profile-row">
                <ProfileAvatar profile={{ label: a.login, avatarUrl: a.avatarUrl }} />
                <span className="t">
                  <b style={{ fontWeight: 500 }}>
                    {a.login}
                    {a.active && <span className="hint" style={{ marginLeft: 6 }}>actif dans gh</span>}
                  </b>
                  <span>{a.name} &lt;{a.email}&gt;</span>
                </span>
                {hasLogin(a.login) ? (
                  <span className="hint" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Check size={14} strokeWidth={2.2} aria-hidden /> Ajouté
                  </span>
                ) : (
                  <button className="btn sm" onClick={() => importAccounts([a])}>Ajouter</button>
                )}
              </div>
            ))}
            {gh.accounts.filter((a) => !hasLogin(a.login)).length > 1 && (
              <button className="btn sm primary" style={{ alignSelf: "flex-end" }} onClick={() => importAccounts(gh.accounts!)}>
                Tout ajouter
              </button>
            )}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn primary" onClick={() => onSave(list, def && list.some((p) => p.id === def) ? def : list[0]?.id ?? null)}>
            Enregistrer les profils
          </button>
        </div>
      </div>
    </Scrim>
  );
}
