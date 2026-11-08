import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { X } from "lucide-react";
import {
  api,
  type Branches,
  type CommitDetails,
  type CommitFile,
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
import { CommitPanel } from "./components/CommitPanel";
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
  body: React.ReactNode;
  confirm: string;
  danger?: boolean;
  action: () => void;
}

const EMPTY_SETTINGS: Settings = { tabs: [], activeTab: 0, profiles: [], defaultProfile: null, repoProfiles: {} };

function BranchList({ names }: { names: string[] }) {
  const shown = names.slice(0, 8);
  return (
    <ul className="branch-list">
      {shown.map((n) => (
        <li key={n} className="mono">{n}</li>
      ))}
      {names.length > shown.length && <li className="more">et {names.length - shown.length} autre{names.length - shown.length > 1 ? "s" : ""}</li>}
    </ul>
  );
}

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
  // Browsing: a branch shown without checkout, a past commit, and one of its files.
  const [viewBranch, setViewBranch] = useState<string | null>(null);
  const viewBranchRef = useRef<string | null>(null);
  viewBranchRef.current = viewBranch;
  const [commitSha, setCommitSha] = useState<string | null>(null);
  const [commitView, setCommitView] = useState<{ details: CommitDetails | null; error: string | null }>({ details: null, error: null });
  const [commitFile, setCommitFile] = useState<CommitFile | null>(null);
  const [commitDiff, setCommitDiff] = useState<{ diff: FileDiff | null; error: string | null }>({ diff: null, error: null });

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
        // A branch that vanished (deleted elsewhere) falls back to the current one.
        api.history(path, viewBranchRef.current).catch(() => {
          setViewBranch(null);
          return api.history(path);
        }),
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

  // Background fetch, like GitKraken: at most once a minute per repository, never
  // while another fetch or a Git operation (pull, push, merge…) is running.
  const FETCH_EVERY = 60 * 1000;
  const lastFetch = useRef(new Map<string, number>());
  const fetching = useRef(new Set<string>());
  const busyRef = useRef<string | null>(null);
  busyRef.current = busy;
  const autoFetch = useCallback(
    async (path: string, force = false) => {
      const last = lastFetch.current.get(path) ?? 0;
      if (fetching.current.has(path) || (!force && (busyRef.current || Date.now() - last < FETCH_EVERY))) return;
      fetching.current.add(path);
      lastFetch.current.set(path, Date.now());
      try {
        await api.fetch(path, identityRef.current);
        await load(path);
      } finally {
        fetching.current.delete(path);
      }
    },
    [load],
  );

  useEffect(() => {
    setData(null);
    setSelected(null);
    setLoadError(null);
    setViewBranch(null);
    viewBranchRef.current = null;
    setCommitSha(null);
    if (!activePath) return;
    load(activePath);
    let alive = true;
    autoFetch(activePath, true).catch(
      () => alive && setMessage({ text: "Fetch impossible : les branches distantes ne sont peut-être pas à jour", kind: "info" }),
    );
    return () => {
      alive = false;
    };
  }, [activePath, load, autoFetch]);

  useEffect(() => {
    if (!activePath) return;
    // Coming back to the window: refresh local state now, and fetch if the last one is over a minute old.
    const onFocus = () => {
      load(activePath);
      autoFetch(activePath).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => document.hasFocus() && load(activePath), 20000);
    // Checked every 15 s; autoFetch itself keeps it to one fetch a minute.
    const fetchPoll = setInterval(() => autoFetch(activePath).catch(() => {}), 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
      clearInterval(fetchPoll);
    };
  }, [activePath, load, autoFetch]);

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

  // Reload the history when another branch is picked in the sidebar.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (activePath) load(activePath);
    setCommitSha(null);
  }, [viewBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Details of the selected past commit.
  useEffect(() => {
    setCommitFile(null);
    if (!commitSha || !activePath) {
      setCommitView({ details: null, error: null });
      return;
    }
    let alive = true;
    setCommitView({ details: null, error: null });
    api
      .commitDetails(activePath, commitSha)
      .then((details) => alive && setCommitView({ details, error: null }))
      .catch((e) => alive && setCommitView({ details: null, error: errorText(e) }));
    return () => {
      alive = false;
    };
  }, [commitSha, activePath]);

  // Diff of one file in that commit.
  useEffect(() => {
    if (!commitFile || !commitSha || !activePath) {
      setCommitDiff({ diff: null, error: null });
      return;
    }
    let alive = true;
    setCommitDiff({ diff: null, error: null });
    api
      .commitFileDiff(activePath, commitSha, commitFile.path, commitFile.oldPath)
      .then((diff) => alive && setCommitDiff({ diff, error: null }))
      .catch((e) => alive && setCommitDiff({ diff: null, error: errorText(e) }));
    return () => {
      alive = false;
    };
  }, [commitFile, commitSha, activePath]);

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
    if (op === "fetch") {
      lastFetch.current.set(activePath, Date.now());
      run("fetch", () => api.fetch(activePath, id), "Branches distantes à jour");
    }
    if (op === "stash") {
      if (!changes) return notify("Rien à mettre de côté");
      run("stash", () => api.stashPush(activePath, id), `${changes} fichier${changes > 1 ? "s" : ""} mis de côté`);
    }
    if (op === "pop") {
      if (!data?.stashes.length) return notify("Aucun stash à réappliquer");
      run("pop", () => api.stashPop(activePath, id), "Stash réappliqué");
    }
  };

  // Deletes several local branches. Unmerged ones are kept and offered for a forced delete.
  const deleteBranches = async (names: string[], force: boolean) => {
    if (!activePath || !names.length) return;
    const path = activePath;
    setBusy("delete");
    setMessage({ text: `Suppression de ${names.length} branche${names.length > 1 ? "s" : ""}…`, kind: "info" });
    const deleted: string[] = [];
    const unmerged: string[] = [];
    const failed: string[] = [];
    for (const name of names) {
      try {
        await api.deleteBranch(path, name, force, identityRef.current);
        deleted.push(name);
      } catch (e) {
        const msg = errorText(e);
        if (!force && /not fully merged|pas totalement fusionn/i.test(msg)) unmerged.push(name);
        else failed.push(`${name} : ${msg}`);
      }
    }
    setBusy(null);
    await load(path);
    if (failed.length) notify(failed.join("\n"), "error");
    else if (deleted.length)
      notify(deleted.length === 1 ? `Branche ${deleted[0]} supprimée` : `${deleted.length} branches supprimées`, "success");
    if (unmerged.length)
      setConfirm({
        title: unmerged.length === 1 ? "Cette branche n’est pas mergée" : `${unmerged.length} branches ne sont pas mergées`,
        body: (
          <>
            <p>
              {unmerged.length === 1 ? "Elle contient" : "Elles contiennent"} des commits qui ne sont dans aucune autre branche.
              Si tu {unmerged.length === 1 ? "la" : "les"} supprimes, ces commits seront perdus.
            </p>
            <BranchList names={unmerged} />
          </>
        ),
        confirm: "Supprimer quand même",
        danger: true,
        action: () => deleteBranches(unmerged, true),
      });
  };

  const askDeleteBranches = (names: string[]) => {
    const list = names.filter((n) => n !== currentBranch);
    if (!list.length) return notify("Tu ne peux pas supprimer la branche sur laquelle tu es");
    setConfirm({
      title: list.length === 1 ? `Supprimer ${list[0]} ?` : `Supprimer ${list.length} branches ?`,
      body:
        list.length === 1 ? (
          "La branche locale sera supprimée. La branche distante, si elle existe, n’est pas touchée."
        ) : (
          <>
            <p>Les branches locales seront supprimées. Les branches distantes ne sont pas touchées.</p>
            <BranchList names={list} />
          </>
        ),
      confirm: list.length === 1 ? "Supprimer" : `Supprimer ${list.length} branches`,
      danger: true,
      action: () => deleteBranches(list, false),
    });
  };

  const onBranchAction = (action: BranchAction, branch: string) => {
    if (!activePath) return;
    const id = identityRef.current;
    if (action === "checkout") {
      setViewBranch(null);
      run("checkout", () => api.checkout(activePath, branch, id), `Checkout de ${branch}`);
    }
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
    if (action === "delete") askDeleteBranches([branch]);
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
              onAction={onBranchAction}
              onDeleteMany={askDeleteBranches}
              onView={(b) => setViewBranch(b)}
              viewing={viewBranch}
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
            ) : commitFile && commitView.details ? (
              <DiffView
                file={commitFile.path}
                staged={false}
                diff={commitDiff.diff}
                error={commitDiff.error}
                readOnlyLabel={`Commit ${commitView.details.short}`}
                backLabel="Retour à l’historique"
                onBack={() => setCommitFile(null)}
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
                selectedSha={commitSha}
                onSelectCommit={(sha) => {
                  setCommitSha(sha);
                  if (sha) setSelected(null);
                }}
                viewing={viewBranch}
                current={currentBranch}
                onExitView={() => setViewBranch(null)}
              />
            )}
          </main>
          {!merging && commitSha && (
            <CommitPanel
              details={commitView.details}
              error={commitView.error}
              selectedFile={commitFile?.path ?? null}
              onOpenFile={(f) => setCommitFile(f)}
              onClose={() => setCommitSha(null)}
              onCopied={(sha) => notify(`SHA ${sha.slice(0, 7)} copié`, "success")}
            />
          )}
          {!merging && (
            <ChangesPanel
              hidden={!!commitSha}
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
