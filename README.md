# StageFlow

A desktop app for designing dance formations synced to music. Built with Electron, runs on **Windows** (primary) and **macOS**.

![icon](build/icon.png)

## Features

- **Modern Chrome-style interface**: dark Material look, toolbar built into the title bar, and a tabbed left panel (**Dancers**, **Stage**, **Music**). Dancers are drawn as HTML elements, so they render crisply with shadows and a selection glow.
- **Dancers tab**: add one or many dancers, rename, remove, and select (Shift/Ctrl-click for several).
- **Colour and shape**: select one dancer, Shift-click several, or click-drag a box on the stage. Then pick a colour (palette or any custom colour) and a shape (circle, square, triangle, diamond, hexagon, star) in the **Selection** panel.
- **Custom stage (Stage tab)**: set width and depth (feet or meters), the number of **columns** and **rows**, and **subdivisions** inside each division. The center lines are highlighted, edges are numbered by distance from center, and you choose whether the audience is at the bottom or top.
- **Music**: load an **MP3 or WAV** (also OGG/M4A/AAC/FLAC). A waveform shows on the timeline and playback stays in sync. The audio is saved inside the project file.
- **Time-based timeline (exact seconds, no counts)**: each formation is one block made of two parts:
  - a striped **movement** part (dancers travelling in from the previous formation), then
  - a solid **hold** part (dancers standing in the formation).
  - Drag the **divider** to set when dancers arrive, and the **right edge** to set when they start moving to the next formation.
  - Dragged edges snap to the **playhead**, so you can park the playhead on a moment in the music and drag an edge onto it. You can also round to a step (0.01 s to 1 s, or off), or hold Shift for free timing.
  - Type exact times (movement start, arrive, end, move length, hold length) in the **Formation** panel, or press the pin button to set any of them to the playhead.
  - Optional **Push later formations** moves everything after an edit.
- **3D audience view**: switch between **2D**, **3D** and **Split** at the top (or press V). Dancers are shown as jointed human figures in their colour, walking when they travel and turning to face the audience when they arrive.
  - Orbit with the mouse (drag to orbit, right-drag to pan, scroll to zoom).
  - Snap the camera back with one click: **Audience**, **Judges**, **Top**, **Side**, or **★ My view** (save any camera angle with **Save view**; it is stored in the project).
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
| V | Cycle 2D / 3D / Split view |
| Shift + drag (timeline) | Drag times without snapping |
| [ / ] | Previous / next formation |
| Arrows | Nudge selected dancers (Shift = fine) |
| Alt + drag | Move dancers without snapping |
| Ctrl + A / Esc | Select all dancers / clear selection |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + S / O / N / E | Save / open / new / export PNG |
| Ctrl + wheel (timeline) | Zoom timeline |

## Project layout

```
main.js        Electron main process (window, menus, file dialogs)
preload.js     Safe bridge between the window and the file system
src/index.html UI layout
src/styles.css Styling
src/app.js     Stage, timeline, playback and editing logic
src/view3d.js  3D audience view (three.js), human figures and camera presets
src/vendor/    three.js (bundled so the app works offline)
build/icon.png App icon
```

## Roadmap

- **Choreo from video (planned)**: analyze the skeleton of a dancer in a video (pose estimation) and apply that choreography to the 3D dancers. The 3D figures are already built from named joints (hips, spine, head, shoulders, elbows, hips, knees) so recorded poses can drive them later.
