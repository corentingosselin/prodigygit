# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Desktop app built with Tauri 2: a Rust backend that talks to Git through `git2` (libgit2), and a React + TypeScript + Vite frontend. macOS first.

## Users

A solo developer (the author) who used GitKraken every day and lost access when the subscription ended. Works on several repositories at once, including a large monorepo with 80+ branches, and uses several GitHub accounts (personal and work).

## Product Purpose

A personal replacement for GitKraken that covers the daily Git workflow without the paywall: open repositories in tabs, see and switch branches, stage and commit, pull and push, merge, and resolve conflicts. Success means the author stops reaching for GitKraken or the terminal for everyday work.

## Positioning

Only the workflow the author actually uses, done well. The history view is focused on the current branch and its base branch instead of GitKraken's full lane graph, which the author found hard to read.

## Operating Context

- Used all day, next to an editor and a terminal, often on a laptop screen.
- Repositories are local clones; the remote is GitHub.
- Branch names follow `firstname/ticket-description` (for example `corentingosselin/loy-463-loyalty-wallet-cards`), so they group naturally into folders.

## Capabilities and Constraints

Confirmed for the first versions:
- Tabs: several repositories open at once; open a folder, `git init` a new one, clone from a URL.
- Left sidebar: local and remote branches grouped by folder, a name filter, double-click to check out, right-click to merge into the current branch, delete, or create a branch from it.
- Toolbar: Pull, Push, Stash, Pop, Branch, with ahead and behind counts.
- Right panel: unstaged and staged files, stage and unstage, click a file to see its diff, commit summary and description.
- Conflict resolution on a full page: A and B panes with per-block checkboxes, the merged output below.
- Several GitHub profiles, one active per repository.

Not decided yet: authentication details (SSH agent, HTTPS tokens), rebase, cherry-pick, blame, GitHub pull requests.

## Brand Commitments

Working name: prodigygit. Interface copy is in French.

## Evidence on Hand

An approved interactive mockup (Design canvas "prodigygit – maquette", four screens: history, diff, conflicts, new tab). No logo or other brand assets.

## Product Principles

1. The current branch first: show what matters for the branch in front of you, hide the rest until asked.
2. Fast and keyboard-friendly: everyday actions take one click or one shortcut.
3. Never lose work: destructive actions are explicit and reversible where Git allows.
4. Plain Git underneath: no proprietary state; whatever the app does, the terminal sees the same repository.
