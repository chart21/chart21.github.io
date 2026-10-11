// Private inference: a secret-shared input flows through a neural network whose activations stay encrypted (locked);
// only the final class scores are opened.
(() => {
  const P = 9000, LX = [300, 440, 580, 720], SIZES = [4, 5, 5, 3], CY = 470, GAP = 118, T0 = 600, STEP = 800;
  const CLASSES = ["car", "bike", "person"];
  const BOX = [70, CY - 66, 132]; // input grid x, y, size
  const nodes = LX.map((x, l) => Array.from({ length: SIZES[l] }, (_, i) => [x, CY + (i - (SIZES[l] - 1) / 2) * GAP]));

  function lock(ctx, col, x, y, s, open) {
    ctx.strokeStyle = col.ink;
    ctx.fillStyle = col.ink;
    ctx.lineWidth = 3.2 * s;
    const lift = open * 9 * s; // an opened lock lifts its shackle
    ctx.beginPath();
    ctx.moveTo(x - 7.5 * s, y - 3 * s - lift);
    ctx.lineTo(x - 7.5 * s, y - 9 * s - lift);
    ctx.arc(x, y - 9 * s - lift, 7.5 * s, Math.PI, 0);
    ctx.lineTo(x + 7.5 * s, y - 3 * s);
    ctx.stroke();
    ANIM.rr(ctx, x - 11 * s, y - 4 * s, 22 * s, 17 * s, 3 * s);
    ctx.fill();
  }

  ANIM.def("pnn", {
    title: "Private inference",
    blurb: "A secret-shared input flows through a neural network with encrypted activations; only the result is opened.",
    still: 5600,
    draw(ctx, t, col) {
      const n = Math.floor(t / P), u = t % P, r = ANIM.rng(n * 31 + 3);
      const cls = n % 3, scores = CLASSES.map((_, i) => (i === cls ? 0.9 + r() * 0.08 : 0.01 + r() * 0.04));
      const fadeOut = 1 - ANIM.span(u, 7600, 8800);
      const reached = l => ANIM.span(u, T0 + l * STEP + STEP * 0.85, T0 + (l + 1) * STEP); // layer l activated

      // edges
      ctx.strokeStyle = col.line;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const [x, y] of nodes[0]) for (let k = 0; k < 4; k++) { ctx.moveTo(BOX[0] + BOX[2], BOX[1] + 16 + k * 33); ctx.lineTo(x, y); }
      for (let l = 0; l < 3; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();

      // input: the image arrives as shares, so it looks like noise
      const flick = Math.floor(t / 160);
      for (let i = 0; i < 36; i++) {
        const v = ANIM.rng(i * 53 + flick * 7)();
        ctx.fillStyle = v > 0.5 ? ANIM.rgba(col.accent, 0.25 + 0.5 * v) : ANIM.rgba(col.muted, 0.18);
        ctx.fillRect(BOX[0] + (i % 6) * 22 + 1, BOX[1] + Math.floor(i / 6) * 22 + 1, 20, 20);
      }
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 3;
      ANIM.rr(ctx, BOX[0] - 6, BOX[1] - 6, BOX[2] + 12, BOX[2] + 12, 8); ctx.stroke();
      ctx.fillStyle = col.muted;
      ANIM.text(ctx, "input", BOX[0] + BOX[2] / 2, BOX[1] + BOX[2] + 44, 32);

      // activation pulses, one layer transition at a time
      ctx.fillStyle = col.accent;
      for (let l = 0; l < 4; l++) {
        const p = ANIM.span(u, T0 + l * STEP, T0 + (l + 1) * STEP);
        if (p <= 0 || p >= 1) continue;
        ctx.globalAlpha = Math.sin(Math.PI * p) * fadeOut;
        const e = ANIM.ease(p);
        const from = l === 0 ? [0, 1, 2, 3].map(k => [BOX[0] + BOX[2], BOX[1] + 16 + k * 33]) : nodes[l - 1];
        for (const a of from) for (const b of nodes[l]) {
          ctx.beginPath(); ctx.arc(ANIM.lerp(a[0], b[0], e), ANIM.lerp(a[1], b[1], e), 6, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // nodes: locked while encrypted; the output layer unlocks at the end
      const unlock = ANIM.ease(ANIM.span(u, T0 + 4 * STEP + 100, T0 + 4 * STEP + 900));
      nodes.forEach((layer, l) => layer.forEach(([x, y], i) => {
        const on = reached(l) * fadeOut, out = l === 3;
        ctx.fillStyle = col.card;
        ctx.strokeStyle = on > 0 ? ANIM.mix(col.line, col.accent, on) : col.line;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, out ? 34 : 30, 0, 7); ctx.fill(); ctx.stroke();
        if (on > 0) {
          const win = out && i === cls ? unlock * fadeOut : 0;
          ctx.fillStyle = ANIM.rgba(col.accent, 0.16 * on + 0.6 * win);
          ctx.beginPath(); ctx.arc(x, y, out ? 34 : 30, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = out ? 0.75 * (1 - unlock * fadeOut) + 0.15 : 0.35 + 0.5 * on;
        lock(ctx, col, x, y + 2, out ? 1.1 : 1, out ? unlock * fadeOut : 0);
        ctx.globalAlpha = 1;
      }));

      // opened scores
      const show = unlock * fadeOut;
      nodes[3].forEach(([x, y], i) => {
        ctx.globalAlpha = 0.25 + 0.75 * show;
        ctx.fillStyle = i === cls ? col.ink : col.muted;
        const txt = show > 0.05 ? `${CLASSES[i]} ${scores[i].toFixed(2)}` : `${CLASSES[i]} ····`;
        ANIM.text(ctx, txt, x + 56, y - 14, 30, { align: "left", weight: i === cls ? 600 : 500 });
        ctx.fillStyle = ANIM.rgba(col.muted, 0.2);
        ctx.fillRect(x + 56, y + 12, 190, 10);
        ctx.fillStyle = i === cls ? col.accent : col.muted;
        ctx.fillRect(x + 56, y + 12, 190 * scores[i] * show, 10);
      });
      ctx.globalAlpha = 1;

      ctx.fillStyle = col.muted;
      ctx.globalAlpha = 1 - show;
      ANIM.text(ctx, "activations stay encrypted", 500, 880, 36);
      ctx.globalAlpha = show;
      ANIM.text(ctx, "only the result is opened", 500, 880, 36);
    },
  });
})();
