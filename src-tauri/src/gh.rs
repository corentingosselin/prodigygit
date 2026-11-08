//! Reads the GitHub accounts the `gh` CLI is signed in to, so profiles can be
//! imported in one click and pull/push can reuse gh's token for each account.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

use crate::git::R;

const HOST: &str = "github.com";

/// Apps launched from Finder get a minimal PATH, so look in the usual places first.
fn bin() -> Option<String> {
    for c in ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"] {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    Command::new("gh")
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|_| "gh".to_string())
}

/// Runs gh with `token` as its credential, or with its own stored accounts when `None`.
fn run(gh: &str, args: &[&str], token: Option<&str>) -> R<String> {
    let mut cmd = Command::new(gh);
    cmd.args(args)
        .env_remove("GH_TOKEN")
        .env_remove("GITHUB_TOKEN")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1");
    if let Some(t) = token {
        cmd.env("GH_TOKEN", t);
    }
    let out = cmd
        .output()
        .map_err(|err| format!("Impossible de lancer gh : {err}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// gh's token for `login` on github.com, if gh is installed and signed in to that account.
pub fn token_for(login: &str) -> Option<String> {
    let gh = bin()?;
    run(&gh, &["auth", "token", "--hostname", HOST, "--user", login], None)
        .ok()
        .filter(|t| !t.is_empty())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAccount {
    pub login: String,
    pub name: String,
    pub email: String,
    pub avatar_url: String,
    /// The account gh uses by default.
    pub active: bool,
}

#[derive(Deserialize)]
struct StatusJson {
    hosts: std::collections::HashMap<String, Vec<StatusEntry>>,
}

#[derive(Deserialize)]
struct StatusEntry {
    login: String,
    state: String,
    #[serde(default)]
    active: bool,
}

#[derive(Deserialize)]
struct User {
    id: u64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: String,
}

#[derive(Deserialize)]
struct Email {
    email: String,
    primary: bool,
    verified: bool,
}

fn account(gh: &str, login: &str, active: bool) -> R<GhAccount> {
    let token = token_for(login).ok_or_else(|| format!("gh n'a pas de token pour {login}"))?;
    let user: User = serde_json::from_str(&run(gh, &["api", "user"], Some(&token))?)
        .map_err(|err| format!("Réponse GitHub illisible : {err}"))?;
    // The public email is often hidden: try the account's primary email (needs the
    // user:email scope), then fall back to GitHub's noreply address, which GitHub
    // still links to the account.
    let email = user
        .email
        .filter(|m| !m.is_empty())
        .or_else(|| {
            let list: Vec<Email> =
                serde_json::from_str(&run(gh, &["api", "user/emails"], Some(&token)).ok()?).ok()?;
            list.into_iter().find(|m| m.primary && m.verified).map(|m| m.email)
        })
        .unwrap_or_else(|| format!("{}+{}@users.noreply.github.com", user.id, user.login));
    Ok(GhAccount {
        name: user.name.filter(|n| !n.is_empty()).unwrap_or_else(|| user.login.clone()),
        login: user.login,
        email,
        avatar_url: user.avatar_url,
        active,
    })
}

pub fn accounts() -> R<Vec<GhAccount>> {
    let gh = bin().ok_or(
        "GitHub CLI (gh) n'est pas installé. Installe-le avec « brew install gh » puis lance « gh auth login ».",
    )?;
    let raw = run(&gh, &["auth", "status", "--hostname", HOST, "--json", "hosts"], None)
        .map_err(|err| format!("gh auth status a échoué : {err}"))?;
    let status: StatusJson = serde_json::from_str(&raw)
        .map_err(|_| "Ta version de gh est trop ancienne : mets-la à jour avec « brew upgrade gh ».".to_string())?;
    let entries: Vec<StatusEntry> = status
        .hosts
        .into_iter()
        .filter(|(h, _)| h == HOST)
        .flat_map(|(_, v)| v)
        .filter(|e| e.state == "success")
        .collect();
    if entries.is_empty() {
        return Err("gh n'est connecté à aucun compte GitHub. Lance « gh auth login » dans un terminal.".into());
    }
    // One thread per account: each needs two or three GitHub API calls.
    let results: Vec<R<GhAccount>> = std::thread::scope(|s| {
        let handles: Vec<_> = entries
            .iter()
            .map(|e| s.spawn(|| account(&gh, &e.login, e.active)))
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap_or_else(|_| Err("Erreur interne".into())))
            .collect()
    });
    let mut out = Vec::new();
    let mut errors = Vec::new();
    for r in results {
        match r {
            Ok(a) => out.push(a),
            Err(err) => errors.push(err),
        }
    }
    if out.is_empty() {
        return Err(errors.join("\n"));
    }
    out.sort_by_key(|a| !a.active);
    Ok(out)
}

#[cfg(test)]
mod tests {
    /// Needs gh signed in on this machine: `cargo test -- --ignored gh_lists`.
    #[test]
    #[ignore]
    fn gh_lists_signed_in_accounts() {
        let list = super::accounts().expect("gh accounts");
        for a in &list {
            println!("{} | {} | {} | active={} | avatar={}", a.login, a.name, a.email, a.active, !a.avatar_url.is_empty());
        }
        assert!(!list.is_empty());
    }
}
