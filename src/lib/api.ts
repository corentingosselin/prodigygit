import { invoke } from "@tauri-apps/api/core";

export interface Profile {
  id: string;
  label: string;
  login: string;
  name: string;
  email: string;
  sshKey: string;
}

export interface Settings {
  tabs: string[];
  activeTab: number;
  profiles: Profile[];
  defaultProfile: string | null;
  repoProfiles: Record<string, string>;
}

export interface Identity {
  name?: string;
  email?: string;
  login?: string;
  sshKey?: string;
}

export interface RepoInfo {
  path: string;
  name: string;
  head: string | null;
  merging: boolean;
}

export interface LocalBranch {
  name: string;
  isHead: boolean;
  tip: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface RemoteBranch {
  name: string;
  tip: string | null;
}

export interface Branches {
  local: LocalBranch[];
  remote: RemoteBranch[];
}

export interface CommitInfo {
  sha: string;
  short: string;
  summary: string;
  author: string;
  time: number;
}

export interface History {
  head: string | null;
  base: string | null;
  mine: CommitInfo[];
  theirs: CommitInfo[];
  shared: CommitInfo[];
}

export interface FileChange {
  path: string;
  status: "A" | "M" | "D" | "R";
}

export interface StatusInfo {
  unstaged: FileChange[];
  staged: FileChange[];
  conflicted: string[];
}

export interface DiffLine {
  kind: "+" | "-" | " ";
  old: number | null;
  new: number | null;
  text: string;
}

export interface FileDiff {
  path: string;
  hunks: { header: string; lines: DiffLine[] }[];
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface StashEntry {
  index: number;
  message: string;
}

export type Segment =
  | { kind: "ctx"; lines: string[] }
  | { kind: "hunk"; ours: string[]; theirs: string[] };

export interface ConflictFile {
  path: string;
  segments: Segment[];
  wholeFile: boolean;
}

export const api = {
  loadSettings: () => invoke<Settings>("load_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  repoInfo: (path: string) => invoke<RepoInfo>("repo_info", { path }),
  initRepo: (path: string) => invoke<RepoInfo>("init_repo", { path }),
  cloneRepo: (url: string, parent: string, id: Identity) =>
    invoke<RepoInfo>("clone_repo", { url, parent, id }),
  branches: (path: string) => invoke<Branches>("branches", { path }),
  history: (path: string) => invoke<History>("history", { path }),
  status: (path: string) => invoke<StatusInfo>("status", { path }),
  diffFile: (path: string, file: string, staged: boolean) =>
    invoke<FileDiff>("diff_file", { path, file, staged }),
  stage: (path: string, files: string[]) => invoke<void>("stage", { path, files }),
  stageAll: (path: string) => invoke<void>("stage_all", { path }),
  unstage: (path: string, files: string[]) => invoke<void>("unstage", { path, files }),
  unstageAll: (path: string) => invoke<void>("unstage_all", { path }),
  discard: (path: string, file: string, id: Identity) =>
    invoke<void>("discard", { path, file, id }),
  commit: (path: string, summary: string, description: string, id: Identity) =>
    invoke<string>("commit", { path, summary, description, id }),
  checkout: (path: string, branch: string, id: Identity) =>
    invoke<void>("checkout", { path, branch, id }),
  createBranch: (path: string, name: string, base: string) =>
    invoke<void>("create_branch", { path, name, base }),
  deleteBranch: (path: string, name: string, force: boolean, id: Identity) =>
    invoke<void>("delete_branch", { path, name, force, id }),
  fetch: (path: string, id: Identity) => invoke<void>("fetch", { path, id }),
  pull: (path: string, id: Identity) => invoke<void>("pull", { path, id }),
  push: (path: string, id: Identity) => invoke<void>("push", { path, id }),
  stashList: (path: string, id: Identity) => invoke<StashEntry[]>("stash_list", { path, id }),
  stashPush: (path: string, id: Identity) => invoke<void>("stash_push", { path, id }),
  stashPop: (path: string, id: Identity) => invoke<void>("stash_pop", { path, id }),
  merge: (path: string, branch: string, id: Identity) =>
    invoke<{ conflicted: string[] }>("merge", { path, branch, id }),
  mergeAbort: (path: string, id: Identity) => invoke<void>("merge_abort", { path, id }),
  mergeContinue: (path: string, id: Identity) => invoke<void>("merge_continue", { path, id }),
  conflictFile: (path: string, file: string) =>
    invoke<ConflictFile>("conflict_file", { path, file }),
  resolveWithContent: (path: string, file: string, content: string) =>
    invoke<void>("resolve_with_content", { path, file, content }),
  resolveWithSide: (path: string, file: string, side: "a" | "b", id: Identity) =>
    invoke<void>("resolve_with_side", { path, file, side, id }),
};
