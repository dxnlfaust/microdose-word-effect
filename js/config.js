/* Microdose: settings, colours, credits.
   Everything you are likely to want to change lives in this file. */
window.MICRODOSE_CONFIG = {

  /* ---- motion ---- */
  morphSeconds: 3,      // one morph, start to finish. The next one begins the instant it ends.
  stagger: 0.25,        // how far each letter trails the one before it (fraction of a morph). 0 = all letters together.
  easePower: 7,         // easing in and out of each morph. 3 = gentle, 4 = current, higher = lingers longer at each end.
  reducedHold: 6,       // seconds each version stays up for visitors who ask for reduced motion (they get no morphing)
  creditFadeSeconds: 0.4, // the whole credit change: the old name fades out over the first half, the new one in over the second

  /* ---- ink ---- */
  penColours: true,     // true: each version keeps the colour of the pen it was drawn with. false: everything uses "pink".
  palette: {            // the three pens from the notebook, at full saturation
    pink: '#d60083',
    blue: '#0033dc',
    red:  '#f5001a'
  },
  ink: {
    width: 4.6,         // pen width (in units of the 1000 x 420 artboard)
    taper: 0.7,         // 0 = even line, 1 = strongly tapered ends
    wobble: 2,        // edge roughness
    bleed: 0.8,         // how much nearby ink merges and rounds off
    feather: 3,         // size of the soft halo around the line
    grain: 0         // paper speckle, 0 to 1
  },

  /* ---- credits (placeholders for now) ---- */
  authors: {            // key: { name, url }. A url can be a web address, a bare domain, or an email address.
    liana:   { name: 'Liana',      url: 'https://www.surprisinglyprofessional.xyz/' },
    jackson: { name: 'Jackson',    url: 'https://www.instagram.com/gentlyferal/' },
    dan:     { name: 'Dan',        url: 'daniel@faust.earth' },
    mimmi:   { name: 'Mimmi-Rose', url: 'creamy.net.au' },
    harley:  { name: 'Harley',     url: 'themagicwebsite.com' },
    kurt:    { name: 'Kurt',       url: 'https://www.instagram.com/kurt____johnson/' }
  },
  credits: {            // which author drew which version (the ids are listed in js/styles.js)
    p1w1: 'liana',
    p1w2: 'mimmi',
    p1w3: 'dan',
    p1w4: 'kurt',
    p1w5: 'jackson',
    p1w6: 'liana',
    p2w1: 'harley',
    p2w2: 'mimmi',
    p2w3: 'harley',
    p2w4: 'dan',
    p2w5: 'jackson'
  }
};
