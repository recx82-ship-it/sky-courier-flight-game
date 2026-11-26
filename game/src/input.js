// Keyboard and mouse input. Held keys give steering and pitch; one-shot
// presses (start, pause, mute, restart) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never
// counted twice. The mouse steers too: where the pointer sits relative to
// the centre of the canvas is the bank and pitch the pilot is asking for,
// so the game plays with keyboard alone, mouse alone, or both at once.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  // Mouse steering: -1..1 in each axis, 0 when the pointer is centred or
  // has never moved; the keyboard overrides it while a key is held.
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur, and forget the mouse too.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    throttleUp = false;
    throttleDown = false;
    mouseSeen = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    mouseY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    mouseSeen = true;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    steer() {
      if (left || right) return (right ? 1 : 0) - (left ? 1 : 0);
      if (mouseSeen && Math.abs(mouseX) > 0.06) return mouseX;
      return 0;
    },
    /** -1 to climb, 1 to descend (screen sense: pointer up climbs). */
    pitch() {
      if (up || down) return (down ? 1 : 0) - (up ? 1 : 0);
      if (mouseSeen && Math.abs(mouseY) > 0.06) return mouseY;
      return 0;
    },
    /** -1, 0 or 1: throttle down, hold, up. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
