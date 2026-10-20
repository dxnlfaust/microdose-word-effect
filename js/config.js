/* Microdose: settings, colours, credits.
   Everything you are likely to want to change lives in this file. */
window.MICRODOSE_CONFIG = {

  /* ---- motion ---- */
  morphSeconds: 4,      // one morph, start to finish. The next one begins the instant it ends.
  stagger: 0.16,        // how far each letter trails the one before it (fraction of a morph). 0 = all letters together.
  easePower: 4,         // easing in and out of each morph. 3 = gentle, 4 = current, higher = lingers longer at each end.
  reducedHold: 6,       // seconds each version stays up for visitors who ask for reduced motion (they get no morphing)

  /* ---- which look ----
     'water'   ink in water: the letters bleed pigment into moving water (WebGL)
     'classic' the earlier look: pen ink on paper (SVG filter). Also used automatically when WebGL isn't available,
               and for visitors who ask for reduced motion. Add #classic to the address to compare. */
  effect: 'water',

  /* ---- pens ----
     Each version keeps the pen it was drawn with. In the water, pigment separates as it thins out, the way
     ink does on blotting paper: dense ink is the pen colour (core), it fans out through `mid` and the faintest
     wisps turn `far`. `flat` is the single colour used by the classic look. */
  penColours: true,     // false: every version uses the pink pen
  pens: {
    pink:  { core: '#ff0a8c', mid: '#cb1fff', far: '#ffd400', flat: '#d60083' },
    blue:  { core: '#1430ff', mid: '#8a2bff', far: '#00e5d4', flat: '#0033dc' },
    red:   { core: '#ff1530', mid: '#c8ff00', far: '#bf00ff', flat: '#f5001a' },
    black: { core: '#140f1d', mid: '#4b1fd1', far: '#ff2bd6', flat: '#16141c' }
  },

  /* ---- ink in water ---- */
  water: {
    seep: 1,            // how much pigment the letters keep releasing into the water
    stir: 3,            // how hard the moving strokes push the water while a morph is under way
    swirl: 1,           // curls and eddies (vorticity)
    drift: 1,           // slow background currents that keep the water moving between morphs
    sink: 1,            // pigment is heavier than water and slowly falls. 0 = it just spreads
    linger: 4,          // how long pigment stays visible in the water before it fades
    strength: 0.5,        // overall darkness of the pigment clouds
    halftone: 0.0,     // 0 = smooth clouds, 1 = the faint parts printed as halftone dots, like an acid blotter sheet
    dotSize: 5,         // halftone dot spacing, in CSS pixels
    grain: 0.22,        // paper speckle in the ink, 0 to 1
    wobble: 1,          // roughness of the letter edges
    glow: 0.9,          // white glow around the letters that clears the pigment right next to them. 0 = off, 1 = fully white
    glowSize: 1.8,      // how far the glow reaches from the stroke. Scales with the word, so it looks the same at any window size
    quality: 'auto'     // 'auto' steps down on slow devices; or 'high', 'medium', 'low'
  },

  /* ---- paper ---- */
  paper: '#ffffff',
  perforations: false,   // the faint perforated grid of a blotter sheet

  /* ---- the classic look's ink ---- */
  ink: {
    width: 4.6,         // pen width (in units of the 1000 x 420 artboard). Also used by the water.
    taper: 0.7,         // 0 = even line, 1 = strongly tapered ends
    wobble: 7.5,        // edge roughness
    bleed: 0.8,         // how much nearby ink merges and rounds off
    feather: 3,         // size of the soft halo around the line
    grain: 0.28         // paper speckle, 0 to 1
  },

  /* ---- credits ----
     The name shown in the corner is the Author from the letter lab (in js/styles.js).
     Give each author a link here: a web address, a bare domain or an email address. Leave it '' for no link. */
  links: {
    Ant:     '',
    Jackson: '',
    Jess:    '',
    Marcus:  '',
    Poppy:   ''
  },

  /* ---- say hello ----
     The speech bubble above the smiley changes with the feeling: one line per picture in assets/smileys/, keyed by
     the file name without its ending (awesome.png is `awesome`). A picture with no line says "say hello!".
     Clicking the bubble opens a small window with the contact details below. Both are placeholders for now. */
  contact: {
    email: 'hello@example.com',
    phone: '0491 570 006'
  },
  feelings: {
    awesome:    "so excited to meet you!",
    cute:       "maybe we could get in touch?",
    energised:  "lets chat already!",
    hilarious:  "send me a funny!",
    ponderous:  "i wonder if you'll call me?",
    scared:     "don't message me anything scary!",
    seductive:  "isn't it time you sent me a message?",
    sleepy:     "[yawn] msg me here, but i'm off to bed",
    welcoming:  "good day! delighted to make your acquaintance"
  }
};
