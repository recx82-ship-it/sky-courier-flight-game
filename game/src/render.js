// The renderer: a chase view over the Kestrel Isles in plain Canvas 2D.
// The camera sits behind and above the mail plane and looks along its
// heading; the sea, the island terrain, the rings, the runway and the
// landmarks are all projected from the same 3D world the simulation runs
// in, so what the screenshots show is what the game really is. The plane
// itself is drawn in screen space, banked and pitched with the flight
// model, and the HUD is a lit instrument panel: altitude, speed, heading
// and wind, a route progress bar, an artificial horizon and a throttle
// gauge. Nothing here loads anything from the network.

import {
  FIELD, ISLANDS, PALETTE, RING_COUNT, RING_RADIUS, RINGS, RUNWAY, WIND,
} from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FOCAL = 760;
const HORIZON = 296;
const CX = FIELD.width / 2;
const GRID = 100; // terrain cell size, metres
const VIEW_AHEAD = 2400;
const VIEW_BEHIND = 120;

/** Colour for land at a given height and slope (0 flat, 1 steep). */
function landColor(h, slope) {
  if (h < 3.5) return PALETTE.sand;
  if (h > 165) return PALETTE.peak;
  if (h > 120 || slope > 0.55) return PALETTE.rock;
  if (h > 55) return PALETTE.forest;
  return PALETTE.grass;
}

/** Darken or lighten a hex colour by a factor. */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function headingName(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = FIELD.width;
  const H = FIELD.height;
  const rng = createRandom(20261126);

  // Clouds: fixed in the world, drifting slowly east, wrapping ahead of
  // the plane so the sky never runs out of them.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: (rng() * 2 - 1) * 1900,
      y: 250 + rng() * 150,
      z: rng() * 6000,
      s: 60 + rng() * 130,
      a: 0.5 + rng() * 0.4,
    });
  }
  // Sea sparkle: fixed points on the water that glint as the plane moves.
  const sparkles = [];
  for (let i = 0; i < 160; i += 1) {
    sparkles.push({ x: (rng() * 2 - 1) * 1900, z: rng() * 6000 });
  }
  // Gulltown's houses and Palm Cay's palms, fixed at build.
  const houses = [];
  for (let i = 0; i < 15; i += 1) {
    const side = rng() > 0.5 ? 1 : -1;
    houses.push({
      x: side * (55 + rng() * 130),
      z: 4720 + rng() * 640,
      w: 12 + rng() * 10,
      d: 10 + rng() * 8,
      h: 8 + rng() * 7,
      roof: ['#b8543f', '#7a5a3a', '#4a6b8a'][Math.floor(rng() * 3)],
      wall: ['#f2e6c8', '#e8dcc0', '#dfe8ee'][Math.floor(rng() * 3)],
    });
  }
  const palms = [];
  for (let i = 0; i < 9; i += 1) {
    const a = rng() * Math.PI * 2;
    palms.push({ x: 520 + Math.cos(a) * (180 + rng() * 90), z: 2150 + Math.sin(a) * (180 + rng() * 90), h: 10 + rng() * 5 });
  }
  const boats = [
    { x: -150, z: 4680, a: 0.4 },
    { x: -210, z: 4800, a: -0.3 },
    { x: 190, z: 4750, a: 1.2 },
  ];

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /** Project a world point into screen space; null when behind the camera. */
  function project(cam, x, y, z) {
    const dx = x - cam.x;
    const dz = z - cam.z;
    const fwd = dx * cam.sinH + dz * cam.cosH;
    if (fwd < 2) return null;
    const right = dx * cam.cosH - dz * cam.sinH;
    const up = y - cam.y - fwd * cam.tanPitch;
    const scale = FOCAL / fwd;
    return { x: CX + right * scale, y: HORIZON - up * scale, s: scale, fwd };
  }

  function drawSky(cam, plane, animT) {
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 60);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HORIZON + 60);
    // The sun, fixed ahead and to the right of the route.
    const sun = project(cam, 2600, 820, 7500);
    if (sun && sun.y > -60 && sun.y < HORIZON + 40) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 120);
      glow.addColorStop(0, 'rgba(255,243,196,0.95)');
      glow.addColorStop(0.35, 'rgba(255,226,150,0.55)');
      glow.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 130, sun.y - 130, 260, 260);
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // Clouds, drifting east, wrapping ahead of the plane.
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < clouds.length; i += 1) {
      const c = clouds[i];
      const cz = ((c.z - plane.z + 6000 * 2) % 6000) + plane.z - 400;
      const cx = c.x + animT * 2.2;
      const p = project(cam, cx, c.y, cz);
      if (!p || p.y < -80 || p.y > HORIZON + 30) continue;
      // A cloud almost on the camera would paint a giant white ellipse
      // over the whole frame.
      if (p.s > 6) continue;
      const s = c.s * p.s * 0.9;
      if (s < 4) continue;
      ctx.globalAlpha = c.a * 0.85;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.65, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSea(cam, plane, animT) {
    // The sea fills everything below the horizon that the land does not.
    const g = ctx.createLinearGradient(0, HORIZON - 20, 0, H);
    g.addColorStop(0, PALETTE.seaShallow);
    g.addColorStop(0.25, '#1d6d8c');
    g.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, HORIZON - 20, W, H - HORIZON + 20);
    // Horizon haze.
    ctx.fillStyle = 'rgba(246,217,168,0.35)';
    ctx.fillRect(0, HORIZON - 22, W, 10);
    // Glints on the water.
    ctx.fillStyle = PALETTE.seaSparkle;
    for (let i = 0; i < sparkles.length; i += 1) {
      const sp = sparkles[i];
      const sz = ((sp.z - plane.z + 6000 * 2) % 6000) + plane.z - 300;
      const p = project(cam, sp.x, 0.4, sz);
      if (!p || p.y < HORIZON - 10 || p.y > H - 4) continue;
      const tw = 0.5 + 0.5 * Math.sin(animT * 2 + i * 1.7);
      const len = Math.max(2, 26 * p.s);
      ctx.globalAlpha = 0.16 + 0.3 * tw;
      ctx.fillRect(p.x - len / 2, p.y, len, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawTerrain(cam, terrainHeight) {
    const zFar = Math.ceil((cam.z + VIEW_AHEAD) / GRID) * GRID;
    const zNear = Math.floor((cam.z - VIEW_BEHIND) / GRID) * GRID;
    const x0 = -1900;
    const x1 = 1900;
    // Painter's algorithm: far rows first, so nearer land overlaps farther.
    for (let z = zFar; z >= zNear; z -= GRID) {
      for (let x = x0; x < x1; x += GRID) {
        const h00 = terrainHeight(x, z);
        const h10 = terrainHeight(x + GRID, z);
        const h01 = terrainHeight(x, z + GRID);
        const h11 = terrainHeight(x + GRID, z + GRID);
        if (h00 < 0.6 && h10 < 0.6 && h01 < 0.6 && h11 < 0.6) continue;
        const p00 = project(cam, x, h00, z);
        const p10 = project(cam, x + GRID, h10, z);
        const p01 = project(cam, x, h01, z + GRID);
        const p11 = project(cam, x + GRID, h11, z + GRID);
        if (!p00 || !p10 || !p01 || !p11) continue;
        // A corner almost on the camera would paint a giant quad over
        // the whole frame; the ground that close is below the screen.
        if (p00.fwd < 12 || p10.fwd < 12 || p01.fwd < 12 || p11.fwd < 12) continue;
        const avg = (h00 + h10 + h01 + h11) / 4;
        const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h00)) / GRID;
        let col = landColor(avg, slope);
        // Shade by facing: a slope that climbs away from the camera is darker.
        // Low ground (sand) takes almost none of it, or the beach quilts.
        const facing = (h01 + h11 - h00 - h10) / (2 * GRID);
        const shadeAmt = Math.max(-0.08, Math.min(0.1, facing * 0.9)) * Math.min(1, avg / 25);
        col = shade(col, 1 - shadeAmt);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRing(cam, ring, index, ringState, animT) {
    const p = project(cam, ring.x, ring.y, ring.z);
    if (!p) return;
    // A ring almost on the camera plane projects to a giant ellipse that
    // fills the frame; it is behind the plane in a moment anyway.
    if (p.fwd < 120) return;
    const px = project(cam, ring.x + RING_RADIUS, ring.y, ring.z);
    const py = project(cam, ring.x, ring.y + RING_RADIUS, ring.z);
    if (!px || !py) return;
    const rx = Math.abs(px.x - p.x);
    const ry = Math.abs(py.y - p.y);
    if (rx < 2 || ry < 2) return;
    const passed = ringState.passed;
    const pulse = 0.75 + 0.25 * Math.sin(animT * 3 + index);
    const col = passed ? PALETTE.ringDone : PALETTE.ring;
    ctx.save();
    ctx.globalAlpha = passed ? 0.45 : 0.35 * pulse + 0.4;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, rx * 0.16);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = passed ? 0.8 : 1;
    ctx.lineWidth = Math.max(1.5, rx * 0.05);
    ctx.strokeStyle = '#fff6d8';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Ring number and chevrons point the way through.
    if (!passed) {
      ctx.fillStyle = '#fff6d8';
      ctx.font = `bold ${Math.max(11, Math.round(rx * 0.42))}px ${'system-ui, sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), p.x, p.y - ry - Math.max(10, rx * 0.35));
    }
    ctx.restore();
    // The burst when the plane flies through: expanding gold sparks.
    if (ringState.burst > 0) {
      const t = 1 - ringState.burst;
      ctx.save();
      ctx.globalAlpha = ringState.burst;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * (1 + t * 0.9), ry * (1 + t * 0.9), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRunway(cam, plane) {
    const z0 = RUNWAY.zStart;
    const z1 = RUNWAY.zEnd;
    const corners = [
      project(cam, RUNWAY.x - RUNWAY.halfWidth, RUNWAY.height, z0),
      project(cam, RUNWAY.x + RUNWAY.halfWidth, RUNWAY.height, z0),
      project(cam, RUNWAY.x + RUNWAY.halfWidth, RUNWAY.height, z1),
      project(cam, RUNWAY.x - RUNWAY.halfWidth, RUNWAY.height, z1),
    ];
    if (corners.some((c) => !c)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.fillStyle = PALETTE.runwayMark;
    for (let z = z0 + 60; z < z1 - 40; z += 80) {
      const a = project(cam, RUNWAY.x - 1.2, RUNWAY.height + 0.15, z);
      const b = project(cam, RUNWAY.x + 1.2, RUNWAY.height + 0.15, z + 34);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(a.x, b.y);
      ctx.closePath();
      ctx.fill();
    }
    for (const tz of [z0 + 24, z1 - 24]) {
      const a = project(cam, RUNWAY.x - 18, RUNWAY.height + 0.15, tz);
      const b = project(cam, RUNWAY.x + 18, RUNWAY.height + 0.15, tz + 10);
      if (!a || !b) continue;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.max(2, Math.abs(b.y - a.y)));
    }
    // Runway number 07 at the approach end.
    const num = project(cam, RUNWAY.x, RUNWAY.height + 0.2, z0 + 60);
    if (num && num.s > 0.06) {
      ctx.fillStyle = PALETTE.runwayMark;
      ctx.font = `bold ${Math.max(10, Math.min(64, Math.round(num.s * 16)))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('07', num.x, num.y);
    }
    // PAPI lights beside the threshold: two red, two white.
    for (let i = 0; i < 4; i += 1) {
      const p = project(cam, RUNWAY.x + RUNWAY.halfWidth + 8 + i * 7, RUNWAY.height + 1, z0 + 130);
      if (!p) continue;
      ctx.fillStyle = i < 2 ? '#ff5a4e' : '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, p.s * 14), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLandmarks(cam, terrainHeight, animT) {
    // Beacon Point lighthouse: a red-banded white tower with a rotating beam.
    const lx = -430;
    const lz = 1450;
    const base = terrainHeight(lx, lz);
    const top = project(cam, lx, base + 34, lz);
    const bot = project(cam, lx, base, lz);
    const topW = project(cam, lx + 4, base + 34, lz);
    if (top && bot && topW) {
      const halfW = Math.abs(topW.x - top.x);
      const botW = project(cam, lx + 5.5, base, lz);
      const halfBot = botW ? Math.abs(botW.x - bot.x) : halfW * 1.4;
      // Tower in three bands.
      const bands = ['#f4f1e6', '#d8402e', '#f4f1e6'];
      for (let i = 0; i < 3; i += 1) {
        const y0 = bot.y + ((top.y - bot.y) * i) / 3;
        const y1 = bot.y + ((top.y - bot.y) * (i + 1)) / 3;
        const w0 = halfBot + ((halfW - halfBot) * i) / 3;
        const w1 = halfBot + ((halfW - halfBot) * (i + 1)) / 3;
        ctx.fillStyle = bands[i];
        ctx.beginPath();
        ctx.moveTo(bot.x - w0, y0);
        ctx.lineTo(bot.x + w0, y0);
        ctx.lineTo(bot.x + w1, y1);
        ctx.lineTo(bot.x - w1, y1);
        ctx.closePath();
        ctx.fill();
      }
      // Lamp room and roof.
      ctx.fillStyle = '#2b3a4a';
      ctx.fillRect(top.x - halfW - 1, top.y - Math.max(3, halfW * 0.9), halfW * 2 + 2, Math.max(3, halfW * 0.9));
      ctx.fillStyle = '#d8402e';
      ctx.beginPath();
      ctx.moveTo(top.x - halfW - 1, top.y - Math.max(3, halfW * 0.9));
      ctx.lineTo(top.x, top.y - Math.max(6, halfW * 2.1));
      ctx.lineTo(top.x + halfW + 1, top.y - Math.max(3, halfW * 0.9));
      ctx.closePath();
      ctx.fill();
      // Rotating beam, only when the tower is far enough ahead that the
      // beam cannot sweep across the camera and wash out the frame.
      const beamA = animT * 0.9;
      const bx = Math.cos(beamA);
      const bz = Math.sin(beamA);
      const beamEnd = project(cam, lx + bx * 260, base + 30, lz + bz * 260);
      if (beamEnd && beamEnd.fwd > 80 && top.fwd > 80) {
        const grad = ctx.createLinearGradient(top.x, top.y, beamEnd.x, beamEnd.y);
        grad.addColorStop(0, 'rgba(255,244,180,0.5)');
        grad.addColorStop(1, 'rgba(255,244,180,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(beamEnd.x, beamEnd.y - 6);
        ctx.lineTo(beamEnd.x, beamEnd.y + 6);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Ember Peak smoke: grey puffs rising off the crater.
    const peak = ISLANDS.find((i) => i.name === 'Ember Peak');
    const peakH = peak.h;
    for (let i = 0; i < 6; i += 1) {
      const t = ((animT * 0.12 + i / 6) % 1);
      const p = project(cam, peak.x + Math.sin(i * 2.4) * 14 * t, peakH + 8 + t * 90, peak.z + Math.cos(i * 1.9) * 10 * t);
      if (!p) continue;
      ctx.fillStyle = `rgba(120,112,104,${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.s * (26 + t * 60)), 0, Math.PI * 2);
      ctx.fill();
    }
    // Gulltown houses: little boxes with pitched roofs.
    for (let i = 0; i < houses.length; i += 1) {
      const hs = houses[i];
      const gy = terrainHeight(hs.x, hs.z);
      const b0 = project(cam, hs.x - hs.w / 2, gy, hs.z - hs.d / 2);
      const b1 = project(cam, hs.x + hs.w / 2, gy, hs.z - hs.d / 2);
      const b2 = project(cam, hs.x + hs.w / 2, gy, hs.z + hs.d / 2);
      const b3 = project(cam, hs.x - hs.w / 2, gy, hs.z + hs.d / 2);
      const t0 = project(cam, hs.x - hs.w / 2, gy + hs.h, hs.z - hs.d / 2);
      const t1 = project(cam, hs.x + hs.w / 2, gy + hs.h, hs.z - hs.d / 2);
      const t2 = project(cam, hs.x + hs.w / 2, gy + hs.h, hs.z + hs.d / 2);
      const t3 = project(cam, hs.x - hs.w / 2, gy + hs.h, hs.z + hs.d / 2);
      const ridge = project(cam, hs.x, gy + hs.h + 5, hs.z);
      if (!b0 || !b1 || !b2 || !b3 || !t0 || !t1 || !t2 || !t3 || !ridge) continue;
      ctx.fillStyle = shade(hs.wall, 0.92);
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t0.x, t0.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(hs.wall, 0.78);
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = hs.roof;
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(ridge.x, ridge.y); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(ridge.x, ridge.y); ctx.closePath(); ctx.fill();
    }
    // Palm Cay palms: trunk and fronds.
    ctx.strokeStyle = '#6b4a2f';
    for (let i = 0; i < palms.length; i += 1) {
      const pl = palms[i];
      const gy = terrainHeight(pl.x, pl.z);
      const baseP = project(cam, pl.x, gy, pl.z);
      const topP = project(cam, pl.x, gy + pl.h, pl.z);
      if (!baseP || !topP) continue;
      ctx.lineWidth = Math.max(1, topP.s * 8);
      ctx.beginPath();
      ctx.moveTo(baseP.x, baseP.y);
      ctx.lineTo(topP.x, topP.y);
      ctx.stroke();
      ctx.strokeStyle = '#2f7a33';
      ctx.lineWidth = Math.max(1, topP.s * 5);
      for (let f = 0; f < 5; f += 1) {
        const a = (f / 5) * Math.PI * 2 + 0.4;
        const ex = project(cam, pl.x + Math.cos(a) * 7, gy + pl.h - 1.5, pl.z + Math.sin(a) * 7);
        if (!ex) continue;
        ctx.beginPath();
        ctx.moveTo(topP.x, topP.y);
        ctx.quadraticCurveTo((topP.x + ex.x) / 2, (topP.y + ex.y) / 2 + 3, ex.x, ex.y + 2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#6b4a2f';
    }
    // Harbour boats at anchor off Gulltown.
    for (let i = 0; i < boats.length; i += 1) {
      const b = boats[i];
      const p = project(cam, b.x, 1, b.z);
      const p2 = project(cam, b.x + Math.cos(b.a) * 14, 1, b.z + Math.sin(b.a) * 14);
      const mast = project(cam, b.x, 12, b.z);
      if (!p || !p2 || !mast) continue;
      ctx.strokeStyle = '#f4f1e6';
      ctx.lineWidth = Math.max(1, p.s * 4);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.strokeStyle = '#7a5a3a';
      ctx.lineWidth = Math.max(1, p.s * 3);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(mast.x, mast.y);
      ctx.stroke();
      // A little white sail on the mast.
      const sail = project(cam, b.x + Math.cos(b.a) * 5, 9, b.z + Math.sin(b.a) * 5);
      if (sail) {
        ctx.fillStyle = '#f8f4e8';
        ctx.beginPath();
        ctx.moveTo(mast.x, mast.y);
        ctx.lineTo(sail.x, sail.y);
        ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Windsock beside the runway, streaming with the wind.
    const wsBase = project(cam, RUNWAY.x + 38, RUNWAY.height, RUNWAY.zStart + 90);
    const wsTop = project(cam, RUNWAY.x + 38, RUNWAY.height + 9, RUNWAY.zStart + 90);
    if (wsBase && wsTop) {
      ctx.strokeStyle = '#dfe3e6';
      ctx.lineWidth = Math.max(1, wsTop.s * 5);
      ctx.beginPath();
      ctx.moveTo(wsBase.x, wsBase.y);
      ctx.lineTo(wsTop.x, wsTop.y);
      ctx.stroke();
      const sockEnd = project(cam, RUNWAY.x + 38 + 16, RUNWAY.height + 8.4, RUNWAY.zStart + 90 + 4);
      if (sockEnd) {
        ctx.strokeStyle = '#ff7a2e';
        ctx.lineWidth = Math.max(2, wsTop.s * 12);
        ctx.beginPath();
        ctx.moveTo(wsTop.x, wsTop.y);
        ctx.lineTo(sockEnd.x, sockEnd.y);
        ctx.stroke();
      }
    }
  }

  function drawParticles(cam, particles) {
    for (let i = 0; i < particles.length; i += 1) {
      const pt = particles[i];
      const p = project(cam, pt.x, pt.y, pt.z);
      if (!p) continue;
      // A burst almost on the camera would paint giant gold discs over
      // the frame; keep every spark small and skip the nearest ones.
      if (p.fwd < 30) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life));
      ctx.fillStyle = pt.color;
      const r = Math.min(26, Math.max(1.5, pt.size * p.s * 0.8));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The Kestrel herself, drawn from behind and slightly above. */
  function drawPlane(plane, animT, rolling) {
    const px = CX;
    const py = 452 + plane.pitch * 260;
    const scale = 1.15;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(plane.bank * 0.9);
    ctx.scale(scale, scale);
    // Prop blur and blades (they spin with time).
    const propA = animT * 42;
    ctx.fillStyle = 'rgba(220,225,230,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -58, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,66,74,0.75)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-Math.sin(propA) * 24, -58 - Math.cos(propA) * 28);
    ctx.lineTo(Math.sin(propA) * 24, -58 + Math.cos(propA) * 28);
    ctx.moveTo(-Math.cos(propA) * 24, -58 + Math.sin(propA) * 28);
    ctx.lineTo(Math.cos(propA) * 24, -58 - Math.sin(propA) * 28);
    ctx.stroke();
    // Tail: fin and stabilisers.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.beginPath();
    ctx.moveTo(-7, -96);
    ctx.lineTo(0, -128);
    ctx.lineTo(7, -96);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-52, -88);
    ctx.lineTo(52, -88);
    ctx.lineTo(38, -80);
    ctx.lineTo(-38, -80);
    ctx.closePath();
    ctx.fill();
    // Wings: broad, with a slight dihedral and red tips.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-14, -72);
    ctx.lineTo(-128, -38);
    ctx.lineTo(-118, -22);
    ctx.lineTo(-12, -52);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -72);
    ctx.lineTo(128, -38);
    ctx.lineTo(118, -22);
    ctx.lineTo(12, -52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-128, -38); ctx.lineTo(-118, -22); ctx.lineTo(-104, -26); ctx.lineTo(-114, -40); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(128, -38); ctx.lineTo(118, -22); ctx.lineTo(104, -26); ctx.lineTo(114, -40); ctx.closePath(); ctx.fill();
    // Fuselage: cream back, red belly, cheatline, cockpit windows.
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-16, -100);
    ctx.quadraticCurveTo(-20, -30, -13, 6);
    ctx.lineTo(13, 6);
    ctx.quadraticCurveTo(20, -30, 16, -100);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-15, -58);
    ctx.lineTo(15, -58);
    ctx.lineTo(13, 6);
    ctx.lineTo(-13, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c2f45';
    ctx.beginPath();
    ctx.moveTo(-11, -96);
    ctx.lineTo(11, -96);
    ctx.lineTo(9, -76);
    ctx.lineTo(-9, -76);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,245,0.85)';
    ctx.fillRect(-8, -93, 16, 5);
    // Mail sacks on the rear rack, and the registration.
    ctx.fillStyle = '#c9a86a';
    ctx.beginPath();
    ctx.ellipse(-7, -40, 6, 8, 0.2, 0, Math.PI * 2);
    ctx.ellipse(7, -40, 6, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b3a4a';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('G-KSTRL', 0, -18);
    // Navigation lights: red port, green starboard.
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(-124, -30, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39d353';
    ctx.beginPath(); ctx.arc(124, -30, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Landing-gear shadow on the strip while rolling.
    if (rolling) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py + 34, 60, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(18,24,32,0.72)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHUD(state, wind, animT) {
    const p = state.plane;
    const altM = Math.max(0, Math.round(p.y));
    const altFt = Math.round(p.y * 3.28084);
    const spdKmh = Math.round(p.speed * 3.6);
    const spdKt = Math.round(p.speed * 1.94384);
    const hdg = ((Math.round((p.heading * 180) / Math.PI) % 360) + 360) % 360;
    const vs = state.verticalSpeed || 0;

    ctx.textBaseline = 'alphabetic';
    // Top-left: the lit instruments, one row each.
    panel(14, 12, 238, 116);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('ALT', 26, 34);
    ctx.fillText('SPD', 26, 60);
    ctx.fillText('HDG', 26, 86);
    ctx.fillText('V/S', 26, 112);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`${altM} m`, 78, 36);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`${altFt} ft`, 168, 36);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`${spdKmh}`, 78, 62);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`km/h · ${spdKt} kt`, 132, 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`${String(hdg).padStart(3, '0')}°`, 78, 88);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(headingName(hdg), 142, 88);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, 78, 114);

    // Top-right: score, time, rings, attempts.
    panel(W - 252, 12, 238, 116);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('SCORE', W - 240, 32);
    ctx.fillText('TIME', W - 240, 58);
    ctx.fillText('RINGS', W - 240, 84);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(String(state.score), W - 168, 34);
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(fmtTime(state.time), W - 168, 60);
    ctx.fillText(`${state.ringsPassed} / ${RING_COUNT}`, W - 168, 86);
    // Ring dots.
    for (let i = 0; i < RING_COUNT; i += 1) {
      ctx.fillStyle = state.ringStates[i].passed ? PALETTE.hudGreen : 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(W - 168 + i * 15, 102, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Attempts as little planes.
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('MAIL', W - 60, 84);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('✈'.repeat(Math.max(0, state.attempts)), W - 60, 106);

    // Top-centre: the route progress bar with island names.
    const barX = 300;
    const barW = W - 600;
    const barY = 22;
    const progress = Math.max(0, Math.min(1, (p.z - (-160)) / (RUNWAY.zEnd + 160)));
    ctx.fillStyle = 'rgba(18,24,32,0.55)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, 10, 5);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * progress, 10, 5);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < RING_COUNT; i += 1) {
      const rx = barX + ((RINGS[i].z + 160) / (RUNWAY.zEnd + 160)) * barW;
      ctx.fillStyle = state.ringStates[i].passed ? PALETTE.hudGreen : '#fff';
      ctx.beginPath();
      ctx.arc(rx, barY + 5, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(RINGS[i].near, rx, barY + 24);
    }

    // Bottom strip: artificial horizon, compass tape, throttle, wind.
    panel(W / 2 - 250, H - 86, 500, 74);
    // Artificial horizon.
    const hx = W / 2 - 198;
    const hy = H - 49;
    const hr = 26;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-p.bank);
    ctx.translate(0, p.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-hr, -hr * 2, hr * 2, hr * 2);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-hr, 0, hr * 2, hr * 2);
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - hr, hy);
    ctx.lineTo(hx + hr, hy);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy + 2);
    ctx.lineTo(hx + 5, hy + 2);
    ctx.lineTo(hx, hy - 4);
    ctx.closePath();
    ctx.fill();
    // Compass tape.
    const tx = W / 2 - 140;
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, H - 78, 200, 58);
    ctx.clip();
    for (let d = -60; d <= 60; d += 15) {
      let deg = (hdg + d + 360) % 360;
      const x = tx + 100 + d * 1.6;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(x, H - 66);
      ctx.lineTo(x, H - 54);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(deg % 90 === 0 ? headingName(deg) : String(deg), x, H - 40);
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(tx + 100, H - 78);
    ctx.lineTo(tx + 94, H - 70);
    ctx.lineTo(tx + 106, H - 70);
    ctx.closePath();
    ctx.fill();
    // Throttle gauge.
    const gx = W / 2 + 92;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(gx, H - 66, 14, 52);
    ctx.fillStyle = PALETTE.hudGreen;
    ctx.fillRect(gx, H - 66 + 52 * (1 - p.throttle), 14, 52 * p.throttle);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THR', gx + 18, H - 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`${Math.round(p.throttle * 100)}%`, gx + 18, H - 46);
    // Wind.
    const wx = W / 2 + 168;
    const windKt = Math.round(Math.abs(wind) * 1.94);
    const windDir = wind >= 0 ? '→' : '←';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('WIND', wx, H - 62);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`${windDir} ${windKt} kt`, wx, H - 42);

    // Banner message.
    if (state.banner && state.bannerTtl > 0) {
      ctx.globalAlpha = Math.min(1, state.bannerTtl);
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(state.banner).width;
      ctx.fillStyle = 'rgba(18,24,32,0.72)';
      ctx.beginPath();
      ctx.roundRect(CX - tw / 2 - 18, 128, tw + 36, 40, 8);
      ctx.fill();
      ctx.fillStyle = '#ffe27a';
      ctx.fillText(state.banner, CX, 155);
      ctx.globalAlpha = 1;
    }
  }

  function overlay(title, lines, hint) {
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(title, CX, 210);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#d7e2ec';
    lines.forEach((line, i) => ctx.fillText(line, CX, 258 + i * 28));
    if (hint) {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(hint, CX, 258 + lines.length * 28 + 22);
    }
  }

  return {
    draw(state, screen, best, animT, wind) {
      const p = state.plane;
      const cam = {
        x: p.x - Math.sin(p.heading) * 22,
        y: p.y + 7.5,
        z: p.z - Math.cos(p.heading) * 22,
        sinH: Math.sin(p.heading),
        cosH: Math.cos(p.heading),
        tanPitch: Math.tan(p.pitch * 0.55 + 0.05),
      };
      drawSky(cam, p, animT);
      drawSea(cam, p, animT);
      // Terrain needs the height function: it is attached to the state by main.
      drawTerrain(cam, state.terrainHeight);
      drawRunway(cam, p);
      for (let i = 0; i < RING_COUNT; i += 1) {
        // Only rings near the plane are worth projecting.
        if (Math.abs(RINGS[i].z - p.z) < VIEW_AHEAD + 200) {
          drawRing(cam, RINGS[i], i, state.ringStates[i], animT);
        }
      }
      drawLandmarks(cam, state.terrainHeight, animT);
      drawParticles(cam, state.particles);
      if (screen !== SCREEN_TITLE) drawPlane(p, animT, state.rolling);
      else drawPlane(p, animT, false);
      drawHUD(state, wind, animT);

      if (screen === SCREEN_TITLE) {
        overlay(
          'SKY COURIER',
          [
            'The mail run over the Kestrel Isles — fly the Kestrel through all 7 rings,',
            'then bring her down on the runway at Gulltown Airstrip. Mind the crosswind.',
            '',
            '← → or A / D steer · ↑ ↓ or W / S climb & descend · Shift / Ctrl throttle',
            'Move the mouse to steer too · P pause · M mute · R retry after a crash',
            '',
            `Best score: ${best}`,
          ],
          'Press Space or click to fly',
        );
      } else if (screen === SCREEN_PAUSED) {
        overlay('PAUSED', ['The Kestrel is holding her course.'], 'Press P or Space to keep flying');
      } else if (screen === SCREEN_OVER) {
        if (state.landed) {
          overlay(
            'MAIL DELIVERED',
            [
              `Score ${state.score} · Best ${Math.max(best, state.score)}`,
              `Rings ${state.ringsPassed} of ${RING_COUNT} · Time ${fmtTime(state.time)}`,
              'Every letter arrived. Gulltown thanks you, courier.',
            ],
            'Press Enter to fly the route again',
          );
        } else {
          overlay(
            'RUN OVER',
            [
              `${state.crashReason || 'The mail run ended.'}`,
              `Score ${state.score} · Best ${Math.max(best, state.score)}`,
              `Rings ${state.ringsPassed} of ${RING_COUNT}`,
            ],
            'Press Enter to fly the route again',
          );
        }
      } else if (state.crashed && state.attempts > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(18,24,32,0.72)';
        ctx.font = 'bold 24px system-ui, sans-serif';
        const msg = `${state.crashReason} — press R to try again`;
        const tw = ctx.measureText(msg).width;
        ctx.beginPath();
        ctx.roundRect(CX - tw / 2 - 16, 200, tw + 32, 44, 8);
        ctx.fill();
        ctx.fillStyle = '#ff9a8a';
        ctx.fillText(msg, CX, 229);
      }
    },
  };
}
