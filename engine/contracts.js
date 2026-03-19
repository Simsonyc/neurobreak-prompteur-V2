/* ============================================================
   NeuroBreak™ Prompteur V2 — contracts.js (OFFICIEL FIGÉ V2)
   Source of truth for events and renderState
   ============================================================ */

/* ========================= STATES ========================= */
export const STATES = {
  SPLASH: "S0_SPLASH",
  CALIB_VOICE: "S1_CALIB_VOICE_INTRO",
  READY: "S5_READY",
  TEXT_LOADING: "S6_TEXT_LOADING",
  PRE_FOCUS: "S7_PRE_FOCUS",
  FOCUS_RUNNING: "S9_FOCUS_RUNNING",
  PAUSED_MANUAL: "S10_PAUSED_MANUAL",
  PAUSED_AUDIO: "S11_PAUSED_AUDIO",
  PAUSED_ORIENTATION: "S12_ORIENTATION_PAUSE",
};

/* ========================= EVENTS ========================= */
export const EVENTS = {
  // UI
  SELECT_MODE_STUDIO: "EV_SELECT_MODE_STUDIO",
  SELECT_MODE_SELFIE: "EV_SELECT_MODE_SELFIE",
  LOAD_TEXT: "EV_LOAD_TEXT",
  TEXT_LOADED_OK: "EV_TEXT_LOADED_OK",
  START_FOCUS: "EV_START_FOCUS",
  STOP: "EV_STOP",
  PAUSE_MANUAL: "EV_PAUSE_MANUAL",
  RESUME: "EV_RESUME",
  DRAG: "EV_DRAG",
  DRAG_END: "EV_DRAG_END",

  // AUDIO
  AUDIO_SPEAKING_TRUE: "EV_AUDIO_SPEAKING_TRUE",
  AUDIO_SPEAKING_FALSE: "EV_AUDIO_SPEAKING_FALSE",
  AUDIO_NO_SIGNAL: "EV_AUDIO_NO_SIGNAL",

  // ORIENTATION
  ORIENTATION_CHANGE: "EV_ORIENTATION_CHANGE",

  // SYSTEM
  ERROR: "EV_ERROR",

  // =========================
  // V2.0 SELFIE (nouveaux events garantis)
  // =========================
  ENTER_SELFIE_FOCUS: "EV_ENTER_SELFIE_FOCUS",
  EXIT_TO_HOME: "EV_EXIT_TO_HOME",
  TEXT_LOAD_RAW: "EV_TEXT_LOAD_RAW",
  START: "EV_START",
  TOGGLE_PAUSE_MANUAL: "EV_TOGGLE_PAUSE_MANUAL",
  PAUSE_AUDIO_SILENCE: "EV_PAUSE_AUDIO_SILENCE",
  RESUME_AUDIO_SPEAKING: "EV_RESUME_AUDIO_SPEAKING",
  SET_SCROLL_SPEED: "EV_SET_SCROLL_SPEED",
  SET_FONT_SIZE: "EV_SET_FONT_SIZE",
  SET_FONT_WEIGHT: "EV_SET_FONT_WEIGHT",
  SET_THRESHOLD_RMS: "EV_SET_THRESHOLD_RMS",
  SET_SILENCE_DELAY: "EV_SET_SILENCE_DELAY",
  MIC_PERMISSION: "EV_MIC_PERMISSION",
};

/* =========================
   RENDER STATE SHAPE (Runtime -> UI only)
   ========================= */

// V2.0 Selfie screens (définition manquante)
export const SCREENS = {
  HOME: "HOME",
  SELFIE_FOCUS: "SELFIE_FOCUS",
};

export const createRenderState = () => ({
  state: STATES.SPLASH,
  screen: SCREENS.HOME, // HOME | SELFIE_FOCUS (V2.0)
  mode: "STUDIO", // STUDIO | SELFIE
  orientation: "AUTO", // AUTO | PORTRAIT | LANDSCAPE
    offsetY: 0,
  scrollSpeed: 0,
  fontSize: 24,
  fontWeight: 600,
  thresholdRms: 0.08,
  silenceDelayMs: 900,
  isRunning: false,
  pauseReason: null, // "MANUAL" | "AUDIO" | "ORIENTATION"
  semanticTag: null, // e.g. "punch", "story"
  semanticMultiplier: 1,
  audioLevel: 0,
  isSpeaking: false,
  ui: {
    showControls: true,
    focusMode: false,
  },
});



