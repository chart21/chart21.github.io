// Sensor fusion from above: camera (good angle, poor range), radar (good range, poor angle) and LiDAR points measure
// the car ahead; the fused track's uncertainty ellipse shrinks as measurements come in.
(() => {
  const P = 8000, S = [500, 790], PX_PER_M = 50;

  function target(t) { // the car ahead, in canvas units
    return [500 + 170 * Math.sin(t / 3600), 330 + 60 * Math.sin(t / 2700)];
  }
  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rot, 0, 7);
  }
  function noise(seed) { const r = ANIM.rng(seed); return [r() * 2 - 1, r() * 2 - 1]; }

  ANIM.def("fusion", {
    title: "Sensor fusion",
    blurb: "Camera, radar and LiDAR each measure the car ahead; the fused track's uncertainty shrinks as they agree.",
    still: 5200,
    draw(ctx, t, col) {
      const u = t % P, [tx, ty] = target(t);
      const los = Math.atan2(ty - S[1], tx - S[0]); // line of sight

      // camera frustum
      const fov = 0.42, up = -Math.PI / 2;
      ctx.fillStyle = ANIM.rgba(col.accent, 0.06);
      ctx.strokeStyle = ANIM.rgba(col.accent, 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.arc(S[0], S[1], 760, up - fov, up + fov); ctx.closePath(); ctx.fill(); ctx.stroke();

      // radar ripples
      ctx.strokeStyle = col.signal;
      ctx.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        const p = ((t / 1300 + k / 3) % 1), rad = 60 + p * 700;
        ctx.globalAlpha = 0.45 * (1 - p);
        ctx.beginPath(); ctx.arc(S[0], S[1], rad, up - 0.7, up + 0.7); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // the object itself, faintly
      ctx.strokeStyle = ANIM.rgba(col.muted, 0.5);
      ctx.lineWidth = 3;
      ANIM.rr(ctx, tx - 42, ty - 84, 84, 168, 18); ctx.stroke();

      // LiDAR returns on its rear and near side
      const lr = ANIM.rng(Math.floor(t / 120) * 17 + 1);
      ctx.fillStyle = col.ink;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 16; i++) ctx.fillRect(tx - 40 + i * 5.3 + (lr() - 0.5) * 4 - 4, ty + 84 + (lr() - 0.5) * 8 - 4, 8, 8);
      const side = tx > S[0] ? -1 : 1;
      for (let i = 0; i < 9; i++) ctx.fillRect(tx + side * 42 + (lr() - 0.5) * 8 - 4, ty + 80 - i * 14 + (lr() - 0.5) * 4 - 4, 8, 8);
      ctx.globalAlpha = 1;

      // camera and radar measurements: elongated along and across the line of sight
      ctx.setLineDash([10, 9]);
      ctx.lineWidth = 4;
      for (const [period, colour, along, across, seed] of [[500, col.accent, 70, 16, 3], [700, col.signal, 14, 62, 9]]) {
        const m = Math.floor(t / period), age = (t % period) / period, [nx, ny] = noise(m * 7 + seed);
        const [mx, my] = target(m * period);
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.9 * (1 - age);
        ellipse(ctx, mx + Math.cos(los) * nx * along * 0.6 - Math.sin(los) * ny * across * 0.6,
                my + Math.sin(los) * nx * along * 0.6 + Math.cos(los) * ny * across * 0.6, along, across, los);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // fused track: history, then the shrinking ellipse
      const sig = 12 + 95 * Math.exp(-u / 1400);
      ctx.fillStyle = col.ink;
      for (let k = 1; k <= 10; k++) {
        if (u - k * 160 < 0) break;
        const [hx, hy] = target(t - k * 160);
        ctx.globalAlpha = 0.5 * (1 - k / 11);
        ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const [fx, fy] = noise(Math.floor(t / 90)), j = sig * 0.15;
      ctx.fillStyle = ANIM.rgba(col.accent, 0.14);
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 4;
      ellipse(ctx, tx + fx * j, ty + fy * j, sig * 1.15, sig * 0.85, los);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx - 14, ty); ctx.lineTo(tx + 14, ty); ctx.moveTo(tx, ty - 14); ctx.lineTo(tx, ty + 14);
      ctx.stroke();
      const label = `fused ±${(sig / PX_PER_M).toFixed(1)} m`;
      ctx.font = ANIM.mono(30);
      const lw = ctx.measureText(label).width + 20, lx = Math.min(tx + sig * 0.9 + 12, 992 - lw);
      ctx.fillStyle = col.card;
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 2.5;
      ANIM.rr(ctx, lx, ty - sig * 0.6 - 44, lw, 40, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col.ink;
      ANIM.text(ctx, label, lx + 10, ty - sig * 0.6 - 24, 30, { align: "left" });

      // ego car
      ctx.fillStyle = col.card;
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 4;
      ANIM.rr(ctx, S[0] - 42, S[1] - 10, 84, 170, 20); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(S[0] - 30, S[1] + 28); ctx.quadraticCurveTo(S[0], S[1] + 16, S[0] + 30, S[1] + 28); ctx.stroke();
      ctx.fillStyle = col.accent;
      ctx.beginPath(); ctx.arc(S[0], S[1], 9, 0, 7); ctx.fill();

      // legend
      const items = [["camera", col.accent, "e"], ["radar", col.signal, "e"], ["lidar", col.ink, "p"], ["fused", col.ink, "f"]];
      items.forEach(([name, colour, kind], i) => {
        const x = 40 + (i % 2) * 220, y = 48 + Math.floor(i / 2) * 50;
        ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 4;
        if (kind === "e") { ctx.setLineDash([8, 6]); ellipse(ctx, x + 18, y, 18, 11, 0); ctx.stroke(); ctx.setLineDash([]); }
        else if (kind === "p") { for (let k = 0; k < 3; k++) ctx.fillRect(x + 4 + k * 12, y - 4, 8, 8); }
        else { ellipse(ctx, x + 18, y, 18, 11, 0); ctx.stroke(); }
        ctx.fillStyle = col.muted;
        ANIM.text(ctx, name, x + 50, y, 32, { align: "left" });
      });
    },
  });
})();
