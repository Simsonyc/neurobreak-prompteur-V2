/* ============================================================
   NeuroBreak™ Prompteur V2 — core-engine.js
   IA-CORE: logique pure (machine d'état). Zéro DOM/CSS/UI.
   ============================================================ */

import { STATES, EVENTS } from "./contracts.js";

/**
 * Shape stable renvoyée par core.dispatch(event)
 * (runtime la projette vers renderState)
 */
function createCoreState() {
  return {
    state: STATES.SPLASH,
    mode: "STUDIO", // STUDIO | SELFIE
    orientation: "AUTO", // AUTO | PORTRAIT | LANDSCAPE
    isRunning: false,
    pauseReason: null, // null | "MANUAL" | "AUDIO" | "ORIENTATION"
    scrollSpeed: 80,
    fontSize: 24,
    fontWeight: 600,
    thresholdRms: 0.02,
    silenceDelayMs: 900,
    silenceStartedAt: 0,
    lastSilenceDurationMs: 0,
  };
}

/**
 * Engine = state machine pure.
 * - Ne connaît pas le DOM
 * - Ne connaît pas les modules motion/audio/semantic/ui
 */
export function createCoreEngine(initial = {}) {
  const s = Object.assign(createCoreState(), initial);

  // Pour resumer après une pause “système” (audio/orientation), sans perdre l'intention.
  let resumeTargetState = STATES.READY; // fallback
  let resumeTargetIsRunning = false;

  function snapshotResumeTarget() {
    // Si on est déjà en pause manuelle, on ne veut pas “auto-resume”.
    if (s.state === STATES.PAUSED_MANUAL) return;

    // On mémorise uniquement les états utiles au retour.
    if (s.state === STATES.FOCUS_RUNNING) {
      resumeTargetState = STATES.FOCUS_RUNNING;
      resumeTargetIsRunning = true;
      return;
    }
    if (s.state === STATES.PRE_FOCUS) {
      resumeTargetState = STATES.PRE_FOCUS;
      resumeTargetIsRunning = false;
      return;
    }
    if (s.state === STATES.READY) {
      resumeTargetState = STATES.READY;
      resumeTargetIsRunning = false;
      return;
    }
    // par défaut on conserve le dernier snapshot connu
  }

  function toSplash() {
    s.state = STATES.SPLASH;
    s.isRunning = false;
    s.pauseReason = null;
    snapshotResumeTarget();
  }

  function toReady() {
    s.state = STATES.READY;
    s.isRunning = false;
    s.pauseReason = null;
    snapshotResumeTarget();
  }

  function toTextLoading() {
    s.state = STATES.TEXT_LOADING;
    s.isRunning = false;
    s.pauseReason = null;
    snapshotResumeTarget();
  }

  function toPreFocus() {
    s.state = STATES.PRE_FOCUS;
    s.isRunning = false;
    s.pauseReason = null;
    snapshotResumeTarget();
  }

  function toFocusRunning() {
    s.state = STATES.FOCUS_RUNNING;
    s.isRunning = true;
    s.pauseReason = null;
    snapshotResumeTarget();
  }

  function toPausedManual() {
    snapshotResumeTarget();
    s.state = STATES.PAUSED_MANUAL;
    s.isRunning = false;
    s.pauseReason = "MANUAL";
  }

  function toPausedAudio() {
    snapshotResumeTarget();
    s.state = STATES.PAUSED_AUDIO;
    s.isRunning = false;
    s.pauseReason = "AUDIO";
  }

  function toPausedOrientation() {
    snapshotResumeTarget();
    s.state = STATES.PAUSED_ORIENTATION;
    s.isRunning = false;
    s.pauseReason = "ORIENTATION";
  }

  function canStartFocus() {
    return (
      s.state === STATES.PRE_FOCUS ||
      s.state === STATES.READY // tolérant : si UI force start
    );
  }

  function canResumeManual() {
    return (
      s.state === STATES.PAUSED_MANUAL ||
      s.state === STATES.PAUSED_AUDIO ||
      s.state === STATES.PAUSED_ORIENTATION
    );
  }

  /**
   * event = { type: EVENTS.X, ...payload }
   * Retourne le coreState (toujours), stable.
   */
  function dispatch(event) {
    if (!event || !event.type) return { ...s };

    switch (event.type) {
      /* ================= UI ================= */
      case EVENTS.SELECT_MODE_STUDIO: {
        s.mode = "STUDIO";
        if (s.state === STATES.SPLASH) toReady();
        return { ...s };
      }
      case EVENTS.SELECT_MODE_SELFIE: {
        s.mode = "SELFIE";
        if (s.state === STATES.SPLASH) toReady();
        return { ...s };
      }

      case EVENTS.LOAD_TEXT: {
        // autorisé depuis READY/SPLASH/PAUSE
        if (
          s.state === STATES.READY ||
          s.state === STATES.SPLASH ||
          s.state === STATES.PAUSED_MANUAL ||
          s.state === STATES.PAUSED_AUDIO ||
          s.state === STATES.PAUSED_ORIENTATION
        ) {
          toTextLoading();
        }
        return { ...s };
      }

      case EVENTS.TEXT_LOADED_OK: {
        if (s.state === STATES.TEXT_LOADING) {
          toPreFocus();
        }
        return { ...s };
      }

      case EVENTS.START_FOCUS: {
        if (canStartFocus()) {
          toFocusRunning();
        }
        return { ...s };
      }

      case EVENTS.PAUSE_MANUAL: {
        // pause manuelle prend le dessus sur tout
        if (
  s.state === STATES.FOCUS_RUNNING ||
  s.state === STATES.PRE_FOCUS ||
  s.state === STATES.TEXT_LOADING ||
  s.state === STATES.PAUSED_AUDIO ||
  s.state === STATES.PAUSED_ORIENTATION
) {
  toPausedManual();
}
        return { ...s };
      }

      case EVENTS.RESUME: {
        // RESUME (manuel) ne doit PAS auto-resume si stop/ready
        if (!canResumeManual()) return { ...s };

        // Si pause manuelle: on reprend le target mémorisé
        if (s.state === STATES.PAUSED_MANUAL) {
          if (resumeTargetState === STATES.FOCUS_RUNNING) toFocusRunning();
          else if (resumeTargetState === STATES.PRE_FOCUS) toPreFocus();
          else toReady();
          return { ...s };
        }

        // Si pause audio/orientation: RESUME force la reprise (priorité user)
        if (s.state === STATES.PAUSED_AUDIO || s.state === STATES.PAUSED_ORIENTATION) {
          if (resumeTargetState === STATES.FOCUS_RUNNING) toFocusRunning();
          else if (resumeTargetState === STATES.PRE_FOCUS) toPreFocus();
          else toReady();
        }

        return { ...s };
      }

      case EVENTS.STOP: {
        // STOP = retour READY (reset run/pause)
        toReady();
        return { ...s };
      }

      case EVENTS.DRAG:
      case EVENTS.DRAG_END: {
        // Core n'interprète pas le drag (c’est motion), mais on pourrait bloquer le run si besoin.
        // Ici: no-op.
        return { ...s };
      }

      /* ================= AUDIO ================= */
      case EVENTS.AUDIO_NO_SIGNAL: {
        // Si on est en focus et audio disparaît => pause audio
        if (s.state === STATES.FOCUS_RUNNING) {
          toPausedAudio();
        }
        return { ...s };
      }

            case EVENTS.AUDIO_SPEAKING_FALSE: {
        if (typeof event.silenceStartedAt === "number") {
          s.silenceStartedAt = event.silenceStartedAt;
        }
        // Si la logique de focus dépend de la voix => pause audio
        // (sécurité: seulement si running)
        if (s.state === STATES.FOCUS_RUNNING) {
          toPausedAudio();
        }
        return { ...s };
      }

      case EVENTS.AUDIO_SPEAKING_TRUE: {
        if (typeof event.silenceDurationMs === "number") {
          s.lastSilenceDurationMs = event.silenceDurationMs;
        }
        s.silenceStartedAt = 0;
        // Si on était en pause audio, on reprend automatiquement le run
        if (s.state === STATES.PAUSED_AUDIO) {
          // reprend uniquement si c'était l'intention précédente
          if (resumeTargetIsRunning || resumeTargetState === STATES.FOCUS_RUNNING) {
            toFocusRunning();
          } else if (resumeTargetState === STATES.PRE_FOCUS) {
            toPreFocus();
          } else {
            toReady();
          }
        }
        return { ...s };
      }

      /* ================= ORIENTATION ================= */
      case EVENTS.ORIENTATION_CHANGE: {
        // payload conseillé:
        // { orientation: "PORTRAIT"|"LANDSCAPE"|"AUTO", shouldPause?: boolean }
        if (typeof event.orientation === "string") {
          s.orientation = event.orientation;
        }

        const shouldPause = !!event.shouldPause;

        if (shouldPause) {
          // pause orientation prend le dessus, mais pas au-dessus d'une pause manuelle
          if (s.state !== STATES.PAUSED_MANUAL) {
            toPausedOrientation();
          }
          return { ...s };
        }

        // orientation OK: si on était en pause orientation, on reprend la cible
        if (s.state === STATES.PAUSED_ORIENTATION) {
          if (resumeTargetIsRunning || resumeTargetState === STATES.FOCUS_RUNNING) {
            toFocusRunning();
          } else if (resumeTargetState === STATES.PRE_FOCUS) {
            toPreFocus();
          } else {
            toReady();
          }
        }

        return { ...s };
      }
/* ================= ADVANCED ================= */
case EVENTS.SET_SCROLL_SPEED:
case "EV_SET_SCROLL_SPEED": {
  const v = Number(event.value ?? event.scrollSpeed);
  if (!Number.isNaN(v)) s.scrollSpeed = v;
  return { ...s };
}
case EVENTS.SET_FONT_SIZE:
case "EV_SET_FONT_SIZE": {
  const v = Number(event.value ?? event.fontSize);
  if (!Number.isNaN(v)) s.fontSize = v;
  return { ...s };
}
case EVENTS.SET_FONT_WEIGHT:
case "EV_SET_FONT_WEIGHT": {
  const v = Number(event.value ?? event.fontWeight);
  if (!Number.isNaN(v)) s.fontWeight = v;
  return { ...s };
}
case EVENTS.SET_THRESHOLD_RMS:
case "EV_SET_THRESHOLD_RMS": {
  const v = Number(event.value ?? event.thresholdRms);
  if (!Number.isNaN(v)) s.thresholdRms = v;
  return { ...s };
}
case EVENTS.SET_SILENCE_DELAY:
case "EV_SET_SILENCE_DELAY": {
  const v = Number(event.value ?? event.silenceDelayMs);
  if (!Number.isNaN(v)) s.silenceDelayMs = v;
  return { ...s };
}
      /* ================= SYSTEM ================= */
      case EVENTS.ERROR: {
        // fallback safe: stop focus, return ready (ou splash si tu préfères)
        toReady();
        return { ...s };
      }
      default:
        return { ...s };
    }
  }

      
  function getState() {
    return { ...s };
  }

  return {
    dispatch,
    getState,
  };
}
