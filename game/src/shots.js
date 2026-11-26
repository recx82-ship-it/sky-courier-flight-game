// The screenshot scenes behind ?shot=cover|ring|landing|title. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (bank toward the next ring, climb
// or descend toward its height, ease off the throttle on final), so the
// frame is what a real flight looks like and the same seed always gives
// the same frame. The landing scene flies the whole route; the world
// steps are cheap, so that is seconds of work, not minutes.

import { RING_COUNT, RINGS, RUNWAY, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const COVER_SECONDS = 26;
const LANDING_LIMIT_SECONDS = 150;
const TITLE_SECONDS = 8;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Steer the plane toward `target` ({x, y, z}) and return the inputs the
 * world step takes: [steer, pitch, throttle].
 */
function autopilot(state, target, throttle) {
  const p = state.plane;
  const desiredHeading = Math.atan2(target.x - p.x, target.z - p.z);
  const headingErr = wrapAngle(desiredHeading - p.heading);
  // Positive steer banks right and turns right; the bank term damps the
  // turn so the plane settles instead of swinging past the line.
  const steer = clamp(headingErr * 3.0 - p.bank * 0.35, -1, 1);
  const altErr = target.y - p.y;
  const vs = state.verticalSpeed || 0;
  // Climb when the target is above (negative pitch input), and damp the
  // vertical speed: a fast climb asks for nose-down, a fast sink for nose-up.
  const pitch = clamp(-(altErr * 0.02) + vs * 0.02, -1, 1);
  return [steer, pitch, throttle];
}

/** The next thing to fly at: the next ring, or the runway once they are done.
 *  On final the target is a point ahead of the plane on the runway
 *  centreline, descending to the strip, so it can never fall behind the
 *  plane and ask for a turn-around on short final. */
function nextTarget(state) {
  if (state.ringsPassed < RING_COUNT) {
    const ring = RINGS[state.ringsPassed];
    return { x: ring.x, y: ring.y, z: ring.z };
  }
  const p = state.plane;
  const glideY = Math.max(RUNWAY.height, RUNWAY.height + 26 - (p.z - RUNWAY.zStart) * 0.06);
  return { x: 0, y: glideY, z: p.z + 400 };
}

function flyFor(world, seconds, throttleFn) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    if (state.over || state.crashed) break;
    const target = nextTarget(state);
    const [steer, pitch, throttle] = autopilot(state, target, throttleFn(state));
    world.step(STEP, steer, pitch, throttle, false);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it
 * and the best score to show. Any unknown name is the cover.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'title') {
    // The title screen's scenic flight: attract mode over the isles.
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
      world.step(STEP, 0.12, -0.08, 0, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'ring') {
    // Fly until the second ring is passed, then a heartbeat more, so the
    // gold burst is still in the air when the shutter falls.
    const limit = 120;
    for (let i = 0; i < limit / STEP; i += 1) {
      const state = world.state;
      if (state.ringsPassed >= 2 || state.over || state.crashed) break;
      const target = nextTarget(state);
      const [steer, pitch, throttle] = autopilot(state, target, 0);
      world.step(STEP, steer, pitch, throttle, false);
    }
    for (let i = 0; i < 0.18 / STEP; i += 1) {
      const state = world.state;
      const target = nextTarget(state);
      const [steer, pitch, throttle] = autopilot(state, target, 0);
      world.step(STEP, steer, pitch, throttle, false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'landing') {
    // Fly the whole route and hold the glide slope onto the runway:
    // throttle back on final so the approach is slow enough to land.
    for (let i = 0; i < LANDING_LIMIT_SECONDS / STEP; i += 1) {
      const state = world.state;
      if (state.over || state.crashed) break;
      const p = state.plane;
      const onFinal = p.z > 4300;
      const target = nextTarget(state);
      const throttle = onFinal ? -0.45 : 0;
      const [steer, pitch] = autopilot(state, target, throttle);
      world.step(STEP, steer, pitch, throttle, false);
      // Stop on short final, runway filling the view, gear about to touch.
      if (onFinal && p.z > 4620 && p.z < 4760 && p.y < 60) break;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // Cover: mid-route, a ring ahead over Palm Cay, islands all around.
  flyFor(world, COVER_SECONDS, () => 0);
  return { screen: SCREEN_PLAY, best: 0 };
}
