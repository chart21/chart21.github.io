/* Hero animation runtime. Each animation draws a virtual 1000x1000 square in the site's colour tokens.
   ANIM.def(name, {title, blurb, still, draw(ctx, t, col, state)}) registers one; draw should depend on the time t (ms)
   only, using state as a cache; `still` (a time in ms) is the frame shown while the animation is paused.
   ANIM.mount(canvas, name, opts) mounts it and returns a stop function; canvas[data-anim] elements mount on load.
   Nothing ever plays by itself (user's decision, 2026-10-11): every animation sits on its `still` frame until the
   visitor presses its play button. prefers-reduced-motion is therefore not consulted at all - there is no motion to
   suppress, and a press is the visitor asking for it, so it plays whatever the setting says. */
(function () {
  "use strict";
  const defs = {};
  const TOKENS = ["ink", "muted", "line", "accent", "signal", "card", "paper"];
  const scheme = matchMedia("(prefers-color-scheme: dark)");

  function parse(c) {
    c = c.trim();
    if (c[0] === "#") {
      const h = c.length === 4 ? c.slice(1).split("").map(x => x + x).join("") : c.slice(1, 7);
      return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    }
    const m = c.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  function rgba(c, a) {
    const [r, g, b] = parse(c);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(c1, c2, k) {
    const a = parse(c1), b = parse(c2);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
  }
  function colours(el) {
    const cs = getComputedStyle(el), col = {};
    for (const n of TOKENS) col[n] = cs.getPropertyValue("--" + n).trim() || "#808080";
    const [r, g, b] = parse(col.paper);
    col.dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
    return col;
  }
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = x => (x = clamp(x), x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const span = (t, a, b) => clamp((t - a) / (b - a)); // 0 before a, 1 after b
  const mono = (size, weight = 500) => `${weight} ${size}px "JetBrains Mono", ui-monospace, Menlo, monospace`;

  /* Text with single-character sub- and superscripts ("x_1 + x_2", "A^1") and a drawn ⊕, so that every glyph comes
     from the page's own font (the self-hosted latin subset has no subscript digits and no ⊕). */
  function text(ctx, s, x, y, size, opts = {}) {
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ((ch === "_" || ch === "^") && i + 1 < s.length) { parts.push([s[++i], ch === "_" ? 1 : -1]); continue; }
      if (ch === "⊕") { parts.push([ch, 2]); continue; }
      const last = parts[parts.length - 1];
      if (last && last[1] === 0) last[0] += ch; else parts.push([ch, 0]);
    }
    const font = opts.font || (sz => mono(sz, opts.weight || 500));
    let w = 0;
    const OPLUS = size * 0.9;
    for (const p of parts) {
      if (p[1] === 2) { w += OPLUS; continue; }
      ctx.font = font(p[1] ? size * 0.68 : size); w += ctx.measureText(p[0]).width;
    }
    let cx = opts.align === "left" ? x : opts.align === "right" ? x - w : x - w / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = opts.baseline || "middle";
    for (const p of parts) {
      if (p[1] === 2) {
        const r = size * 0.3, mx = cx + OPLUS / 2, my = y - (ctx.textBaseline === "middle" ? 0 : size * 0.33);
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = size * 0.07;
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, 7);
        ctx.moveTo(mx - r, my); ctx.lineTo(mx + r, my); ctx.moveTo(mx, my - r); ctx.lineTo(mx, my + r);
        ctx.stroke();
        ctx.restore();
        cx += OPLUS;
        continue;
      }
      ctx.font = font(p[1] ? size * 0.68 : size);
      ctx.fillText(p[0], cx, y + p[1] * size * (p[1] > 0 ? 0.28 : 0.34));
      cx += ctx.measureText(p[0]).width;
    }
    return w;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function def(name, spec) { defs[name] = spec; }

  const ICON = { play: "M9 5.8 18.2 12 9 18.2Z", pause: "M9 6.4h2.4v11.2H9zM13.6 6.4H16v11.2h-2.4z" };

  /* Mounts an animation paused on its `still` frame, with a play button next to it; the visitor starts it.
     opts.play === true runs it straight away and leaves the button out (the gallery compares the motion).
     A remount of the same canvas (the editor's animation picker) keeps whatever that canvas was doing. */
  function mount(canvas, name, opts = {}) {
    const was = canvas._animPlaying === true;
    if (canvas._animStop) canvas._animStop();
    const d = defs[name];
    if (!d) { console.warn("unknown animation", name); return () => {}; }
    const ctx = canvas.getContext("2d");
    let col = colours(canvas), state = {}, raf = 0, visible = true, alive = true, last = 0;
    let playing = opts.play === true || (opts.play === undefined && was);
    let acc = d.still || 0; // the paused frame, and where playing starts from
    canvas.dataset.anim = name;
    canvas._animPlaying = playing;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", d.blurb || d.title || name);

    function control() { // the button lives next to the canvas in a .anim box, one per canvas
      let box = canvas.parentNode;
      if (!box) return null;
      if (!box.classList.contains("anim")) {
        const w = document.createElement("div");
        w.className = "anim";
        box.insertBefore(w, canvas);
        w.append(canvas);
        box = w;
      }
      let b = box.querySelector(":scope > .anim-play");
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "anim-play";
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d=""></path></svg>';
        box.append(b);
      }
      b.onclick = toggle; // an assignment, so a remount cannot leave two handlers behind
      return b;
    }
    const btn = opts.play === true ? null : control();
    function label() {
      if (!btn) return;
      btn.querySelector("path").setAttribute("d", playing ? ICON.pause : ICON.play);
      const s = (playing ? "Pause" : "Play") + " the animation";
      btn.setAttribute("aria-label", s);
      btn.title = s;
    }
    label();

    function paint() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = Math.min(w, h) / 1000;
      ctx.setTransform(s, 0, 0, s, (w - 1000 * s) / 2, (h - 1000 * s) / 2);
      ctx.save();
      try { d.draw(ctx, acc, col, state); } finally { ctx.restore(); }
    }
    function frame(now) {
      raf = 0;
      if (!alive) return;
      if (last) acc += Math.min(now - last, 100); // no jump after a pause
      last = now;
      paint();
      if (playing && visible && !document.hidden) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() {
      if (!alive) return;
      if (!playing || !visible || document.hidden) { if (!raf) paint(); return; }
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    }
    function toggle() { // a click is the visitor asking for motion: it always plays
      playing = !playing;
      canvas._animPlaying = playing;
      label();
      if (playing) kick();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
    }
    function recolour() { requestAnimationFrame(() => { if (!alive) return; col = colours(canvas); if (!raf) paint(); }); }
    function repaint() { if (alive && !raf) paint(); }

    const io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; kick(); });
    io.observe(canvas);
    const ro = new ResizeObserver(repaint);
    ro.observe(canvas);
    const mo = new MutationObserver(recolour);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    scheme.addEventListener("change", recolour);
    document.addEventListener("visibilitychange", kick);
    if (document.fonts) document.fonts.ready.then(repaint);
    kick();

    function stop() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect(); mo.disconnect();
      scheme.removeEventListener("change", recolour);
      document.removeEventListener("visibilitychange", kick);
      if (btn) btn.onclick = null;
      if (canvas._animStop === stop) canvas._animStop = null;
    }
    canvas._animStop = stop;
    return stop;
  }

  function auto() {
    document.querySelectorAll("canvas[data-anim]").forEach(c => { if (!c._animStop) mount(c, c.dataset.anim); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else setTimeout(auto);

  window.ANIM = { def, mount, list: () => Object.keys(defs), get: n => defs[n],
                  rgba, mix, rng, clamp, lerp, ease, span, mono, text, rr };
})();
