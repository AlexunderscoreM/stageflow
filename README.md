# StageFlow

A desktop app for designing dance formations synced to music. Built with Electron, runs on **Windows** (primary) and **macOS**.

![icon](build/icon.png)

## Features

### Dashboard: sets and segments
- The app opens on a **dashboard** of your **sets** (a show or routine). Each set holds **segments** (one formation timeline each) in running order.
- For each set you see:
  - a **running-order strip** sized by each segment's length, with the total time
  - a card per segment with thumbnails of where everyone **starts** and **ends**
  - a **transition check** between neighbouring segments: the biggest move from one segment's last formation to the next one's first, plus dancers entering or exiting
- Drag segment cards to reorder them, or drop them into another set. You can rename, duplicate or delete segments, and import existing `.stageflow` files.
- A **new segment** continues from the previous one: same dancers and stage, starting where they ended.
- Everything is stored as plain files in `Documents/StageFlow/<Set name>/` (you can change the folder from the dashboard).

### Roster
- The dashboard has a **Roster** tab. Make a roster for each team or cast, and add people with their **colour, gender, height** (type it any way: `5'6"`, `5 6`, `66 in`, `168 cm`, `1.68`) and a **skill level (1–5) for each dance style**. "Add several names" takes a comma-separated list.
- **Dance styles are yours to name.** They start as Hip Hop, Contemporary and R&B; rename them (e.g. HH, Contemp), add more (Jazz, Tap, Heels, …), or remove them. The style list is shared by all your rosters.
- Each segment picks which style it's **rated for** (Dancers tab → Roster). That style's levels drive the stars, the 3D name tags and *colour by skill*.
- **Link a roster to a set** (picker on the set card). The set's first new segment starts with exactly those people, and the ↻ button applies the roster to **every segment** in the set: same-name dancers get the roster's details, and missing people are added at the front of the stage.
- In the editor's **Dancers** tab you can apply any roster to the current segment, and edit each selected dancer's **profile** (gender, height, and skill per style).
- **Edits go both ways.** Change a name, colour, gender, height or skill in the roster table, or on a roster-linked dancer in the editor, and the roster is updated.
- In the **3D view** each dancer is their real **height**, gets a **build** by gender (narrower shoulders and wider hips for female, broader shoulders for male, neutral otherwise), and shows their **skill** as stars on their name tag.
- In 2D you can **colour dancers by skill, height or gender** (Stage tab → View) to help with placement, with a legend on stage.

### Editor
- **Panels:** a vertical icon rail on the left with **Dancers**, **Arrange**, **Stage**, **Music** and **Choreo**. Click the active icon (or ✕) to fold the panel away. The right **Properties** panel can be closed too, and the title-bar buttons toggle both panels.
- **Dancers tab:** add, rename and remove dancers. Select one or more (click, Shift/Ctrl-click, or drag a box on stage), then set their **colour** (palette or custom) and **shape** (circle, square, triangle, diamond, hexagon, star) right under the list.
- **Arrange tab:**
  - **Rotate** a group around the center of the selection, or the **whole formation** when nobody is selected:
    - drag the round handle above any selected group,
    - or press *Rotate by dragging* (or **R**) and drag anywhere on the stage,
    - or type an exact angle, or use the ±15° / 45° / 90° / 180° buttons.
    - It snaps to 15° steps (Shift = any angle), with a live angle readout.
    - With *Snap dancers to grid* on, rotated dancers land on grid points (hold **Alt** while dragging to place them freely).
  - **Rotate in:** this formation, this and all later formations, or every formation. Each formation turns around its own group center.
  - mirror, line up, space evenly and center tools
- **Editing while dancers move:** with the playhead in the striped (moving) part of a block, each dancer's end spot shows as a dashed outline. Drag the outlines (or the moving dancers), use W A S D, rotate or the Arrange tools, and you change the formation they're moving into.
- **Mirror partners:** move someone who has a partner at the same depth on the other side of center, and StageFlow asks *"Mirror this for …?"*. Choose **Mirror**, **Always** (do it automatically from now on) or ✕ (stop asking). You can change this any time in Arrange → *Mirror partners*.
- **Timeline scrolling:** scroll the timeline during playback and it stays where you put it; it follows the playhead again when the playhead comes back into view, or when you press play or click the timeline.
- **Copy & paste:** select dancers and press **Ctrl+C** (⌘C on Mac) to copy their spots; with nobody selected it copies the whole formation. Go to any formation, in this segment or another segment or set, and press **Ctrl+V**. **Ctrl+Shift+V** pastes it as a new formation, and **Ctrl+D** duplicates the current formation. Copied dancers are matched by name (or roster member); ones the segment doesn't have yet are added and wait in the wings in the other formations.
- **Right-click** the stage or a formation block on the timeline for: copy, paste, paste mirrored, paste as a new formation, **reset to the previous or next formation** (the selected dancers, or everyone), mirror left ↔ right, flip front ↔ back, swap two dancers (in this formation, or from here to the end of the segment), duplicate, new formation after, rename and delete.
- **Layers (Properties → Layers in this formation):** a layer is a group of dancers that is different **in one formation only**.
  - Select dancers, then *New layer from N selected*.
  - Give the layer a **colour** (a costume or prop change) and/or a **shape**, or a different **move clip** in 3D (their own choreo for that section; it plays from the start of the block's move-in until the block ends, optionally mirrored).
  - Hide a layer with its dot, rename it by double-clicking, or change who is in it (*Set to selection*, *+ / − selected*).
  - The timeline block shows how many layers it has. Layers show up in 2D, 3D, video, PDF, teach mode and the phone viewer.
- **Stage:** width and depth (feet or meters), columns, rows and subdivisions, and which side the audience is on. *Call out spots in* switches between **markers** and distance.
- **Music:** MP3, WAV, OGG, M4A, AAC or FLAC, with a waveform on the timeline. The audio is saved inside the segment file.
- **Tapped beats (Music tab → Beats):**
  - Press **Tap beats**; the music plays, and you hit **Space** on every beat (Enter or Esc to finish).
  - **Sections that don't start on an 8-count:** press **1** (or **Shift + Space**, or right-click the tap pad) on the beat where the new section starts. It's tapped as a beat, and counting restarts there at "1" of a new 8-count; the 8-count before it can be short (e.g. a 4-count bridge). Later you can add or remove these at the playhead in the Beats card; they show as red marks on the music row.
  - **Even out** turns your taps into a steady tempo, and **Fill whole song** continues it to the end. You can nudge all beats ±20 ms and choose which count your first tap was.
  - The timeline shows every beat with **8-count** numbers.
  - **Show: Counts** displays and accepts formation timing as counts (`3·5` = 8-count 3, beat 5; `3·5&` = the "and"). Exact times are kept underneath, so formations stay locked to the music.
  - **Snap: Beats / Half beats** makes formation edges land on your beats.
- **Time-based timeline (exact seconds):**
  - Each formation block is a striped **movement** part followed by a solid **hold**.
  - Drag the divider (arrival) and the right edge (leaving). Edges snap to the playhead.
  - Type exact times in the Properties panel, or use the pin buttons to set any time to the playhead.
- **Paths:** straight or curved; drag the round handle to shape a curve.
- **Import from PDF:** turn a formation slideshow exported from Formi (or a similar app) into formations, one page each.
  - StageFlow finds the stage area, the coloured dancer dots and the names printed with them (or in a colour legend), and matches dancers across pages.
  - A preview shows what was found, and you can drag the stage corners if the edges were missed.
  - Timing isn't imported; formations get default lengths you can adjust.
- **3D view:** 2D / 3D / Split. Dancers are natural-proportion human figures (a rigged mannequin in each dancer's colour) that breathe while standing and walk between spots. Orbit the camera, then snap back to **Audience**, **Judges**, **Top**, **Side** or your saved **★ My view**.

### Choreo: skeleton from video
- In the **Choreo** tab, load a video of someone dancing (MP4, MOV or WebM; phone videos are fine). StageFlow tracks their full skeleton frame by frame with Google MediaPipe Pose. It runs fully offline because the models ship with the app.
- How the capture keeps moves clear:
  - **Best detail** uses the large pose model and analyzes every frame (30 fps).
  - **Fingers & head (more joints)**, on by default: StageFlow cuts close-ups of each hand and the face out of the full-resolution frame and tracks **21 joints per hand** (every knuckle of every finger) and the head's **turn, nod and tilt** (face mesh). Hands or a face that can't be seen fade back to the body-only pose instead of jumping. Analysis takes about twice as long.
  - Hidden limbs (an arm behind the body during a turn) are filled in from the frames around them.
  - A zero-lag adaptive filter removes jitter without softening fast hits and kicks.
  - **Jumps** are measured from how far the feet leave the floor.
  - The start and end are **trimmed automatically** when the dancer walks in or out of frame.
- The result is a **move clip**. Select dancers, put the playhead where the move starts and press **+**. The clip appears on the **Choreo** lane of the timeline, where you can drag it, trim it or mirror it.
- In the 3D view, those dancers perform the move. Arms, hands, **every finger joint**, legs, feet, the spine (in three segments), head turns, nods and tilts, crouches and jumps are all driven by the tracked skeleton, blended smoothly in and out of their walking.
- **Who does what:** select dancers and look at **Properties → Choreo at the playhead**. Each dancer on stage can do **any move clip**, **mirrored or not**, or no choreo, and *All on stage* sets everyone selected at once. A changed move keeps the same stretch of music.
- **Off stage = no choreo.** A dancer more than about 2 ft (0.6 m) past the stage edge (in the wings, or off the front or back) never performs a move. The move fades out as they walk off and back in as they walk on.
- **Look (3D toolbar):**
  - **Clay** (default): smooth, softly lit bodies in each dancer's colour, with studio lighting, soft shadows and a contact shadow under the feet that fades during jumps.
  - **Mannequin**: the earlier look, with dark metal joints.
  - **Trails**: fading ribbons behind the hands and feet while a move clip plays, so you can see the shape of each move. They also show in 3D video exports.

### Share with dancers (phone viewer)
- **Export → Share with dancers** makes a link and a QR code. The segment's dancers, formations and paths are packed into the link itself (music isn't), so nothing is uploaded anywhere.
- Dancers open it on their phone (built for iPhone), tap their name, and step through the segment (swipe or ‹ ›):
  - **their spot** in every formation, where they come from and where they go next, with times
  - their **whole path**: numbered spots, with this formation's move highlighted
  - who they're **directly behind** (or who is behind them), who's **in line with them** on the same row, and any **diagonal** they're on with 2 or more other people
  - **Audience** view, or **Dancer** view (the stage turned around, as they see it facing the audience)
  - ▶ playback of their move in, or of the whole segment from that point
- One-time setup so links work: in the GitHub repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The *Publish phone viewer* workflow then puts the viewer at `https://alexunderscorem.github.io/stageflow/`.

### Spot numbers
Spots everywhere in StageFlow (properties panel, PDF, teach mode, phone viewer) are written **(x, y)**, in **markers** by default:
- **One marker = one stage division** (Stage tab → columns across, rows deep). On a 40 × 30 ft stage with 8 columns and 4 rows, a marker is 5 ft across and 7.5 ft deep. The stage edges are numbered in markers too.
- **x**: markers from center. Left is negative, right is positive (as seen from the audience).
- **y**: markers from the front edge of the stage.
- In-between spots are shown in quarters: ¼, ½, ¾.

For example, **(−2, 1½)** reads "2 markers left of center · 1½ markers from the front". Switch *Stage → Call out spots in* to **Distance** for feet or meters, e.g. (−4, 6) = 4 ft left of center, 6 ft from the front.

### Export (Export button or Ctrl + E)
- **Video:** plays the segment in real time with its music and records it as MP4 (or WebM), from the 2D stage or the 3D audience camera, at 720p or 1080p. You can record the whole segment or only the current formation.
- **PDF:** one landscape page per formation with the final positions and a call-out table for every dancer (e.g. *SR 4 · DS 2 — 4 ft Stage Right, 2 ft Downstage*).
- **Teach mode:** a separate window that steps through the formations.
  - Each dancer's spot is shown as a large call-out, with where they come from.
  - **Focus on** a single dancer to highlight them.
  - Turn on **Follow main window** to stay in sync with the editor's playhead.
  - Print it for rehearsal.
- **Image:** PNG of the stage as it looks on screen.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| W A S D | Move selected dancers one grid step (Shift = fine) |
| ← / → | Previous / next formation |
| ↑ / ↓ | Volume up / down |
| Space | Play / pause (records a beat while tapping beats) |
| R | Rotate mode for the selected dancers |
| N | New formation after the current one |
| C | Toggle curved path for selected dancers |
| V | Cycle 2D / 3D / Split view |
| Alt + drag | Move dancers without snapping |
| Shift + drag (timeline) | Drag times without snapping |
| Delete | Remove the selected move clip from the timeline |
| Ctrl + A / Esc | Select all / clear selection |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + S / E / H | Save / export / dashboard |

## Web app, your team, and the dancer portal
StageFlow is hosted on this repo's GitHub Pages:

| Address | Who | What |
| --- | --- | --- |
| `https://alexunderscorem.github.io/stageflow/app/` | Your team (choreographers) | The full editor in the browser; nothing to install. |
| `https://alexunderscorem.github.io/stageflow/#p=…` | Dancers | The **dancer portal**: a private, view-only link per set, made for phones. |
| Releases / Actions artifacts | Anyone on your team who wants it | The Windows / Mac desktop app (works offline, syncs with the same sets). |

- **Only your team gets in.** The web address itself is public (GitHub Pages always is), but nothing loads without signing in, and only emails on your team list can sign in to work. The first person to sign in becomes the **admin** and adds the others (Account → *Your team*). Remove someone and they lose access straight away.
- **Everyone on the team can open and edit every set, at any time**, whether or not you're around. Changes are live in the web app (it picks up teammates' saves every few seconds and reloads the open segment if you have no unsaved changes). The desktop app syncs automatically (every 2 minutes, at start-up and after saving).
- **Nothing is lost when two people edit the same segment:** the first save wins, and the other person's version is kept as "*name* (my edits)".
- **Dancer portal:** set card → **Share** → *Get the dancer link*. Send the link or let them scan the QR code. They tap their name once, then see every segment of the set in running order, their spot in each formation, who they're behind or in line with, and their moves. It's view-only, needs no account, refreshes itself when you change something, and keeps a copy on the phone for when there's no signal. *New link* stops the old one working, and *Turn off* disables it.
- Sign-in is a 6-digit code sent by email; there are no passwords. Rosters and dance styles follow your account, and music is stored with the set.
- It all runs on a free Supabase project you own. **Set-up guide: [docs/cloud-setup.md](docs/cloud-setup.md)** (about 15 minutes, once). Background research: [docs/cloud-sync-research.md](docs/cloud-sync-research.md).
- Without a cloud project, the desktop app still works on its own, and single-segment phone links (Export → Share with dancers) still work.

## Download / run

### Prebuilt apps
Every push to `main` builds the apps with GitHub Actions. Open the [**Actions** tab](https://github.com/AlexunderscoreM/stageflow/actions), pick the latest run, and download:

- `StageFlow-Windows` contains
  - `StageFlow-Setup-x.y.z.exe`: installer
  - `StageFlow-x.y.z-portable.exe`: a single file that runs with no install
- `StageFlow-macOS` contains a `.dmg`

Pushing a tag like `v0.2.0` also attaches these files to a GitHub Release.

> The builds are not code-signed. On Windows, if SmartScreen warns, click **More info → Run anyway**. On macOS, right-click the app → **Open** the first time.

### From source
Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm start            # run the app
npm run dist:win     # Windows installer + portable exe in dist/
npm run dist:mac     # macOS dmg (run on a Mac)
```

## Project layout

```
main.js          Electron main process: window, app:// protocol, menus, dialogs, library (sets/segments), PDF
preload.js       Safe bridge between the window and the file system
src/index.html   UI layout (dashboard + editor)
src/app.js       Editor: stage, timeline, playback, editing, panels
src/dashboard.js Dashboard: sets, segments, running order, transition check
src/view3d.js    3D view (three.js): stage, human figures, camera presets, pose retargeting, video renderer
src/choreo.js    Choreo tab: video pose analysis (MediaPipe), filtering, jump detection, move clips
src/pdfimport.js Import formations from a PDF slideshow (pdf.js)
src/beats.js     Tap-along beat recording and clean-up
src/roster.js    Rosters: storage, heights, applying to segments, dancer profiles
src/cloudui.js   Cloud account, sign-in, sharing and sync UI
cloud.js         Cloud sync engine (main process, Supabase)
cloud/schema.sql Database tables + security rules for the cloud project
src/models/      Rigged human model used for the 3D dancers
src/export.js    Export: video, PDF, teach mode, PNG
src/teach.html   Teach-mode window (+ teach.js)
src/viewer/      Phone viewer for share links (published with GitHub Pages) + link encoder
src/render2d.js  Canvas renderer shared by exports, teach mode and thumbnails
src/vendor/      three.js, pdf.js and MediaPipe Tasks Vision + pose models (bundled so the app works offline)
```

## Third-party

- [three.js](https://threejs.org) — MIT
- [supabase-js](https://github.com/supabase/supabase-js) — MIT
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — MIT
- [pdf.js](https://mozilla.github.io/pdf.js/) — Apache 2.0
- X Bot character (Mixamo, via the three.js examples) — used for the 3D dancers
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) and the Pose, Hand and Face Landmarker models — Apache 2.0 (see `src/vendor/mediapipe/NOTICE.txt`)
