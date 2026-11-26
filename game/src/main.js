// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens:
// title, play, paused and over (landed or out of attempts).
//
// ?seed=N fixes the islands and the wind. ?shot=cover|ring|landing|title
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_LANDED, EVENT_OVER, EVENT_RING, EVENT_TOUCHDOWN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Animation time the screenshot scenes use, so a staged frame never moves. */
const SHOT_ANIM_T = 12;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261126;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
// The renderer projects the terrain through this, attached to the state
// so the draw call needs nothing else.
world.state.terrainHeight = world.terrainHeight;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    const p = world.state.plane;
    renderer.draw(world.state, scene.screen, scene.best, SHOT_ANIM_T, world.windAt(p.z, world.state.time));
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce('Flying the mail run. Seven rings, then land at Gulltown.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(world.state.landed
      ? `Mail delivered. Score ${world.state.score}. Best ${best}.`
      : `Run over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    } else if (actions & ACTION_RESTART && screen === SCREEN_PLAY && world.state.crashed && world.state.attempts > 0) {
      world.respawn();
      audio.click();
      announce('Trying again.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, 0.12, -0.08, 0, true);
      return;
    }
    const events = world.step(STEP, input.steer(), input.pitch(), input.throttle(), false);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_TOUCHDOWN) audio.thud();
    if (events & EVENT_LANDED) audio.fanfare();
    if (events & EVENT_CRASH) {
      if (world.state.crashReason.includes('sea')) audio.splash();
      else audio.crash();
    }
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_CRASH) {
      announce(`${world.state.crashReason}. ${world.state.attempts} ${world.state.attempts === 1 ? 'attempt' : 'attempts'} left. Press R.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.plane;
    audio.engine(p.throttle, p.speed, screen === SCREEN_PLAY && !world.state.crashed && !world.state.over);
    renderer.draw(world.state, screen, best, now / 1000, world.windAt(p.z, world.state.time));
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A read-only handle for play-tests: the world and the screen, nothing more.
  window.__skyCourier = { world, get screen() { return screen; } };

  announce('Sky Courier. Press Space or click to fly the mail run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
