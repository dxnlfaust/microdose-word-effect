# Microdose

The word *Microdose* hand-lettered by many different people. The page morphs from one person's version to the
next, letter by letter, and credits whoever drew the version you're looking at.

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
| `penColours`, `palette` | Whether each version keeps its original pen colour, and what those colours are. |
| `ink` | The look of the ink: width, taper, edge wobble, bleed, feather, grain. |
| `authors`, `credits` | The names and links shown in the corner, and which version each belongs to. Links can be web addresses, bare domains or email addresses. The names and links in this draft are placeholders. |

The credit text and its position are in `css/style.css` (`.credit`).

## Add more versions

1. Extract the new pages and assign their letters in the letter lab, then export the project as JSON.
2. Run `python3 tools/make_styles.py your-export.json`. This rewrites `js/styles.js`.
3. Add a line for each new version under `credits` in `js/config.js`.

## Good to know

- **Speed.** The ink texture is an SVG filter, which is the heaviest part of the page. Add `#plain` to the end of
  the address (`index.html#plain`) to switch it off and compare how smoothly it runs without it. If it turns out
  too heavy for the devices that matter, the filter in `index.html` can be simplified (for example by dropping the
  grain pass), at the cost of some of the ink look.
- **Reduced motion.** Visitors who have asked their device for reduced motion don't get morphing; the page just
  swaps to a new version every `reducedHold` seconds.
- **Checking a single frame.** `#t=2.5` freezes the clock at 2.5 seconds, `#s=3` starts on the fourth version and
  `#seed=7` makes the random order repeatable. They combine, e.g. `#t=2.5&s=3`.

## What's in the folder

```
index.html          the page
css/style.css       layout, the credit, the font
js/config.js        settings and credits (edit this)
js/styles.js        the lettering (generated)
js/main.js          the morphing and the ink
fonts/              Schibsted Grotesk (SIL Open Font License, licence included)
favicon.svg         the sun doodle
tools/make_styles.py  turns a letter-lab export into js/styles.js
```
