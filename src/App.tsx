import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { X } from "lucide-react";
import {
  api,
  type Branches,
  type FileDiff,
  type History,
  type Identity,
  type Profile,
  type RepoInfo,
  type Settings,
  type StashEntry,
  type StatusInfo,
} from "./lib/api";
import { errorText, lastSegment, splitPath } from "./lib/format";
import { TabBar } from "./components/TabBar";
import { Toolbar, type Op } from "./components/Toolbar";
import { Sidebar, type BranchAction } from "./components/Sidebar";
import { HistoryView } from "./components/HistoryView";
import { DiffView } from "./components/DiffView";
import { ChangesPanel } from "./components/ChangesPanel";
import { ConflictView } from "./components/ConflictView";
import { NewTabView } from "./components/NewTabView";
import { ConfirmDialog, CreateBranchDialog, ProfilesDialog } from "./components/Dialogs";

interface RepoData {
  path: string;
  info: RepoInfo;
  branches: Branches;
  history: History;
  status: StatusInfo;
  stashes: StashEntry[];
}

type Kind = "info" | "success" | "error";
interface Confirm {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  action: () => void;
}

const EMPTY_SETTINGS: Settings = { tabs: [], activeTab: 0, profiles: [], defaultProfile: null, repoProfiles: {} };

function toIdentity(p: Profile | null): Identity {
  return p ? { name: p.name, email: p.email, login: p.login, sshKey: p.sshKey } : {};
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newTab, setNewTab] = useState(false);
  const [data, setData] = useState<RepoData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: Kind }>({ text: "Prêt", kind: "info" });
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [createFrom, setCreateFrom] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<string[]>([]);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);

  const s = settings ?? EMPTY_SETTINGS;
  const showNew = !!settings && (newTab || s.tabs.length === 0);
  const activePath = !showNew ? s.tabs[s.activeTab] : undefined;

  const profile = useMemo(() => {
    const id = (activePath && s.repoProfiles[activePath]) || s.defaultProfile;
    return s.profiles.find((p) => p.id === id) ?? null;
  }, [s, activePath]);
  const defaultProfile = s.profiles.find((p) => p.id === s.defaultProfile) ?? null;
  const identity = toIdentity(profile);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  // ------------------------------------------------------------ settings

  useEffect(() => {
    api
      .loadSettings()
      .then((loaded) => setSettings({ ...EMPTY_SETTINGS, ...loaded }))
      .catch(() => setSettings(EMPTY_SETTINGS));
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    api.saveSettings(next).catch(() => {});
  }, []);

  // ------------------------------------------------------------ feedback

  const notify = useCallback((text: string, kind: Kind = "info") => {
    setMessage({ text, kind });
    if (kind === "error") setToast({ text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------------------ loading

  const seq = useRef(0);
  const load = useCallback(async (path: string) => {
    const mine = ++seq.current;
    try {
      const [info, branches, history, status, stashes] = await Promise.all([
        api.repoInfo(path),
        api.branches(path),
        api.history(path),
        api.status(path),
        api.stashList(path, identityRef.current).catch(() => []),
      ]);
      if (mine !== seq.current) return;
      setData({ path, info, branches, history, status, stashes });
      setLoadError(null);
    } catch (e) {
      if (mine === seq.current) setLoadError(errorText(e));
    }
  }, []);

  useEffect(() => {
    setData(null);
    setSelected(null);
    setLoadError(null);
    if (!activePath) return;
    load(activePath);
    let alive = true;
    api
      .fetch(activePath, identityRef.current)
      .then(() => {
        if (alive) load(activePath);
      })
      .catch(() => alive && setMessage({ text: "Fetch impossible : les branches distantes ne sont peut-être pas à jour", kind: "info" }));
    return () => {
      alive = false;
    };
  }, [activePath, load]);

  useEffect(() => {
    if (!activePath) return;
    const onFocus = () => load(activePath);
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => document.hasFocus() && load(activePath), 20000);
    const fetchPoll = setInterval(
      () => api.fetch(activePath, identityRef.current).then(() => load(activePath)).catch(() => {}),
      5 * 60 * 1000,
    );
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
      clearInterval(fetchPoll);
    };
  }, [activePath, load]);

  // Keep the list of files touched by the current merge, so resolved ones stay visible.
  const merging = !!data?.info.merging;
  useEffect(() => {
    if (!data) return;
    if (!data.info.merging) {
      setMergeFiles([]);
      setMergeFrom(null);
      return;
    }
    setMergeFiles((prev) => [...new Set([...prev, ...data.status.conflicted])]);
  }, [data]);

  // Diff of the selected file, reloaded whenever the status changes.
  useEffect(() => {
    if (!data || !selected) {
      setDiff(null);
      return;
    }
    const list = selected.staged ? data.status.staged : data.status.unstaged;
    if (!list.some((f) => f.path === selected.path)) {
      const other = (selected.staged ? data.status.unstaged : data.status.staged).some((f) => f.path === selected.path);
      setSelected(other ? { path: selected.path, staged: !selected.staged } : null);
      return;
    }
    let alive = true;
    setDiffError(null);
    api
      .diffFile(data.path, selected.path, selected.staged)
      .then((d) => alive && setDiff(d))
      .catch((e) => alive && setDiffError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [data, selected]);

  // ------------------------------------------------------------ actions

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
      if (!activePath) return undefined;
      setBusy(key);
      setMessage({ text: "En cours…", kind: "info" });
      try {
        const r = await fn();
        if (ok) notify(typeof ok === "function" ? ok(r) : ok, "success");
        else setMessage({ text: "Prêt", kind: "info" });
        return r;
      } catch (e) {
        notify(errorText(e), "error");
        return undefined;
      } finally {
        setBusy(null);
        await load(activePath);
      }
    },
    [activePath, load, notify],
  );

  const head = data?.branches.local.find((b) => b.isHead) ?? null;
  const currentBranch = data?.info.head ?? null;
  const changes = data ? data.status.unstaged.length + data.status.staged.length : 0;

  const onOp = (op: Op) => {
    if (!activePath || busy) return;
    const id = identityRef.current;
    if (op === "pull") run("pull", () => api.pull(activePath, id), "Pull terminé");
    if (op === "push") run("push", () => api.push(activePath, id), "Push terminé");
    if (op === "fetch") run("fetch", () => api.fetch(activePath, id), "Branches distantes à jour");
    if (op === "stash") {
      if (!changes) return notify("Rien à mettre de côté");
      run("stash", () => api.stashPush(activePath, id), `${changes} fichier${changes > 1 ? "s" : ""} mis de côté`);
    }
    if (op === "pop") {
      if (!data?.stashes.length) return notify("Aucun stash à réappliquer");
      run("pop", () => api.stashPop(activePath, id), "Stash réappliqué");
    }
  };

  const deleteBranch = (name: string, force: boolean) => {
    if (!activePath) return;
    setBusy("delete");
    api
      .deleteBranch(activePath, name, force, identityRef.current)
      .then(() => notify(`Branche ${name} supprimée`, "success"))
      .catch((e) => {
        const msg = errorText(e);
        if (!force && /not fully merged|pas totalement fusionn/i.test(msg)) {
          setConfirm({
            title: "Cette branche n’est pas mergée",
            body: `${name} contient des commits qui ne sont dans aucune autre branche. Si tu la supprimes, ces commits seront perdus.`,
            confirm: "Supprimer quand même",
            danger: true,
            action: () => deleteBranch(name, true),
          });
        } else notify(msg, "error");
      })
      .finally(() => {
        setBusy(null);
        load(activePath);
      });
  };

  const onBranchAction = (action: BranchAction, branch: string) => {
    if (!activePath) return;
    const id = identityRef.current;
    if (action === "checkout") run("checkout", () => api.checkout(activePath, branch, id), `Checkout de ${branch}`);
    if (action === "create") setCreateFrom(branch);
    if (action === "merge") {
      setMergeFrom(branch);
      run(
        "merge",
        () => api.merge(activePath, branch, id),
        (r) =>
          r.conflicted.length
            ? `Merge de ${branch} : ${r.conflicted.length} conflit${r.conflicted.length > 1 ? "s" : ""} à résoudre`
            : `${branch} mergée dans ${currentBranch}`,
      );
    }
    if (action === "delete")
      setConfirm({
        title: `Supprimer ${branch} ?`,
        body: "La branche locale sera supprimée. La branche distante, si elle existe, n’est pas touchée.",
        confirm: "Supprimer",
        danger: true,
        action: () => deleteBranch(branch, false),
      });
  };

  const createBranch = async (name: string, checkout: boolean): Promise<string | null> => {
    if (!activePath || !createFrom) return null;
    try {
      await api.createBranch(activePath, name, createFrom);
      if (checkout) await api.checkout(activePath, name, identityRef.current);
      notify(`Branche ${name} créée${checkout ? ", checkout effectué" : ""}`, "success");
      setCreateFrom(null);
      setSelected(null);
      load(activePath);
      return null;
    } catch (e) {
      return errorText(e);
    }
  };

  const commit = async (summary: string, description: string) => {
    if (!activePath) return false;
    setBusy("commit");
    try {
      const sha = await api.commit(activePath, summary, description, identityRef.current);
      notify(`Commit ${sha} créé`, "success");
      setSelected(null);
      return true;
    } catch (e) {
      notify(errorText(e), "error");
      return false;
    } finally {
      setBusy(null);
      load(activePath);
    }
  };

  // ------------------------------------------------------------ tabs

  const addTab = (path: string) => {
    const tabs = s.tabs.includes(path) ? s.tabs : [...s.tabs, path];
    persist({ ...s, tabs, activeTab: tabs.indexOf(path) });
    setNewTab(false);
  };

  const closeTab = (i: number) => {
    const tabs = s.tabs.filter((_, j) => j !== i);
    const activeTab = Math.max(0, Math.min(i < s.activeTab ? s.activeTab - 1 : s.activeTab, tabs.length - 1));
    persist({ ...s, tabs, activeTab });
    if (!tabs.length) setNewTab(true);
  };

  const pickFolder = async (title: string) => {
    const dir = await openDialog({ directory: true, multiple: false, title });
    return typeof dir === "string" ? dir : null;
  };

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const openRepo = () =>
    withBusy("open", async () => {
      const dir = await pickFolder("Ouvrir un dépôt Git");
      if (!dir) return;
      const info = await api.repoInfo(dir);
      addTab(info.path);
      notify(`${info.name} ouvert`, "success");
    });

  const initRepo = () =>
    withBusy("init", async () => {
      const dir = await pickFolder("Dossier où initialiser le dépôt");
      if (!dir) return;
      const info = await api.initRepo(dir);
      addTab(info.path);
      notify(`Dépôt initialisé dans ${info.name}`, "success");
    });

  const cloneRepo = (url: string) =>
    withBusy("clone", async () => {
      const parent = await pickFolder("Dossier où cloner le dépôt");
      if (!parent) return;
      setMessage({ text: `Clonage de ${url}…`, kind: "info" });
      const info = await api.cloneRepo(url, parent, toIdentity(defaultProfile));
      addTab(info.path);
      notify(`${info.name} cloné`, "success");
    });

  // ------------------------------------------------------------ render

  const branchPrefix = currentBranch?.includes("/") ? currentBranch.slice(0, currentBranch.indexOf("/") + 1) : "";

  let body: React.ReactNode;
  if (!settings) body = <div className="placeholder" />;
  else if (showNew)
    body = <NewTabView busy={busy} hasTabs={s.tabs.length > 0} onOpen={openRepo} onInit={initRepo} onClone={cloneRepo} />;
  else if (!data)
    body = loadError ? (
      <div className="placeholder">
        <strong>Impossible d’ouvrir ce dépôt</strong>
        {loadError}
        <button className="btn" style={{ marginTop: 8 }} onClick={() => closeTab(s.activeTab)}>
          Fermer l’onglet
        </button>
      </div>
    ) : (
      <div className="placeholder">Chargement de {activePath ? splitPath(activePath).name : ""}…</div>
    );
  else
    body = (
      <>
        <Toolbar
          repoName={data.info.name}
          branch={currentBranch}
          ahead={head?.ahead ?? 0}
          behind={head?.behind ?? 0}
          stashes={data.stashes.length}
          busy={busy}
          profiles={s.profiles}
          profile={profile}
          onOp={onOp}
          onCreateBranch={() => currentBranch && setCreateFrom(currentBranch)}
          onPickProfile={(id) => activePath && persist({ ...s, repoProfiles: { ...s.repoProfiles, [activePath]: id } })}
          onManageProfiles={() => setProfilesOpen(true)}
        />
        <div className="workspace">
          {!merging && (
            <Sidebar
              branches={data.branches}
              current={currentBranch}
              stashes={data.stashes}
              onAction={onBranchAction}
              onCreate={() => currentBranch && setCreateFrom(currentBranch)}
            />
          )}
          <main className="center">
            {merging ? (
              <ConflictView
                path={data.path}
                branch={currentBranch}
                mergeFrom={mergeFrom}
                files={mergeFiles.length ? mergeFiles : data.status.conflicted}
                conflicted={data.status.conflicted}
                busy={busy}
                onResolveContent={async (file, content) => {
                  await run("resolve", () => api.resolveWithContent(data.path, file, content), `${splitPath(file).name} résolu`);
                }}
                onResolveSide={async (file, side) => {
                  await run("resolve", () => api.resolveWithSide(data.path, file, side, identityRef.current), `${splitPath(file).name} résolu`);
                }}
                onAbort={() =>
                  setConfirm({
                    title: "Annuler le merge ?",
                    body: "Le dépôt revient à l’état d’avant le merge. Les conflits déjà résolus seront perdus.",
                    confirm: "Annuler le merge",
                    danger: true,
                    action: () => run("abort", () => api.mergeAbort(data.path, identityRef.current), "Merge annulé"),
                  })
                }
                onFinish={() => run("finish", () => api.mergeContinue(data.path, identityRef.current), "Merge terminé")}
              />
            ) : selected ? (
              <DiffView
                file={selected.path}
                staged={selected.staged}
                diff={diff}
                error={diffError}
                onBack={() => setSelected(null)}
                onToggleStage={() => {
                  const sel = selected;
                  run(sel.staged ? "unstage" : "stage", () =>
                    sel.staged ? api.unstage(data.path, [sel.path]) : api.stage(data.path, [sel.path]),
                  ).then(() => setSelected({ path: sel.path, staged: !sel.staged }));
                }}
                onDiscard={() =>
                  setConfirm({
                    title: `Annuler les changements de ${splitPath(selected.path).name} ?`,
                    body: "Les modifications non stagées de ce fichier seront perdues. Un fichier nouveau sera supprimé. Cette action est définitive.",
                    confirm: "Annuler les changements",
                    danger: true,
                    action: () => {
                      const file = selected.path;
                      setSelected(null);
                      run("discard", () => api.discard(data.path, file, identityRef.current), "Changements annulés");
                    },
                  })
                }
              />
            ) : (
              <HistoryView
                history={data.history}
                branches={data.branches}
                status={data.status}
                onMergeBase={(base) => onBranchAction("merge", base)}
              />
            )}
          </main>
          {!merging && (
            <ChangesPanel
              status={data.status}
              branch={currentBranch ? lastSegment(currentBranch) : null}
              selected={selected}
              committing={busy === "commit"}
              onOpen={(path, staged) => setSelected({ path, staged })}
              onStage={(files) => run("stage", () => api.stage(data.path, files))}
              onUnstage={(files) => run("unstage", () => api.unstage(data.path, files))}
              onStageAll={() => run("stage", () => api.stageAll(data.path))}
              onUnstageAll={() => run("unstage", () => api.unstageAll(data.path))}
              onCommit={commit}
            />
          )}
        </div>
      </>
    );

  return (
    <div className="app">
      <TabBar
        tabs={s.tabs}
        active={s.activeTab}
        newTabOpen={showNew && s.tabs.length > 0 ? newTab : showNew}
        onSelect={(i) => {
          persist({ ...s, activeTab: i });
          setNewTab(false);
        }}
        onClose={closeTab}
        onAdd={() => setNewTab(true)}
      />
      {body}
      <footer className="statusbar">
        <span className={`dot${busy ? " busy" : message.kind === "error" ? " error" : ""}`} />
        <span className="msg" title={message.text}>{busy ? "En cours…" : message.text}</span>
        {!showNew && <span>{profile ? `${profile.label}${profile.login ? ` · ${profile.login}` : ""}` : "Config Git du dépôt"}</span>}
        {!showNew && !merging && <span>Double-clic : checkout · Clic droit : actions</span>}
      </footer>

      {createFrom && (
        <CreateBranchDialog base={createFrom} prefix={branchPrefix} onCancel={() => setCreateFrom(null)} onCreate={createBranch} />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirm={confirm.confirm}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            c.action();
          }}
        />
      )}
      {profilesOpen && (
        <ProfilesDialog
          profiles={s.profiles}
          defaultId={s.defaultProfile}
          onClose={() => setProfilesOpen(false)}
          onSave={(profiles, defaultId) => {
            const ids = new Set(profiles.map((p) => p.id));
            const repoProfiles = Object.fromEntries(Object.entries(s.repoProfiles).filter(([, id]) => ids.has(id)));
            persist({ ...s, profiles, defaultProfile: defaultId, repoProfiles });
            setProfilesOpen(false);
            notify("Profils enregistrés", "success");
          }}
        />
      )}
      {toast && (
        <div className="toast error" role="alert" key={toast.id}>
          <span className="body">{toast.text}</span>
          <button className="x" aria-label="Fermer" onClick={() => setToast(null)}>
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
