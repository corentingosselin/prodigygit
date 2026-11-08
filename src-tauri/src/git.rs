use git2::{
    BranchType, DiffFormat, DiffOptions, IndexAddOption, Oid, Repository, RepositoryState,
    Signature, Sort, Status, StatusOptions,
};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

pub type R<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

pub fn open(path: &str) -> R<Repository> {
    Repository::open(path).map_err(|_| format!("{path} n'est pas un dépôt Git"))
}

/// Identity and credentials applied to the git CLI for one repository.
#[derive(Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub name: Option<String>,
    pub email: Option<String>,
    pub login: Option<String>,
    pub ssh_key: Option<String>,
}

impl GitIdentity {
    fn config_args(&self) -> Vec<String> {
        let mut args = Vec::new();
        if let Some(n) = self.name.as_deref().filter(|s| !s.is_empty()) {
            args.extend(["-c".into(), format!("user.name={n}")]);
        }
        if let Some(m) = self.email.as_deref().filter(|s| !s.is_empty()) {
            args.extend(["-c".into(), format!("user.email={m}")]);
        }
        if let Some(l) = self.login.as_deref().filter(|s| !s.is_empty()) {
            // Lets the macOS keychain pick the token of this GitHub account.
            args.extend(["-c".into(), format!("credential.https://github.com.username={l}")]);
        }
        args
    }

    fn env(&self) -> Vec<(String, String)> {
        let mut env = vec![("GIT_TERMINAL_PROMPT".to_string(), "0".to_string())];
        if let Some(k) = self.ssh_key.as_deref().filter(|s| !s.is_empty()) {
            env.push((
                "GIT_SSH_COMMAND".into(),
                format!("ssh -i \"{k}\" -o IdentitiesOnly=yes"),
            ));
        }
        env
    }
}

/// Runs the git CLI in `dir` and returns stdout, or stderr as the error.
pub fn git(dir: &str, id: &GitIdentity, args: &[&str]) -> R<String> {
    let mut cmd = Command::new("git");
    cmd.args(id.config_args());
    // For commands that reach the remote, hand Git the token gh holds for this
    // profile's account, so each repository pushes as its own GitHub account.
    // Without gh (or without that account in gh), Git falls back to the keychain.
    let network = matches!(args.first(), Some(&("fetch" | "pull" | "push" | "clone" | "ls-remote")));
    let token = network
        .then(|| id.login.as_deref().filter(|l| !l.is_empty()))
        .flatten()
        .and_then(|l| crate::gh::token_for(l).map(|t| (l.to_string(), t)));
    if let Some((login, token)) = token {
        cmd.args([
            "-c",
            "credential.https://github.com.helper=",
            "-c",
            "credential.https://github.com.helper=!f() { test \"$1\" = get && echo username=\"$PRODIGYGIT_GH_LOGIN\" && echo password=\"$PRODIGYGIT_GH_TOKEN\"; }; f",
        ]);
        cmd.env("PRODIGYGIT_GH_LOGIN", login).env("PRODIGYGIT_GH_TOKEN", token);
    }
    cmd.args(args).current_dir(dir);
    for (k, v) in id.env() {
        cmd.env(k, v);
    }
    let out = cmd
        .output()
        .map_err(|err| format!("Impossible de lancer git : {err}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

// ---------------------------------------------------------------- repo info

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head: Option<String>,
    pub merging: bool,
}

pub fn repo_info(path: &str) -> R<RepoInfo> {
    let repo = open(path)?;
    let workdir = repo
        .workdir()
        .ok_or("Les dépôts bare ne sont pas pris en charge")?
        .to_path_buf();
    let name = workdir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let head = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(str::to_string));
    Ok(RepoInfo {
        path: workdir.to_string_lossy().trim_end_matches('/').to_string(),
        name,
        head,
        merging: repo.state() == RepositoryState::Merge,
    })
}

pub fn init_repo(path: &str) -> R<RepoInfo> {
    Repository::init(path).map_err(e)?;
    repo_info(path)
}

pub fn clone_repo(url: &str, parent: &str, id: &GitIdentity) -> R<RepoInfo> {
    let name = url
        .trim_end_matches('/')
        .rsplit(['/', ':'])
        .next()
        .unwrap_or("depot")
        .trim_end_matches(".git")
        .to_string();
    if name.is_empty() {
        return Err("URL de dépôt invalide".into());
    }
    let dest = Path::new(parent).join(&name);
    if dest.exists() {
        return Err(format!("Le dossier {} existe déjà", dest.display()));
    }
    git(parent, id, &["clone", url, &name])?;
    repo_info(&dest.to_string_lossy())
}

// ---------------------------------------------------------------- branches

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranch {
    pub name: String,
    pub is_head: bool,
    pub tip: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranch {
    pub name: String,
    pub tip: Option<String>,
}

#[derive(Serialize)]
pub struct Branches {
    pub local: Vec<LocalBranch>,
    pub remote: Vec<RemoteBranch>,
}

pub fn branches(path: &str) -> R<Branches> {
    let repo = open(path)?;
    let mut local = Vec::new();
    for item in repo.branches(Some(BranchType::Local)).map_err(e)? {
        let (b, _) = item.map_err(e)?;
        let Some(name) = b.name().ok().flatten().map(str::to_string) else {
            continue;
        };
        let tip = b.get().target();
        let up = b.upstream().ok();
        let upstream = up
            .as_ref()
            .and_then(|u| u.name().ok().flatten().map(str::to_string));
        let (ahead, behind) = match (tip, up.as_ref().and_then(|u| u.get().target())) {
            (Some(l), Some(u)) => repo.graph_ahead_behind(l, u).unwrap_or((0, 0)),
            _ => (0, 0),
        };
        local.push(LocalBranch {
            name,
            is_head: b.is_head(),
            tip: tip.map(|o| o.to_string()),
            upstream,
            ahead,
            behind,
        });
    }
    let mut remote = Vec::new();
    for item in repo.branches(Some(BranchType::Remote)).map_err(e)? {
        let (b, _) = item.map_err(e)?;
        let Some(name) = b.name().ok().flatten().map(str::to_string) else {
            continue;
        };
        if name.ends_with("/HEAD") {
            continue;
        }
        remote.push(RemoteBranch {
            name,
            tip: b.get().target().map(|o| o.to_string()),
        });
    }
    local.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    remote.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(Branches { local, remote })
}

pub fn create_branch(path: &str, name: &str, base: &str) -> R<()> {
    let repo = open(path)?;
    let commit = repo
        .revparse_single(base)
        .and_then(|o| o.peel_to_commit())
        .map_err(|_| format!("Branche de départ introuvable : {base}"))?;
    repo.branch(name, &commit, false).map_err(|err| {
        if err.code() == git2::ErrorCode::Exists {
            "Cette branche existe déjà".to_string()
        } else {
            e(err)
        }
    })?;
    Ok(())
}

pub fn checkout(path: &str, branch: &str, id: &GitIdentity) -> R<()> {
    let repo = open(path)?;
    let is_remote = repo.find_branch(branch, BranchType::Remote).is_ok()
        && repo.find_branch(branch, BranchType::Local).is_err();
    if is_remote {
        let local = branch.split_once('/').map(|(_, b)| b).unwrap_or(branch);
        if repo.find_branch(local, BranchType::Local).is_ok() {
            git(path, id, &["checkout", local])?;
        } else {
            git(path, id, &["checkout", "--track", branch])?;
        }
    } else {
        git(path, id, &["checkout", branch])?;
    }
    Ok(())
}

pub fn delete_branch(path: &str, name: &str, force: bool, id: &GitIdentity) -> R<()> {
    git(path, id, &["branch", if force { "-D" } else { "-d" }, name]).map(|_| ())
}

// ---------------------------------------------------------------- history

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub sha: String,
    pub short: String,
    pub summary: String,
    pub author: String,
    pub time: i64,
    /// Lines added and removed against the first parent, filled for recent commits only.
    pub stats: Option<[usize; 2]>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub head: Option<String>,
    /// Branch the current branch is compared with (develop, main or master).
    pub base: Option<String>,
    /// Commits on the current branch that the base does not have.
    pub mine: Vec<CommitInfo>,
    /// Commits on the base that the current branch does not have.
    pub theirs: Vec<CommitInfo>,
    /// History shared by both, starting at the fork point.
    pub shared: Vec<CommitInfo>,
    /// Upstream of the shown branch ("origin/x"), when it is a local branch that has one.
    pub upstream: Option<String>,
    /// Local branch never pushed: none of its commits are on the remote.
    pub unpublished: bool,
    /// Commits of the shown branch that its upstream does not have yet.
    pub unpushed: Vec<String>,
}

fn commit_info(repo: &Repository, oid: Oid) -> Option<CommitInfo> {
    let c = repo.find_commit(oid).ok()?;
    let sha = oid.to_string();
    Some(CommitInfo {
        short: sha[..7].to_string(),
        sha,
        summary: c.summary().unwrap_or("").to_string(),
        author: c.author().name().unwrap_or("").to_string(),
        time: c.time().seconds(),
        stats: None,
    })
}

/// Lines added and removed by a commit, against its first parent.
fn commit_stats(repo: &Repository, sha: &str) -> Option<[usize; 2]> {
    let c = repo.find_commit(Oid::from_str(sha).ok()?).ok()?;
    let tree = c.tree().ok()?;
    let parent = if c.parent_count() > 0 { Some(c.parent(0).ok()?.tree().ok()?) } else { None };
    let mut opts = DiffOptions::new();
    opts.context_lines(0);
    let diff = repo.diff_tree_to_tree(parent.as_ref(), Some(&tree), Some(&mut opts)).ok()?;
    let st = diff.stats().ok()?;
    Some([st.insertions(), st.deletions()])
}

/// Fills `stats` on the first commits of `list`, within a time budget so a huge
/// monorepo commit never stalls the history.
fn fill_stats(repo: &Repository, list: &mut [CommitInfo], max: usize, budget: std::time::Duration) {
    let start = std::time::Instant::now();
    for c in list.iter_mut().take(max) {
        if start.elapsed() > budget {
            break;
        }
        c.stats = commit_stats(repo, &c.sha);
    }
}

fn walk(repo: &Repository, push: Oid, hide: Option<Oid>, limit: usize) -> R<Vec<CommitInfo>> {
    let mut rw = repo.revwalk().map_err(e)?;
    rw.set_sorting(Sort::TOPOLOGICAL | Sort::TIME).map_err(e)?;
    rw.push(push).map_err(e)?;
    if let Some(h) = hide {
        rw.hide(h).map_err(e)?;
    }
    Ok(rw
        .filter_map(Result::ok)
        .take(limit)
        .filter_map(|oid| commit_info(repo, oid))
        .collect())
}

fn find_base(repo: &Repository, head_name: Option<&str>) -> Option<(String, Oid)> {
    for cand in ["develop", "main", "master"] {
        let bare = head_name.map(|h| h.split_once('/').filter(|(r, _)| *r == "origin").map_or(h, |(_, b)| b));
        if Some(cand) == bare {
            continue;
        }
        for full in [format!("refs/heads/{cand}"), format!("refs/remotes/origin/{cand}")] {
            if let Ok(r) = repo.find_reference(&full)
                && let Some(oid) = r.target()
            {
                let short = full
                    .trim_start_matches("refs/heads/")
                    .trim_start_matches("refs/remotes/")
                    .to_string();
                return Some((short, oid));
            }
        }
    }
    None
}

/// History of HEAD, or of `branch` (a local or remote branch name) when given.
pub fn history(path: &str, branch: Option<&str>) -> R<History> {
    let repo = open(path)?;
    let (head_name, head_oid) = if let Some(b) = branch {
        let oid = repo
            .revparse_single(b)
            .and_then(|o| o.peel_to_commit())
            .map_err(|_| format!("Branche introuvable : {b}"))?
            .id();
        (Some(b.to_string()), oid)
    } else {
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => {
                return Ok(History {
                    head: None,
                    base: None,
                    mine: vec![],
                    theirs: vec![],
                    shared: vec![],
                    upstream: None,
                    unpublished: false,
                    unpushed: vec![],
                });
            }
        };
        (head.shorthand().map(str::to_string), head.target().ok_or("HEAD invalide")?)
    };
    let base = find_base(&repo, head_name.as_deref());
    let mut h = match base {
        Some((base_name, base_oid)) => {
            let fork = repo.merge_base(head_oid, base_oid).ok();
            let (mine, theirs, shared) = match fork {
                Some(f) => (
                    walk(&repo, head_oid, Some(f), 300)?,
                    walk(&repo, base_oid, Some(f), 300)?,
                    walk(&repo, f, None, 150)?,
                ),
                None => (walk(&repo, head_oid, None, 300)?, vec![], vec![]),
            };
            History {
                head: head_name.clone(),
                base: Some(base_name),
                mine,
                theirs,
                shared,
                upstream: None,
                unpublished: false,
                unpushed: vec![],
            }
        }
        None => History {
            head: head_name.clone(),
            base: None,
            mine: vec![],
            theirs: vec![],
            shared: walk(&repo, head_oid, None, 300)?,
            upstream: None,
            unpublished: false,
            unpushed: vec![],
        },
    };

    // Pushed or not: only meaningful for a local branch.
    if let Some(local) = head_name.as_deref().and_then(|n| repo.find_branch(n, BranchType::Local).ok()) {
        match local.upstream() {
            Ok(up) => {
                h.upstream = up.name().ok().flatten().map(str::to_string);
                if let Some(up_oid) = up.get().target() {
                    let mut rw = repo.revwalk().map_err(e)?;
                    rw.push(head_oid).map_err(e)?;
                    rw.hide(up_oid).map_err(e)?;
                    h.unpushed = rw.filter_map(Result::ok).take(300).map(|o| o.to_string()).collect();
                }
            }
            Err(_) => h.unpublished = true,
        }
    }

    let budget = std::time::Duration::from_millis(400);
    if h.base.is_some() {
        fill_stats(&repo, &mut h.mine, 60, budget);
    } else {
        fill_stats(&repo, &mut h.shared, 30, budget);
    }
    Ok(h)
}

// ---------------------------------------------------------------- status

#[derive(Serialize)]
pub struct FileChange {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct StatusInfo {
    pub unstaged: Vec<FileChange>,
    pub staged: Vec<FileChange>,
    pub conflicted: Vec<String>,
}

pub fn status(path: &str) -> R<StatusInfo> {
    let repo = open(path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(e)?;
    let mut info = StatusInfo {
        unstaged: vec![],
        staged: vec![],
        conflicted: vec![],
    };
    for entry in statuses.iter() {
        let Some(p) = entry.path().map(str::to_string) else {
            continue;
        };
        let s = entry.status();
        if s.is_conflicted() {
            info.conflicted.push(p);
            continue;
        }
        let staged = if s.contains(Status::INDEX_NEW) {
            Some("A")
        } else if s.contains(Status::INDEX_DELETED) {
            Some("D")
        } else if s.contains(Status::INDEX_RENAMED) {
            Some("R")
        } else if s.intersects(Status::INDEX_MODIFIED | Status::INDEX_TYPECHANGE) {
            Some("M")
        } else {
            None
        };
        let unstaged = if s.contains(Status::WT_NEW) {
            Some("A")
        } else if s.contains(Status::WT_DELETED) {
            Some("D")
        } else if s.contains(Status::WT_RENAMED) {
            Some("R")
        } else if s.intersects(Status::WT_MODIFIED | Status::WT_TYPECHANGE) {
            Some("M")
        } else {
            None
        };
        if let Some(st) = staged {
            info.staged.push(FileChange { path: p.clone(), status: st.into() });
        }
        if let Some(st) = unstaged {
            info.unstaged.push(FileChange { path: p, status: st.into() });
        }
    }
    Ok(info)
}

pub fn stage(path: &str, files: &[String]) -> R<()> {
    let repo = open(path)?;
    let workdir = repo.workdir().ok_or("Dépôt sans dossier de travail")?.to_path_buf();
    let mut index = repo.index().map_err(e)?;
    for f in files {
        if workdir.join(f).exists() {
            index.add_path(Path::new(f)).map_err(e)?;
        } else {
            index.remove_path(Path::new(f)).map_err(e)?;
        }
    }
    index.write().map_err(e)
}

pub fn stage_all(path: &str) -> R<()> {
    let repo = open(path)?;
    let mut index = repo.index().map_err(e)?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(e)?;
    index.update_all(["*"].iter(), None).map_err(e)?;
    index.write().map_err(e)
}

pub fn unstage(path: &str, files: &[String]) -> R<()> {
    let repo = open(path)?;
    match repo.head().and_then(|h| h.peel_to_commit()) {
        Ok(head) => repo
            .reset_default(Some(head.as_object()), files.iter())
            .map_err(e),
        Err(_) => {
            // Unborn branch: nothing to reset to, drop the entries from the index.
            let mut index = repo.index().map_err(e)?;
            for f in files {
                index.remove_path(Path::new(f)).map_err(e)?;
            }
            index.write().map_err(e)
        }
    }
}

pub fn unstage_all(path: &str) -> R<()> {
    let files: Vec<String> = status(path)?.staged.into_iter().map(|f| f.path).collect();
    if files.is_empty() {
        return Ok(());
    }
    unstage(path, &files)
}

pub fn discard(path: &str, file: &str, id: &GitIdentity) -> R<()> {
    let repo = open(path)?;
    let tracked = repo
        .head()
        .and_then(|h| h.peel_to_tree())
        .map(|t| t.get_path(Path::new(file)).is_ok())
        .unwrap_or(false);
    if tracked {
        git(path, id, &["checkout", "--", file]).map(|_| ())
    } else {
        let full = repo.workdir().ok_or("Dépôt sans dossier de travail")?.join(file);
        std::fs::remove_file(full).map_err(e)
    }
}

pub fn commit(path: &str, summary: &str, description: &str, id: &GitIdentity) -> R<String> {
    let summary = summary.trim();
    if summary.is_empty() {
        return Err("Écris un message de commit".into());
    }
    let repo = open(path)?;
    let mut index = repo.index().map_err(e)?;
    if index.has_conflicts() {
        return Err("Résous les conflits avant de committer".into());
    }
    let tree = repo
        .find_tree(index.write_tree().map_err(e)?)
        .map_err(e)?;
    let sig = match (id.name.as_deref(), id.email.as_deref()) {
        (Some(n), Some(m)) if !n.is_empty() && !m.is_empty() => Signature::now(n, m).map_err(e)?,
        _ => repo
            .signature()
            .map_err(|_| "Configure ton nom et ton email dans le profil".to_string())?,
    };
    let mut parents = Vec::new();
    if let Ok(head) = repo.head().and_then(|h| h.peel_to_commit()) {
        if head.tree_id() == tree.id() && repo.state() != RepositoryState::Merge {
            return Err("Aucun fichier stagé".into());
        }
        parents.push(head);
    }
    let merging = repo.state() == RepositoryState::Merge;
    if merging {
        let merge_head = std::fs::read_to_string(repo.path().join("MERGE_HEAD")).unwrap_or_default();
        for line in merge_head.lines() {
            if let Ok(c) = Oid::from_str(line.trim()).and_then(|oid| repo.find_commit(oid)) {
                parents.push(c);
            }
        }
    }
    let mut message = summary.to_string();
    if !description.trim().is_empty() {
        message.push_str("\n\n");
        message.push_str(description.trim());
    }
    let refs: Vec<&git2::Commit> = parents.iter().collect();
    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &refs)
        .map_err(e)?;
    if merging {
        repo.cleanup_state().map_err(e)?;
    }
    Ok(oid.to_string()[..7].to_string())
}

// ---------------------------------------------------------------- diff

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String,
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub text: String,
}

#[derive(Serialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Serialize)]
pub struct FileDiff {
    pub path: String,
    pub hunks: Vec<DiffHunk>,
    pub additions: usize,
    pub deletions: usize,
    pub binary: bool,
}

pub fn diff_file(path: &str, file: &str, staged: bool) -> R<FileDiff> {
    let repo = open(path)?;
    let mut opts = DiffOptions::new();
    opts.pathspec(file)
        .disable_pathspec_match(true)
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    let diff = if staged {
        let tree = repo.head().and_then(|h| h.peel_to_tree()).ok();
        repo.diff_tree_to_index(tree.as_ref(), None, Some(&mut opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
    }
    .map_err(e)?;
    collect_diff(&diff, file, None)
}

/// Turns a libgit2 diff into hunks and lines. With `only`, keeps the delta whose new path is `only`.
fn collect_diff(diff: &git2::Diff, file: &str, only: Option<&str>) -> R<FileDiff> {
    let mut out = FileDiff {
        path: file.to_string(),
        hunks: vec![],
        additions: 0,
        deletions: 0,
        binary: false,
    };
    diff.print(DiffFormat::Patch, |delta, _hunk, line| {
        if let Some(o) = only {
            let p = delta.new_file().path().or(delta.old_file().path());
            if p.and_then(|p| p.to_str()) != Some(o) {
                return true;
            }
        }
        if delta.flags().is_binary() {
            out.binary = true;
        }
        let text = String::from_utf8_lossy(line.content())
            .trim_end_matches(['\n', '\r'])
            .to_string();
        match line.origin() {
            'H' => out.hunks.push(DiffHunk { header: text, lines: vec![] }),
            c @ ('+' | '-' | ' ') => {
                if c == '+' {
                    out.additions += 1;
                } else if c == '-' {
                    out.deletions += 1;
                }
                if let Some(h) = out.hunks.last_mut() {
                    h.lines.push(DiffLine {
                        kind: c.to_string(),
                        old: line.old_lineno(),
                        new: line.new_lineno(),
                        text,
                    });
                }
            }
            'B' => out.binary = true,
            _ => {}
        }
        true
    })
    .map_err(e)?;
    Ok(out)
}

// ---------------------------------------------------------------- commit details

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub binary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub sha: String,
    pub short: String,
    pub summary: String,
    pub body: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub committer: String,
    pub parents: Vec<String>,
    pub files: Vec<CommitFile>,
}

/// Diff of a commit against its first parent (the empty tree for a root commit),
/// the same view GitHub and GitKraken give for merge commits.
fn commit_diff<'r>(repo: &'r Repository, sha: &str, paths: &[&str]) -> R<(git2::Commit<'r>, git2::Diff<'r>)> {
    let oid = Oid::from_str(sha).map_err(|_| format!("Commit invalide : {sha}"))?;
    let c = repo.find_commit(oid).map_err(|_| format!("Commit introuvable : {sha}"))?;
    let tree = c.tree().map_err(e)?;
    let parent = if c.parent_count() > 0 {
        Some(c.parent(0).and_then(|p| p.tree()).map_err(e)?)
    } else {
        None
    };
    let mut opts = DiffOptions::new();
    for p in paths {
        opts.pathspec(p);
    }
    if !paths.is_empty() {
        opts.disable_pathspec_match(true);
    }
    let mut diff = repo
        .diff_tree_to_tree(parent.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(e)?;
    diff.find_similar(None).map_err(e)?;
    Ok((c, diff))
}

pub fn commit_details(path: &str, sha: &str) -> R<CommitDetails> {
    let repo = open(path)?;
    let (c, diff) = commit_diff(&repo, sha, &[])?;
    let mut files = Vec::new();
    for (i, delta) in diff.deltas().enumerate() {
        let new_path = delta.new_file().path().and_then(|p| p.to_str()).map(str::to_string);
        let old_path = delta.old_file().path().and_then(|p| p.to_str()).map(str::to_string);
        let status = match delta.status() {
            git2::Delta::Added => "A",
            git2::Delta::Deleted => "D",
            git2::Delta::Renamed => "R",
            _ => "M",
        };
        let (mut additions, mut deletions, mut binary) = (0, 0, delta.flags().is_binary());
        if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, i) {
            if let Ok((_, a, d)) = patch.line_stats() {
                additions = a;
                deletions = d;
            }
            binary |= patch.delta().flags().is_binary();
        }
        let path = new_path.clone().or(old_path.clone()).unwrap_or_default();
        files.push(CommitFile {
            old_path: if status == "R" { old_path } else { None },
            path,
            status: status.into(),
            additions,
            deletions,
            binary,
        });
    }
    let sha = c.id().to_string();
    let message = c.message().unwrap_or("");
    let body = message
        .split_once('\n')
        .map(|(_, rest)| rest.trim().to_string())
        .unwrap_or_default();
    Ok(CommitDetails {
        short: sha[..7].to_string(),
        summary: c.summary().unwrap_or("").to_string(),
        body,
        author: c.author().name().unwrap_or("").to_string(),
        email: c.author().email().unwrap_or("").to_string(),
        time: c.time().seconds(),
        committer: c.committer().name().unwrap_or("").to_string(),
        parents: c.parent_ids().map(|p| p.to_string()[..7].to_string()).collect(),
        files,
        sha,
    })
}

pub fn commit_file_diff(path: &str, sha: &str, file: &str, old_path: Option<&str>) -> R<FileDiff> {
    let repo = open(path)?;
    let mut paths = vec![file];
    if let Some(o) = old_path.filter(|o| *o != file) {
        paths.push(o);
    }
    let (_, diff) = commit_diff(&repo, sha, &paths)?;
    collect_diff(&diff, file, Some(file))
}

// ---------------------------------------------------------------- remote ops

fn has_upstream(path: &str, id: &GitIdentity) -> bool {
    git(path, id, &["rev-parse", "--abbrev-ref", "@{u}"]).is_ok()
}

pub fn fetch(path: &str, id: &GitIdentity) -> R<()> {
    git(path, id, &["fetch", "--all", "--prune"]).map(|_| ())
}

pub fn pull(path: &str, id: &GitIdentity) -> R<()> {
    if !has_upstream(path, id) {
        return Err("Cette branche n'a pas encore de branche distante. Fais d'abord un push.".into());
    }
    git(path, id, &["pull", "--no-rebase", "--no-edit"]).map(|_| ())
}

pub fn push(path: &str, id: &GitIdentity) -> R<()> {
    if has_upstream(path, id) {
        git(path, id, &["push"]).map(|_| ())
    } else {
        git(path, id, &["push", "-u", "origin", "HEAD"]).map(|_| ())
    }
}

// ---------------------------------------------------------------- stash

#[derive(Serialize)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
}

pub fn stash_list(path: &str, id: &GitIdentity) -> R<Vec<StashEntry>> {
    let out = git(path, id, &["stash", "list", "--format=%s"])?;
    Ok(out
        .lines()
        .enumerate()
        .map(|(index, l)| StashEntry { index, message: l.to_string() })
        .collect())
}

pub fn stash_push(path: &str, id: &GitIdentity) -> R<()> {
    git(path, id, &["stash", "push", "--include-untracked"]).map(|_| ())
}

pub fn stash_pop(path: &str, id: &GitIdentity) -> R<()> {
    git(path, id, &["stash", "pop"]).map(|_| ())
}

// ---------------------------------------------------------------- merge

#[derive(Serialize)]
pub struct MergeResult {
    pub conflicted: Vec<String>,
}

pub fn merge(path: &str, branch: &str, id: &GitIdentity) -> R<MergeResult> {
    match git(path, id, &["merge", "--no-edit", branch]) {
        Ok(_) => Ok(MergeResult { conflicted: vec![] }),
        Err(msg) => {
            let conflicted = status(path)?.conflicted;
            if conflicted.is_empty() {
                Err(msg)
            } else {
                Ok(MergeResult { conflicted })
            }
        }
    }
}

pub fn merge_abort(path: &str, id: &GitIdentity) -> R<()> {
    git(path, id, &["merge", "--abort"]).map(|_| ())
}

pub fn merge_continue(path: &str, id: &GitIdentity) -> R<()> {
    git(path, id, &["commit", "--no-edit"]).map(|_| ())
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Segment {
    Ctx { lines: Vec<String> },
    Hunk { ours: Vec<String>, theirs: Vec<String> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub segments: Vec<Segment>,
    /// True when the file has no text markers (binary, deleted on one side...).
    pub whole_file: bool,
}

/// Splits a file containing `<<<<<<<` / `=======` / `>>>>>>>` markers into
/// shared context and conflicting hunks. A diff3 base section is dropped.
pub fn parse_conflict(content: &str) -> Vec<Segment> {
    enum State {
        Ctx,
        Ours,
        Base,
        Theirs,
    }
    let mut segs = Vec::new();
    let mut ctx: Vec<String> = Vec::new();
    let mut ours: Vec<String> = Vec::new();
    let mut theirs: Vec<String> = Vec::new();
    let mut state = State::Ctx;
    for line in content.split('\n') {
        match state {
            State::Ctx if line.starts_with("<<<<<<<") => {
                if !ctx.is_empty() {
                    segs.push(Segment::Ctx { lines: std::mem::take(&mut ctx) });
                }
                state = State::Ours;
            }
            State::Ctx => ctx.push(line.to_string()),
            State::Ours if line.starts_with("|||||||") => state = State::Base,
            State::Ours | State::Base if line.starts_with("=======") => state = State::Theirs,
            State::Ours => ours.push(line.to_string()),
            State::Base => {}
            State::Theirs if line.starts_with(">>>>>>>") => {
                segs.push(Segment::Hunk {
                    ours: std::mem::take(&mut ours),
                    theirs: std::mem::take(&mut theirs),
                });
                state = State::Ctx;
            }
            State::Theirs => theirs.push(line.to_string()),
        }
    }
    if !ctx.is_empty() {
        segs.push(Segment::Ctx { lines: ctx });
    }
    segs
}

pub fn conflict_file(path: &str, file: &str) -> R<ConflictFile> {
    let full = Path::new(path).join(file);
    let content = std::fs::read(&full).ok().and_then(|b| String::from_utf8(b).ok());
    let segments = content.as_deref().map(parse_conflict).unwrap_or_default();
    let whole_file = !segments.iter().any(|s| matches!(s, Segment::Hunk { .. }));
    Ok(ConflictFile { path: file.to_string(), segments, whole_file })
}

pub fn resolve_with_content(path: &str, file: &str, content: &str) -> R<()> {
    std::fs::write(Path::new(path).join(file), content).map_err(e)?;
    stage(path, &[file.to_string()])
}

pub fn resolve_with_side(path: &str, file: &str, side: &str, id: &GitIdentity) -> R<()> {
    let flag = if side == "a" { "--ours" } else { "--theirs" };
    match git(path, id, &["checkout", flag, "--", file]) {
        Ok(_) => stage(path, &[file.to_string()]),
        // The chosen side deleted the file.
        Err(_) => git(path, id, &["rm", "--", file]).map(|_| ()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_conflict_markers() {
        let src = "a\n<<<<<<< HEAD\nours1\nours2\n=======\ntheirs\n>>>>>>> develop\nb";
        assert_eq!(
            parse_conflict(src),
            vec![
                Segment::Ctx { lines: vec!["a".into()] },
                Segment::Hunk {
                    ours: vec!["ours1".into(), "ours2".into()],
                    theirs: vec!["theirs".into()]
                },
                Segment::Ctx { lines: vec!["b".into()] },
            ]
        );
    }

    #[test]
    fn drops_diff3_base() {
        let src = "<<<<<<< HEAD\nx\n||||||| base\nold\n=======\ny\n>>>>>>> other";
        assert_eq!(
            parse_conflict(src),
            vec![Segment::Hunk { ours: vec!["x".into()], theirs: vec!["y".into()] }]
        );
    }

    fn sh(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(["-c", "user.name=T", "-c", "user.email=t@t", "-c", "init.defaultBranch=main"])
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "git {args:?} failed");
    }

    #[test]
    fn end_to_end_branch_commit_merge_conflict() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path();
        let ps = p.to_str().unwrap();
        let id = GitIdentity {
            name: Some("Test".into()),
            email: Some("test@example.com".into()),
            ..Default::default()
        };
        sh(p, &["init"]);
        std::fs::write(p.join("f.txt"), "one\ntwo\n").unwrap();
        stage_all(ps).unwrap();
        commit(ps, "init", "", &id).unwrap();
        sh(p, &["branch", "-M", "develop"]);

        create_branch(ps, "me/feature", "develop").unwrap();
        checkout(ps, "me/feature", &id).unwrap();
        std::fs::write(p.join("f.txt"), "one\nmine\n").unwrap();
        let st = status(ps).unwrap();
        assert_eq!(st.unstaged.len(), 1);
        let d = diff_file(ps, "f.txt", false).unwrap();
        assert_eq!((d.additions, d.deletions), (1, 1));
        stage(ps, &["f.txt".into()]).unwrap();
        assert_eq!(status(ps).unwrap().staged.len(), 1);
        commit(ps, "mine", "", &id).unwrap();

        checkout(ps, "develop", &id).unwrap();
        std::fs::write(p.join("f.txt"), "one\ntheirs\n").unwrap();
        stage_all(ps).unwrap();
        commit(ps, "theirs", "", &id).unwrap();
        checkout(ps, "me/feature", &id).unwrap();

        let h = history(ps, None).unwrap();
        assert_eq!(h.base.as_deref(), Some("develop"));
        assert_eq!(h.mine.len(), 1);
        assert_eq!(h.theirs.len(), 1);
        assert_eq!(h.shared.len(), 1);

        // Another branch's history, viewed without checking it out.
        // Never pushed (no remote in this test), with line stats on its own commits.
        assert!(h.unpublished);
        assert_eq!(h.mine[0].stats, Some([1, 1]));

        let hd = history(ps, Some("develop")).unwrap();
        assert_eq!(hd.head.as_deref(), Some("develop"));
        assert_eq!(hd.base, None);
        assert_eq!(hd.shared.len(), 2);

        // A past commit: its files, their stats, and one file's diff.
        let mine_sha = h.mine[0].sha.clone();
        let cd = commit_details(ps, &mine_sha).unwrap();
        assert_eq!(cd.summary, "mine");
        assert_eq!(cd.files.len(), 1);
        assert_eq!((cd.files[0].status.as_str(), cd.files[0].additions, cd.files[0].deletions), ("M", 1, 1));
        let fd = commit_file_diff(ps, &mine_sha, "f.txt", None).unwrap();
        assert!(fd.hunks[0].lines.iter().any(|l| l.kind == "+" && l.text == "mine"));
        let root = commit_details(ps, &h.shared[0].sha).unwrap();
        assert_eq!(root.files[0].status, "A");

        let m = merge(ps, "develop", &id).unwrap();
        assert_eq!(m.conflicted, vec!["f.txt".to_string()]);
        assert!(repo_info(ps).unwrap().merging);
        let cf = conflict_file(ps, "f.txt").unwrap();
        assert!(!cf.whole_file);
        resolve_with_content(ps, "f.txt", "one\nmine\ntheirs\n").unwrap();
        assert!(status(ps).unwrap().conflicted.is_empty());
        commit(ps, "Merge develop", "", &id).unwrap();
        assert!(!repo_info(ps).unwrap().merging);
        assert_eq!(history(ps, None).unwrap().theirs.len(), 0);

        let b = branches(ps).unwrap();
        assert!(b.local.iter().any(|l| l.name == "me/feature" && l.is_head));
        delete_branch(ps, "develop", false, &id).unwrap();
    }
}

#[cfg(test)]
mod fixture_check {
    /// `PRODIGYGIT_REPO=… cargo test -- --ignored fixture_history --nocapture`
    #[test]
    #[ignore]
    fn fixture_history() {
        let path = std::env::var("PRODIGYGIT_REPO").expect("PRODIGYGIT_REPO");
        let h = super::history(&path, None).unwrap();
        println!("head={:?} base={:?} upstream={:?} unpublished={} unpushed={}", h.head, h.base, h.upstream, h.unpublished, h.unpushed.len());
        for c in &h.mine {
            println!("mine {} {:?} {}", c.short, c.stats, c.summary);
        }
        println!("theirs={} shared={}", h.theirs.len(), h.shared.len());
    }
}
