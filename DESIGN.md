# Design

Visual world: **Graphite**, taken from the approved mockup. A dense, dark desktop tool in the tradition of code editors: near-black neutral grounds, hairline borders, one cool indigo accent, and semantic colors reserved for Git meaning.

Mode: Operate. Scanability and native desktop expectations come before expression.

## Color

| Token | Value | Use |
|---|---|---|
| `--bg-chrome` | `#08090B` | Title bar, status bar |
| `--bg-app` | `#0B0C0F` | Window ground, inputs |
| `--bg-content` | `#0E1014` | Center column, code |
| `--bg-panel` | `#111318` | Sidebar, right panel |
| `--bg-raised` | `#171A21` | Toolbar, pane headers, dialogs |
| `--bg-control` | `#1D2029` | Buttons, menus |
| `--border` | `#232733` | Panel separators |
| `--border-strong` | `#2E3340` | Controls |
| `--text` | `#E7E9EE` | Primary text |
| `--text-2` | `#A3AAB8` | Secondary text |
| `--text-3` | `#8A92A3` | Labels, metadata |
| `--text-4` | `#6B7385` | Hints, SHAs (large or mono only) |
| `--accent` | `#8B9CFF` | Current branch, primary action, focus |
| `--green` | `#4ADE80` | Added, staged, success |
| `--red` | `#F87171` | Removed, destructive, errors |
| `--amber` | `#FBBF24` | Modified, behind count, warnings |
| `--side-a` | `#2DD4BF` | Conflict side A (current branch) |
| `--side-b` | `#FBBF24` | Conflict side B (incoming branch) |
| `--resolved` | `#C084FC` | Resolved output in conflicts |

Tints are the same hues at 10–20% alpha over the ground.

## Type

- UI: Inter, 13px base, 12–12.5px in dense lists, 600 for titles.
- Code, SHAs, branch names in the toolbar: JetBrains Mono, 12–12.5px.
- Section labels: 11px, 600, uppercase, 0.06em tracking.

## Shape and depth

- Radii: 6px rows, 8px controls, 10–14px dialogs and menus.
- Elevation is declared once: borders for in-flow surfaces, a soft offset shadow only for floating menus and dialogs.

## Layout

Title bar with tabs (44px), toolbar (56px), then three columns: sidebar 264px, content, changes panel 340px; status bar 28px. Minimum window width 1100px. Conflict resolution hides the two side columns.

## Icons

Lucide icons, 1.8 stroke, 14–16px.
