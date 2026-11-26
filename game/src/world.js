// The world: the Kestrel Isles terrain, the mail plane's flight model, the
// ring route, the runway landing, wind, particles and scoring. Everything
// is deterministic for a given seed: the same seed always builds the same
// islands, the same rings and the same wind, which is what makes the
// screenshot scenes repeatable.
//
// Events are bit flags returned by step(): the loop plays the sound and
// changes screen from them, and the autopilot in shots.js steers by
// reading the state directly.

import {
  ATTEMPTS, ISLANDS, LANDING_POINTS, PAR_SECONDS, PERFECT_BONUS,
  PLANE, RING_COUNT, RING_POINTS, RING_RADIUS, RINGS, RUNWAY, START, STEP, WIND,
} from './config.js';

export const EVENT_RING = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASH = 8;
export const EVENT_OVER = 16;

const NOISE_CELL = 220;
const NOISE_X0 = -2200;
const NOISE_Z0 = -600;

/** Smoothstep interpolation between a and b at t in [0,1]. */
function smooth(a, b, t) {
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}

export function createWorld(random) {
  // A coarse value-noise grid, fixed at build: the small bumps and
  // hollows that keep the terrain from looking like smooth maths.
  const noiseCols = 22;
  const noiseRows = 34;
  const noise = [];
  for (let i = 0; i < noiseCols * noiseRows; i += 1) noise.push(random());

  function noiseAt(x, z) {
    const fx = (x - NOISE_X0) / NOISE_CELL;
    const fz = (z - NOISE_Z0) / NOISE_CELL;
    const ix = Math.max(0, Math.min(noiseCols - 2, Math.floor(fx)));
    const iz = Math.max(0, Math.min(noiseRows - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const tz = Math.max(0, Math.min(1, fz - iz));
    const a = noise[iz * noiseCols + ix];
    const b = noise[iz * noiseCols + ix + 1];
    const c = noise[(iz + 1) * noiseCols + ix];
    const d = noise[(iz + 1) * noiseCols + ix + 1];
    return smooth(smooth(a, b, tx), smooth(c, d, tx), tz) - 0.5;
  }

  /** Height of the land in metres at (x, z); 0 is the sea. */
  function terrainHeight(x, z) {
    let h = 0;
    for (let i = 0; i < ISLANDS.length; i += 1) {
      const isl = ISLANDS[i];
      const dx = (x - isl.x) / isl.r;
      const dz = (z - isl.z) / isl.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9) h += isl.h * Math.exp(-d2 * 1.6);
    }
    // Small rolling bumps on land only, none in the open sea.
    if (h > 1) h += noiseAt(x, z) * 7 * Math.min(1, h / 20);
    // The runway strip is levelled: blend the land to the strip height
    // inside the Gulltown corridor so landing is fair.
    const inCorridor = Math.abs(x - RUNWAY.x) < 110 && z > RUNWAY.zStart - 260 && z < RUNWAY.zEnd + 260;
    if (inCorridor) {
      const edgeX = Math.max(0, (Math.abs(x - RUNWAY.x) - 40) / 70);
      const edgeZ = Math.max(0, Math.max(RUNWAY.zStart - 260 - z, z - (RUNWAY.zEnd + 260)) / 260);
      const edge = Math.max(edgeX, edgeZ);
      const w = Math.max(0, Math.min(1, 1 - edge));
      h = h * (1 - w) + RUNWAY.height * w;
    }
    return Math.max(0, h);
  }

  /** Crosswind in m/s at this point of the route (positive pushes east). */
  function windAt(z, time) {
    return WIND.base + WIND.swing * Math.sin(z / 1500 + 0.6) + WIND.gust * Math.sin(time * 0.7 + z / 900);
  }

  function freshPlane() {
    return {
      x: START.x, y: START.y, z: START.z,
      speed: START.speed, heading: START.heading,
      pitch: 0, bank: 0, throttle: 0.62,
    };
  }

  function freshState() {
    return {
      plane: freshPlane(),
      ringsPassed: 0,
      ringStates: RINGS.map(() => ({ passed: false, burst: 0 })),
      score: 0,
      time: 0,
      attempts: ATTEMPTS,
      rolling: false, // true while rolling out after touchdown
      rollout: 0,
      landed: false,
      crashed: false,
      crashReason: '',
      over: false,
      checkpoint: 0, // index of the last ring passed (respawn point)
      messages: [],
      particles: [],
      banner: '',
      bannerTtl: 0,
      best: 0,
    };
  }

  const state = freshState();

  function say(text, ttl = 2.2) {
    state.banner = text;
    state.bannerTtl = ttl;
  }

  function burst(x, y, z, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const b = random() * Math.PI - Math.PI / 2;
      state.particles.push({
        x, y, z,
        vx: Math.cos(a) * Math.cos(b) * speed,
        vy: Math.sin(b) * speed,
        vz: Math.sin(a) * Math.cos(b) * speed,
        life: 0.9 + random() * 0.5,
        color,
        size: 2 + random() * 3,
      });
    }
    if (state.particles.length > 240) state.particles.splice(0, state.particles.length - 240);
  }

  function respawn() {
    const cp = state.checkpoint;
    if (cp === 0) {
      state.plane = freshPlane();
    } else {
      const ring = RINGS[cp - 1];
      state.plane = {
        x: ring.x, y: ring.y + 25, z: ring.z - 260,
        speed: PLANE.cruiseSpeed, heading: 0, pitch: 0, bank: 0, throttle: 0.62,
      };
    }
    state.crashed = false;
    state.rolling = false;
    state.rollout = 0;
    say(cp === 0 ? 'Back to the start of the run.' : `Back to ring ${cp}.`, 2);
  }

  function crash(reason, splash) {
    state.crashed = true;
    state.attempts -= 1;
    state.crashReason = reason;
    burst(state.plane.x, Math.max(2, state.plane.y), state.plane.z, splash ? '#bfe8f2' : '#ff8a5c', splash ? 40 : 36, 26);
    if (state.attempts <= 0) {
      state.over = true;
      say('Out of attempts — the mail run is over.', 3);
    } else {
      say(`${reason} — ${state.attempts} ${state.attempts === 1 ? 'attempt' : 'attempts'} left. Press R to try again.`, 3);
    }
    return EVENT_CRASH | (state.over ? EVENT_OVER : 0);
  }

  function land() {
    const p = state.plane;
    const softness = Math.max(0, 1 - Math.abs(state.verticalSpeed || 0) / 7);
    const centre = Math.max(0, 1 - Math.abs(p.x - RUNWAY.x) / RUNWAY.halfWidth);
    const bonus = Math.round(LANDING_POINTS * (0.4 + 0.6 * softness) * (0.5 + 0.5 * centre));
    const timeBonus = Math.max(0, Math.round((PAR_SECONDS - state.time) * 3));
    const perfect = state.ringsPassed === RING_COUNT ? PERFECT_BONUS : 0;
    state.score += bonus + timeBonus + perfect;
    state.landed = true;
    state.rollout = 0;
    say(`LANDED! +${bonus} landing${timeBonus ? `, +${timeBonus} time` : ''}${perfect ? `, +${perfect} perfect route` : ''} — score ${state.score}`, 4);
    return EVENT_TOUCHDOWN | EVENT_LANDED;
  }

  return {
    state,
    terrainHeight,
    windAt,
    reset() {
      const fresh = freshState();
      Object.keys(fresh).forEach((k) => { state[k] = fresh[k]; });
    },
    respawn,
    /**
     * Advance the world one fixed step. steer is -1..1 (left..right),
     * pitchIn is -1..1 (climb..descend), throttleIn is -1..1, and
     * attract flies the scenic route with no crashes and no score.
     * Returns event flags for the loop to sound and announce.
     */
    step(dt, steer, pitchIn, throttleIn, attract) {
      const p = state.plane;
      let events = 0;
      state.time += dt;
      if (state.bannerTtl > 0) state.bannerTtl -= dt;

      // Particles age and drift, whatever the screen.
      for (let i = state.particles.length - 1; i >= 0; i -= 1) {
        const pt = state.particles[i];
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        pt.vy -= 4 * dt;
        if (pt.life <= 0) state.particles.splice(i, 1);
      }
      state.ringStates.forEach((r) => { if (r.burst > 0) r.burst -= dt; });

      if (state.over || state.crashed) return 0;
      if (state.rolling) {
        // Rolling out on the runway after touchdown: bleed speed off.
        p.speed = Math.max(0, p.speed - 26 * dt);
        p.z += p.speed * dt;
        p.y = RUNWAY.height + 1.6;
        state.rollout += dt;
        if (p.speed <= 2 && state.landed) {
          state.rolling = false;
          state.over = true;
          return EVENT_OVER;
        }
        return 0;
      }

      // --- Flight model ---
      const bankTarget = steer * PLANE.maxBank;
      p.bank += (bankTarget - p.bank) * Math.min(1, dt * 5);
      // Positive bank (right) turns the nose right (east of north).
      p.heading += p.bank * PLANE.turnRate * dt * (0.5 + p.speed / PLANE.maxSpeed);
      const pitchTarget = -pitchIn * PLANE.maxPitch;
      p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 4);
      p.throttle = Math.max(0.25, Math.min(1, p.throttle + throttleIn * dt * 0.5));
      const targetSpeed = PLANE.minSpeed + (PLANE.maxSpeed - PLANE.minSpeed) * p.throttle;
      p.speed += (targetSpeed - p.speed) * Math.min(1, dt * (PLANE.accel / 40));
      // Lift: climbing costs speed, descending gains it; too slow and she sinks.
      const climbRate = Math.sin(p.pitch) * p.speed;
      const sink = p.speed < PLANE.minSpeed ? (PLANE.minSpeed - p.speed) * PLANE.climbSink : 0;
      state.verticalSpeed = climbRate - sink;
      p.y += state.verticalSpeed * dt;
      const forward = p.speed * Math.cos(p.pitch);
      p.x += Math.sin(p.heading) * forward * dt + windAt(p.z, state.time) * dt;
      p.z += Math.cos(p.heading) * forward * dt;
      p.x = Math.max(-1900, Math.min(1900, p.x));

      if (attract) {
        // The title screen's scenic flight: stay above the land, loop the
        // route by drifting back to the start when the runway is passed.
        if (p.y < 85) p.y = 85;
        if (p.z > 5400) {
          p.z = -160;
          p.x = 0;
          p.heading = 0;
        }
        return 0;
      }

      // --- Rings ---
      for (let i = state.ringsPassed; i < RING_COUNT; i += 1) {
        const ring = RINGS[i];
        const prevZ = p.z - forward * dt;
        if (prevZ < ring.z && p.z >= ring.z) {
          const dx = p.x - ring.x;
          const dy = p.y - ring.y;
          if (Math.hypot(dx, dy) < RING_RADIUS) {
            state.ringStates[i].passed = true;
            state.ringStates[i].burst = 1;
            state.ringsPassed = i + 1;
            state.checkpoint = i + 1;
            state.score += RING_POINTS;
            burst(ring.x, ring.y, ring.z, '#ffc93c', 28, 22);
            say(`Ring ${i + 1} of ${RING_COUNT} — +${RING_POINTS}!${i + 1 === RING_COUNT ? ' Now land on the runway!' : ''}`, 2);
            events |= EVENT_RING;
          } else {
            say(`Missed ring ${i + 1} — keep flying, the runway is ahead.`, 2);
            state.ringsPassed = i + 1;
            state.checkpoint = i + 1;
          }
          break;
        }
      }

      // --- Landing and crashing ---
      const ground = terrainHeight(p.x, p.z);
      const overRunway = Math.abs(p.x - RUNWAY.x) < RUNWAY.halfWidth + 6
        && p.z > RUNWAY.zStart - 40 && p.z < RUNWAY.zEnd;
      const stripY = RUNWAY.height + 1.6;
      // The wheels touch a little before the fuselage reaches strip
      // height, so a slightly high flare still counts as a landing.
      if (overRunway && p.y <= stripY + 2 && p.z > RUNWAY.zStart) {
        const vs = Math.abs(state.verticalSpeed);
        const aligned = Math.abs(p.heading) < 0.3;
        if (vs < 8 && p.speed < 85 && aligned) {
          p.y = stripY;
          p.pitch = 0;
          p.bank = 0;
          state.rolling = true;
          burst(p.x, stripY, p.z, '#cfd8dc', 18, 10);
          events |= EVENT_TOUCHDOWN;
          if (state.ringsPassed >= RING_COUNT) {
            events |= land();
          } else {
            say('Touched down early — the run is not finished. Take off again!', 3);
            // A bounce: back into the air, rings still to fly.
            p.y = stripY + 6;
            p.speed = Math.max(p.speed, 55);
            p.pitch = 0.12;
            state.rolling = false;
          }
        } else {
          return crash(vs >= 8 ? 'Landed too hard' : !aligned ? 'Landed sideways' : 'Came in too fast', false) | events;
        }
      } else if (p.y <= ground + 1.5) {
        if (ground < 1) return crash('Ditched in the sea', true) | events;
        return crash('Clipped the terrain', false) | events;
      }
      // Past the runway with no landing: the run is over, out of strip.
      if (p.z > RUNWAY.zEnd + 400 && !state.landed) {
        return crash('Overshot the runway', false) | events;
      }
      if (p.y < 1.5 && ground < 1) {
        return crash('Ditched in the sea', true) | events;
      }
      return events;
    },
  };
}
