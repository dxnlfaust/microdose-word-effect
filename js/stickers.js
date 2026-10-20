'use strict';
/* Microdose: the two stickers in the bottom corners.

   Left: "Hi! This website is feeling ...", with a different picture from assets/smileys/ on every page load.
   Right: a little panel of sliders for playing with the animation while it runs.

   The list of pictures is js/smileys.js (made by tools/make_smileys.py). The sliders talk to window.microdose,
   defined at the end of js/main.js. */
(() => {

const $ = s => document.querySelector(s);

/* ===================================================================== how the website is feeling */
(function feeling() {
  const list = window.MICRODOSE_SMILEYS, box = $('#feeling');
  if (!box || !list || !list.length) return;
  const src = list[Math.floor(Math.random() * list.length)];
  // awesome.png -> "awesome", very-sleepy.png -> "very sleepy"
  const name = decodeURIComponent(src.split('/').pop()).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/^[\d\s]+/, '').trim().toLowerCase();
  if (!name) return;
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;      // each feeling keeps its own colour
  box.querySelector('.feel').style.setProperty('--h', h);
  $('#feelName').textContent = name;
  $('#feelImg').src = src;
  box.hidden = false;
})();

/* ===================================================================== the settings panel */
(function panel() {
  const api = window.microdose, box = $('#tweak');
  if (!api || !box) return;

  // key, label, smallest, largest, step, candy colour, needs the water?
  const SPEC = [
    ['morphSeconds', 'Morph time', 1,  12, .5,  '#ff9500', false],
    ['easePower',    'Ease',       1,  10, .5,  '#ffcc00', false],
    ['seep',         'Seep',       0,  3,  .05, '#34c759', true],
    ['stir',         'Stir',       0,  8,  .1,  '#00c7be', true],
    ['sink',         'Sink',       0,  3,  .05, '#2d8cff', true],
    ['strength',     'Strength',   0,  2,  .05, '#af52de', true],
    ['glow',         'Glow',       0,  1,  .05, '#ff2d92', true]
  ];
  const decimals = step => (String(step).split('.')[1] || '').length;
  const fmt = (v, step) => (+v).toFixed(decimals(step));

  const rows = $('#tweakRows'), bar = $('#tweakBar'), body = $('#tweakBody');
  const controls = [];
  for (const [key, label, min, max0, step, colour, needsWater] of SPEC) {
    const start = api.get(key);
    const max = Math.max(max0, start || 0);                     // never make a setting from config.js unreachable
    const row = document.createElement('div'); row.className = 'row';
    const id = 'tweak-' + key;
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = label;
    const out = document.createElement('output'); out.htmlFor = id;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', id, min, max, step });
    input.style.setProperty('--c', colour);
    const show = () => {
      out.textContent = fmt(input.value, step);
      input.style.setProperty('--p', ((input.value - min) / (max - min) * 100) + '%');
    };
    input.value = start == null ? min : start;
    input.addEventListener('input', () => { show(); api.set(key, +input.value); });
    show();
    row.append(lab, out, input); rows.append(row);
    controls.push({ key, input, row, show, start, needsWater });
  }

  // settings that can't do anything right now are greyed out: the water ones without the water, all of them without motion
  for (const c of controls) {
    if (!api.animated || (c.needsWater && !api.water)) {
      c.input.disabled = true; c.row.classList.add('off');
      c.input.title = api.animated ? 'Only works with the water look' : 'Not available when your device asks for reduced motion';
    }
  }

  $('#tweakReset').addEventListener('click', () => {
    for (const c of controls) if (c.start != null && !c.input.disabled) { c.input.value = c.start; c.show(); api.set(c.key, c.start); }
  });

  // the title bar rolls the window up and down, like a window shade
  bar.addEventListener('click', () => {
    const open = bar.getAttribute('aria-expanded') !== 'true';
    bar.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.hidden = !open;
    box.classList.toggle('open', open);
  });
  box.hidden = false;
})();

})();
