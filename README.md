# StageFlow

A desktop app for designing dance formations synced to music. Built with Electron, runs on **Windows** (primary) and **macOS**.

![icon](build/icon.png)

## Features

- **Custom stage**: set width and depth (feet or meters), the number of **columns** and **rows**, and **subdivisions** inside each division. The center lines are highlighted, edges are numbered by distance from center, and you choose whether the audience is at the bottom or top.
- **Music**: load an **MP3 or WAV** (also OGG/M4A/AAC/FLAC). A waveform shows on the timeline and playback stays in sync. The audio is saved inside the project file, so projects stay portable.
- **Counts**: enter a BPM and first-beat time to see 8-counts on the timeline. Timeline edits snap to half-beats.
- **Timeline of formations**: each formation is a block. Dancers **hold** during a block and **travel** during the gap to the next block.
  - Drag a block's **left edge**: when that formation is reached (the movement into it ends).
  - Drag its **right edge**: when the movement to the next formation starts.
  - Drag the middle to move the whole formation. Turn on **Push later formations** to shift everything after it.
- **Straight or curved paths**: select dancers and choose *Straight* / *Curved* / *Flip*, then drag the round handle on stage to shape the curve.
- **Editing tools**: multi-select (Shift-click or drag a box), snap to grid (hold Alt to place freely), arrow-key nudging, mirror, line up, space evenly, undo/redo.
- Save/open `.stageflow` project files, and export the stage as PNG (File menu).

## Download / run

### Easiest: prebuilt apps
Every push to `main` builds the apps with GitHub Actions. Open the [**Actions** tab](https://github.com/AlexunderscoreM/stageflow/actions), pick the latest run, and download:

- `StageFlow-Windows` contains
  - `StageFlow-Setup-x.y.z.exe`: installer (Start-menu shortcut, file association)
  - `StageFlow-x.y.z-portable.exe`: a single file that runs with no install; you can share it with anyone
- `StageFlow-macOS` contains a `.dmg`

Pushing a tag like `v0.1.0` also attaches these files to a GitHub Release.

> The builds are not code-signed. On Windows, if SmartScreen shows a warning, click **More info → Run anyway**.
> On macOS, right-click the app → **Open** the first time (or run `xattr -cr /Applications/StageFlow.app`).

### From source
Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start            # run the app
npm run dist:win     # build Windows installer + portable exe into dist/
npm run dist:mac     # build macOS dmg (must be run on a Mac)
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| N | New formation after the current one |
| C | Toggle curved path for selected dancers |
| [ / ] | Previous / next formation |
| Arrows | Nudge selected dancers (Shift = fine) |
| Alt + drag | Move dancers without snapping |
| Ctrl + A | Select all dancers |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + S / Ctrl + O / Ctrl + N | Save / open / new |
| Ctrl + wheel (timeline) | Zoom timeline |

## Project layout

```
main.js        Electron main process (window, menus, file dialogs)
preload.js     Safe bridge between the window and the file system
src/index.html UI layout
src/styles.css Styling
src/app.js     Stage, timeline, playback and editing logic
build/icon.png App icon
```
