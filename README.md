# Microdose

The word *Microdose* hand-lettered by many different people. The page morphs from one person's version to the
next, letter by letter, and credits whoever drew the version you're looking at.

The letters are drawn as ink in water: each one keeps bleeding pigment into the water around it, the strokes stir the
water as they morph, and the pigment curls away and separates into acid colours as it thins out, over the perforated
grid of a blotter sheet. It is a small fluid simulation running on the graphics chip (WebGL). Devices without WebGL,
and visitors who ask for reduced motion, get the earlier ink-on-paper look instead.

It is a plain static site: no build step, no dependencies, no third-party requests (the font is included).

## Look at it

Open `index.html` in a browser. It also works from a local server:

```
python3 -m http.server
```

then visit http://localhost:8000.

## Put it online with GitHub Pages

1. Create a new, empty repository on GitHub.
2. In this folder:

   ```
   git init
   git add .
   git commit -m "Microdose draft"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   git push -u origin main
   ```

3. On GitHub, open the repository's **Settings → Pages**. Under *Build and deployment*, choose
   **Deploy from a branch**, pick **main** and **/ (root)**, and save.
4. After a minute or two the site is live at `https://YOUR-NAME.github.io/YOUR-REPO/`.

All paths are relative, so it works from that sub-folder address. It will also work as-is on Netlify, Vercel,
Cloudflare Pages or any static host: point it at this folder.

`index.html` contains `<meta name="robots" content="noindex">` so the client preview stays out of search
engines. Delete that line when you launch.

## Change things

Everything you're likely to want is in **`js/config.js`**:

| Setting | What it does |
| --- | --- |
| `morphSeconds` | Length of each morph. The next starts the instant one ends. |
| `stagger` | How far each letter trails the one before it. `0` moves all letters together. |
| `easePower` | How strongly each morph eases in and out. Higher lingers longer at each end. |
| `effect` | `'water'` (ink in water) or `'classic'` (the earlier ink on paper). |
| `penColours`, `pens` | Whether each version keeps the pen it was drawn with, and each pen's colours: `core` for dense ink, fading through `mid` to `far` in the faintest wisps, and `flat` for the classic look. |
| `water` | The water: `seep` (how much pigment the letters release), `stir` (how hard the morph pushes the water), `swirl`, `drift`, `sink`, `linger`, `strength`, `halftone` and `dotSize` (the printed-dot look of the faint parts), `grain`, `wobble`, and `quality`. All are 1 by default except where noted; 0.5 halves an effect, 2 doubles it. |
| `paper`, `perforations` | Paper colour, and whether to show the perforated blotter grid. |
| `ink` | Pen width and taper (both looks), and the classic look's wobble, bleed, feather and grain. |
| `links` | A link for each author's name in the corner: a web address, a bare domain or an email address. Leave it `''` and the name shows without a link. |

The credit text and its position are in `css/style.css` (`.credit`), and so is the perforated grid (`body.perforated`).

## The two stickers

Two stickers are stuck to the bottom corners (`css/stickers.css`, `js/stickers.js`).

- **Bottom right: "Play with me!"** A little Aqua-style window of sliders for morph time, ease, seep, stir, sink,
  strength and glow. It starts rolled up to its title bar; click the bar to open it. Changes happen live, and
  "Put it back" restores the values from `js/config.js`. The water sliders grey out when the page is in the classic
  look, and everything greys out for visitors who ask for reduced motion. Slider ranges are the `SPEC` list at the top of
  the panel code in `js/stickers.js`.
- **Bottom left: "Hi! This website is feeling ..."** A random picture from `assets/smileys/` on every page load,
  and its file name is the feeling (`awesome.png` says "awesome"; `very-sleepy.png` says "very sleepy"). A static
  site can't list a folder, so after adding, removing or renaming pictures run `python3 tools/make_smileys.py`, which
  rewrites `js/smileys.js`. Sub-folders such as `assets/smileys/originals/` are ignored.

## Add more versions

1. Extract the new pages and assign their letters in the letter lab, then export the project as JSON.
2. Run `python3 tools/make_styles.py your-export.json`. This rewrites `js/styles.js`.
3. The names in the corner come from the lab's Author field. If a new author appears, add them under `links` in
   `js/config.js` (the link can stay empty).

The lab export this site was built from is kept in `data/microdose-letters.json`.

## Good to know

- **Speed.** The water runs on the graphics chip and is light on the processor (about 1 ms of script per frame).
  On a slow device it notices and steps down its resolution by itself (`water.quality: 'auto'`). If it is still too
  heavy somewhere that matters, set `quality` to `'low'`, or `effect` to `'classic'`.
- **Fallbacks.** Without WebGL, or if the graphics chip gives up, the page carries on in the classic look.
  Visitors who have asked their device for reduced motion get no morphing and no water: the page swaps to a new
  version every `reducedHold` seconds.
- **Checking things.** Add these to the end of the address, after a `#`, and reload:
  `classic` shows the earlier look, `plain` the earlier look without its texture, `t=2.5` freezes the morph at
  2.5 seconds (the water keeps moving), `s=3` starts on the fourth version, `seed=7` makes the random order repeatable,
  and `step=60` advances exactly 1/60 s per frame however slow the machine (useful for screenshots). They combine,
  e.g. `#s=3&seed=7`.
- **Ant's two-line version** is drawn with MICRO upside down under DOSE, the way it is on his page.

## What's in the folder

```
index.html          the page
css/style.css       layout, the credit, the font
js/config.js        settings, colours and links (edit this)
js/styles.js        the lettering (generated)
js/main.js          the morphing, the classic ink, the credit
js/water.js         the ink in water (WebGL fluid simulation)
js/stickers.js      the two corner stickers: the settings panel and the feeling
js/smileys.js       the list of pictures in assets/smileys/ (generated)
css/stickers.css    how the stickers look
assets/smileys/     the feelings pictures
data/               the letter-lab export the lettering was made from
fonts/              Schibsted Grotesk (SIL Open Font License, licence included)
favicon.svg         the sun doodle
tools/make_styles.py  turns a letter-lab export into js/styles.js
tools/make_smileys.py turns assets/smileys/ into js/smileys.js
```
