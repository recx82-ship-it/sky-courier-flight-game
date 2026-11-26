// Every tuning number, colour and piece of the Kestrel Isles in one place.
// The world is metres: x is lateral (east), y is altitude, z is forward
// along the mail route. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule depends on the screen.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The mail run: 7 rings over the isles, then land on Gulltown's runway. */
export const RING_COUNT = 7;
export const RING_RADIUS = 30;
export const RING_POINTS = 100;
export const PERFECT_BONUS = 200;
export const LANDING_POINTS = 500;
export const PAR_SECONDS = 110;

/** Three attempts per run; a crash costs one and respawns at the last ring. */
export const ATTEMPTS = 3;

/** The plane: a single-engine bush mail plane, the "Kestrel". */
export const PLANE = {
  minSpeed: 38, // m/s: below this the wings stop flying and she sinks
  cruiseSpeed: 72,
  maxSpeed: 98,
  accel: 14, // m/s per second toward the throttle's target speed
  maxBank: 0.61, // radians, ~35 deg
  turnRate: 0.55, // heading change per second at full bank
  maxPitch: 0.38, // radians, ~22 deg
  pitchRate: 1.4,
  climbSink: 0.9, // extra sink when slow, m/s per (m/s under min speed)
};

/** Wind: a sea breeze that swings with the route; knots shown on the HUD. */
export const WIND = {
  base: 4, // m/s crosswind at the start
  swing: 4, // m/s it swings by along the route
  gust: 1.5,
};

export const RUNWAY = {
  x: 0,
  zStart: 4800,
  zEnd: 6000,
  halfWidth: 24,
  height: 12, // the strip is levelled at 12 m on Gulltown
  heading: 0, // runway 07/25 runs along +z
};

export const START = { x: 0, y: 90, z: -160, speed: 62, heading: 0 };

/** Named islands: gaussian bumps that make the terrain. */
export const ISLANDS = [
  { name: 'Tern Rock', x: -620, z: 700, r: 260, h: 46 },
  { name: 'Beacon Point', x: -430, z: 1450, r: 300, h: 34 },
  { name: 'Palm Cay', x: 520, z: 2150, r: 340, h: 26 },
  { name: 'Ember Peak', x: 980, z: 3050, r: 520, h: 185 },
  { name: 'Gulltown', x: 0, z: 5100, r: 900, h: 60 },
  { name: 'Skerry', x: -980, z: 3900, r: 240, h: 38 },
];

/** The rings of the mail route: x, altitude, z, and the island they pass. */
export const RINGS = [
  { x: -60, y: 95, z: 620, near: 'Tern Rock' },
  { x: -260, y: 85, z: 1380, near: 'Beacon Point' },
  { x: 60, y: 110, z: 2080, near: 'Palm Cay' },
  { x: 380, y: 130, z: 2780, near: 'Ember Peak' },
  { x: -160, y: 100, z: 3480, near: 'Skerry' },
  { x: 120, y: 90, z: 4080, near: 'Gulltown' },
  { x: 0, y: 70, z: 4560, near: 'Airstrip' },
];

export const PALETTE = {
  skyTop: '#2f6fb8',
  skyMid: '#7fb2dd',
  skyHorizon: '#f6d9a8',
  sun: '#fff3c4',
  seaDeep: '#14506e',
  seaShallow: '#2f8fb0',
  seaSparkle: '#bfe8f2',
  sand: '#e8d29a',
  grass: '#5d9b4a',
  forest: '#3e7a38',
  rock: '#8a7a68',
  peak: '#e9e4da',
  ash: '#6e6258',
  ring: '#ffc93c',
  ringDone: '#7ee787',
  runway: '#3a3f46',
  runwayMark: '#f4f6f8',
  planeBody: '#e8442e',
  planeCream: '#f6ead2',
  planeTrim: '#1f3a5f',
  panel: '#20262e',
  panelLit: '#2e3947',
  hudText: '#f2f7fb',
  hudAmber: '#ffcf5c',
  hudGreen: '#7ee787',
  hudRed: '#ff6b5e',
  text: '#eef1f5',
  muted: '#9fb2c3',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier.best';
