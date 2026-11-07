mod git;
mod settings;

use git::{GitIdentity, R};
use tauri::AppHandle;

// Every command runs on the async pool (`async` flag) so Git work never blocks the window.

#[tauri::command(async)]
fn load_settings(app: AppHandle) -> R<settings::Settings> {
    settings::load(&app)
}

#[tauri::command(async)]
fn save_settings(app: AppHandle, settings: settings::Settings) -> R<()> {
    settings::save(&app, &settings)
}

#[tauri::command(async)]
fn repo_info(path: String) -> R<git::RepoInfo> {
    git::repo_info(&path)
}

#[tauri::command(async)]
fn init_repo(path: String) -> R<git::RepoInfo> {
    git::init_repo(&path)
}

#[tauri::command(async)]
fn clone_repo(url: String, parent: String, id: GitIdentity) -> R<git::RepoInfo> {
    git::clone_repo(&url, &parent, &id)
}

#[tauri::command(async)]
fn branches(path: String) -> R<git::Branches> {
    git::branches(&path)
}

#[tauri::command(async)]
fn history(path: String) -> R<git::History> {
    git::history(&path)
}

#[tauri::command(async)]
fn status(path: String) -> R<git::StatusInfo> {
    git::status(&path)
}

#[tauri::command(async)]
fn diff_file(path: String, file: String, staged: bool) -> R<git::FileDiff> {
    git::diff_file(&path, &file, staged)
}

#[tauri::command(async)]
fn stage(path: String, files: Vec<String>) -> R<()> {
    git::stage(&path, &files)
}

#[tauri::command(async)]
fn stage_all(path: String) -> R<()> {
    git::stage_all(&path)
}

#[tauri::command(async)]
fn unstage(path: String, files: Vec<String>) -> R<()> {
    git::unstage(&path, &files)
}

#[tauri::command(async)]
fn unstage_all(path: String) -> R<()> {
    git::unstage_all(&path)
}

#[tauri::command(async)]
fn discard(path: String, file: String, id: GitIdentity) -> R<()> {
    git::discard(&path, &file, &id)
}

#[tauri::command(async)]
fn commit(path: String, summary: String, description: String, id: GitIdentity) -> R<String> {
    git::commit(&path, &summary, &description, &id)
}

#[tauri::command(async)]
fn checkout(path: String, branch: String, id: GitIdentity) -> R<()> {
    git::checkout(&path, &branch, &id)
}

#[tauri::command(async)]
fn create_branch(path: String, name: String, base: String) -> R<()> {
    git::create_branch(&path, &name, &base)
}

#[tauri::command(async)]
fn delete_branch(path: String, name: String, force: bool, id: GitIdentity) -> R<()> {
    git::delete_branch(&path, &name, force, &id)
}

#[tauri::command(async)]
fn fetch(path: String, id: GitIdentity) -> R<()> {
    git::fetch(&path, &id)
}

#[tauri::command(async)]
fn pull(path: String, id: GitIdentity) -> R<()> {
    git::pull(&path, &id)
}

#[tauri::command(async)]
fn push(path: String, id: GitIdentity) -> R<()> {
    git::push(&path, &id)
}

#[tauri::command(async)]
fn stash_list(path: String, id: GitIdentity) -> R<Vec<git::StashEntry>> {
    git::stash_list(&path, &id)
}

#[tauri::command(async)]
fn stash_push(path: String, id: GitIdentity) -> R<()> {
    git::stash_push(&path, &id)
}

#[tauri::command(async)]
fn stash_pop(path: String, id: GitIdentity) -> R<()> {
    git::stash_pop(&path, &id)
}

#[tauri::command(async)]
fn merge(path: String, branch: String, id: GitIdentity) -> R<git::MergeResult> {
    git::merge(&path, &branch, &id)
}

#[tauri::command(async)]
fn merge_abort(path: String, id: GitIdentity) -> R<()> {
    git::merge_abort(&path, &id)
}

#[tauri::command(async)]
fn merge_continue(path: String, id: GitIdentity) -> R<()> {
    git::merge_continue(&path, &id)
}

#[tauri::command(async)]
fn conflict_file(path: String, file: String) -> R<git::ConflictFile> {
    git::conflict_file(&path, &file)
}

#[tauri::command(async)]
fn resolve_with_content(path: String, file: String, content: String) -> R<()> {
    git::resolve_with_content(&path, &file, &content)
}

#[tauri::command(async)]
fn resolve_with_side(path: String, file: String, side: String, id: GitIdentity) -> R<()> {
    git::resolve_with_side(&path, &file, &side, &id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            repo_info,
            init_repo,
            clone_repo,
            branches,
            history,
            status,
            diff_file,
            stage,
            stage_all,
            unstage,
            unstage_all,
            discard,
            commit,
            checkout,
            create_branch,
            delete_branch,
            fetch,
            pull,
            push,
            stash_list,
            stash_push,
            stash_pop,
            merge,
            merge_abort,
            merge_continue,
            conflict_file,
            resolve_with_content,
            resolve_with_side,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
