use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub id: String,
    /// Label shown in the app ("Perso", "Pro").
    pub label: String,
    /// GitHub login, used to pick the right keychain credential.
    pub login: String,
    /// Commit author name and email.
    pub name: String,
    pub email: String,
    /// Optional private key for SSH remotes.
    pub ssh_key: String,
    /// GitHub avatar, filled when the profile comes from gh.
    pub avatar_url: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub tabs: Vec<String>,
    pub active_tab: usize,
    pub profiles: Vec<Profile>,
    pub default_profile: Option<String>,
    /// Repository path -> profile id.
    pub repo_profiles: HashMap<String, String>,
}

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Result<Settings, String> {
    let path = file(app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
        Err(_) => Ok(Settings::default()),
    }
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = file(app)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
