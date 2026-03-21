/* ============================================================
   NeuroBreak™ Prompteur V2 — runtime.js
   Orchestrateur central (aucun DOM). Dispatch unique.
   - Reçoit events UI/audio/orientation
   - Appelle core + hooks motion/audio/semantic
   - Push renderState vers ui.render(renderState)
   ============================================================ */

import { STATES, EVENTS, createRenderState } from "./contracts.js";

/**
 * createRuntime({ core, motion, audio, semantic, ui, clock? })
 *
 * Hooks attendus (optionnels, sans dépendance dure) :
 * - motion.update(ctx, dt) -> { offsetY, scrollSpeed } (ou partiel)
 * - motion.onCoreStateChange?.(coreState, prevCoreState)
 * - motion.onEvent?.(event)
 *
 * - audio.tick?.() -> { isSpeaking:boolean, confidence:number, hasSignal?:boolean }
 * - audio.onCoreStateChange?.(coreState, prevCoreState)
 * - audio.onEvent?.(event)
 *
 * - semantic.getModifier?.(offsetY) -> { speedMultiplier?:number, semanticTag?:string }
 *
 * - ui.render(renderState) -> void
 */
export function createRuntime({ core, motion, audio, semantic, ui, clock } = {}) {
  if (!core || typeof core.dispatch !== "function") {
    throw new Error("runtime: core is required (must expose dispatch(event)).");
  }
  if (!ui || typeof ui.render !== "function") {
    throw new Error("runtime: ui is required (must expose render(renderState)).");
  }

  const nowFn =
    clock?.now ||
    (() => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()));

  let renderState = createRenderState();

  // core state mirror
  let coreState = core.getState ? core.getState() : core.dispatch({ type: "__INIT__" });
  let prevCoreState = { ...coreState };

  // Edge-detection audio events (évite de spammer core à chaque frame)
  let lastSpeaking = null; // unknown
  let lastHasSignal = null; // unknown

  let running = false;
  let rafId = null;
  let lastTime = nowFn();
  let dragActive = false;
  let dragDeltaY = 0;

  function projectCoreToRender(cs) {
  renderState.state = cs.state;
  renderState.mode = cs.mode;
  renderState.orientation = cs.orientation;
  renderState.isRunning = cs.isRunning;
  renderState.pauseReason = cs.pauseReason;

  renderState.scrollSpeedTarget =
    typeof cs.scrollSpeed === "number" ? cs.scrollSpeed : renderState.scrollSpeedTarget;

  renderState.fontSize = typeof cs.fontSize === "number" ? cs.fontSize : renderState.fontSize;
  renderState.fontWeight = typeof cs.fontWeight === "number" ? cs.fontWeight : renderState.fontWeight;
  renderState.thresholdRms = typeof cs.thresholdRms === "number" ? cs.thresholdRms : renderState.thresholdRms;
    renderState.silenceDelayMs =
    typeof cs.silenceDelayMs === "number" ? cs.silenceDelayMs : renderState.silenceDelayMs;
  renderState.lastSilenceDurationMs =
    typeof cs.lastSilenceDurationMs === "number" ? cs.lastSilenceDurationMs : renderState.lastSilenceDurationMs;

  renderState.ui.focusMode = cs.state === STATES.FOCUS_RUNNING;
}

  // init projection
  projectCoreToRender(coreState);

  /* =========================
     INTERNAL LOOP
     ========================= */
  function tick() {
    if (!running) return;

    const t = nowFn();
    const dt = t - lastTime;
    lastTime = t;

    /* ---------- AUDIO (read-only tick + edge events) ---------- */
    if (audio && typeof audio.tick === "function") {
      const out = audio.tick();

            if (out) {
        const isSpeaking = !!out.isSpeaking;
        const confidence = typeof out.confidence === "number" ? out.confidence : 0;
        const silenceDurationMs = typeof out.silenceDurationMs === "number" ? out.silenceDurationMs : undefined;
        const silenceStartedAt = typeof out.silenceStartedAt === "number" ? out.silenceStartedAt : undefined;

        renderState.isSpeaking = isSpeaking;
        renderState.audioLevel = confidence;

        const hasSignal =
          typeof out.hasSignal === "boolean"
            ? out.hasSignal
            : true; // default: assume signal exists if not provided

        // No signal edge
        if (lastHasSignal !== null && lastHasSignal === true && hasSignal === false) {
          internalDispatch({ type: EVENTS.AUDIO_NO_SIGNAL });
        }
        lastHasSignal = hasSignal;

        // Speaking edge
        if (lastSpeaking !== null && lastSpeaking !== isSpeaking) {
          internalDispatch(
            isSpeaking
              ? { type: EVENTS.AUDIO_SPEAKING_TRUE, silenceDurationMs, silenceStartedAt }
              : { type: EVENTS.AUDIO_SPEAKING_FALSE, silenceStartedAt }
          );
        }
        lastSpeaking = isSpeaking;
      }
    }

    /* ---------- SEMANTIC (offset-based modifier) ---------- */
    let semanticMultiplier = 1;
    let semanticTag = null;

    if (semantic && typeof semantic.getModifier === "function") {
      const sem = semantic.getModifier(renderState.offsetY);
      if (sem) {
        semanticMultiplier = typeof sem.speedMultiplier === "number" ? sem.speedMultiplier : 1;
        semanticTag = typeof sem.semanticTag === "string" ? sem.semanticTag : null;
      }
    }

    renderState.semanticMultiplier = semanticMultiplier;
    renderState.semanticTag = semanticTag;

    /* ---------- MOTION (pure update) ---------- */
        if (motion && typeof motion.update === "function") {
      const motionOut = motion.update(
    {
    isRunning: renderState.isRunning,
    semanticMultiplier,
    pauseReason: renderState.pauseReason,
    baseSpeed:
      typeof renderState.scrollSpeedTarget === "number" ? renderState.scrollSpeedTarget : 220,
    fontSize: renderState.fontSize,
    fontWeight: renderState.fontWeight,
    state: renderState.state,
    mode: renderState.mode,
    orientation: renderState.orientation,
        offsetY: renderState.offsetY,
    scrollSpeed: renderState.scrollSpeed,
    isDragging: dragActive,
    deltaY: dragDeltaY,
    lastSilenceDurationMs: renderState.lastSilenceDurationMs,
       silenceDelayMs: renderState.silenceDelayMs,  // ← ajouter ceci
  },
  dt
);


      if (motionOut && typeof motionOut === "object") {
        if (typeof motionOut.offsetY === "number") renderState.offsetY = motionOut.offsetY;
        if (typeof motionOut.scrollSpeed === "number") renderState.scrollSpeed = motionOut.scrollSpeed;
      }
    }

    /* ---------- PUSH TO UI ---------- */
    ui.render(renderState);

    rafId = requestAnimationFrame(tick);
  }

  /* =========================
     DISPATCH UNIQUE (public)
     ========================= */
  function internalDispatch(event) {
    // 1) pre-hooks (optional)
    motion?.onEvent?.(event);
    audio?.onEvent?.(event);

        if (event?.type === EVENTS.DRAG) {
      dragActive = true;
      dragDeltaY = typeof event.deltaY === "number" ? event.deltaY : 0;
    } else if (event?.type === EVENTS.DRAG_END) {
      dragActive = false;
      dragDeltaY = 0;
    } else if (event?.type === "EV_SET_AUDIO_INPUT_DEVICE") {
      if (typeof event.deviceId === "string" && event.deviceId) {
        audio?.configure?.({ deviceId: event.deviceId });
        if (typeof audio?.stop === "function" && typeof audio?.start === "function") {
          (async () => {
            try { audio.stop(); await audio.start(); } catch {}
          })();
        }
      }
    }

    // 2) core transition
    prevCoreState = coreState;
    coreState = core.dispatch(event) || coreState;

    // 3) post-hooks on core state change
    const coreChanged =
  coreState.state !== prevCoreState.state ||
  coreState.mode !== prevCoreState.mode ||
  coreState.orientation !== prevCoreState.orientation ||
  coreState.isRunning !== prevCoreState.isRunning ||
  coreState.pauseReason !== prevCoreState.pauseReason ||
  coreState.scrollSpeed !== prevCoreState.scrollSpeed ||
  coreState.fontSize !== prevCoreState.fontSize ||
  coreState.fontWeight !== prevCoreState.fontWeight ||
  coreState.thresholdRms !== prevCoreState.thresholdRms ||
  coreState.silenceDelayMs !== prevCoreState.silenceDelayMs;

        if (coreChanged) {
      motion?.onCoreStateChange?.(coreState, prevCoreState);
      audio?.onCoreStateChange?.(coreState, prevCoreState);
      const nextAudioCfg = {};
      if (typeof coreState.thresholdRms === "number") nextAudioCfg.thresholdRms = coreState.thresholdRms;
      if (typeof coreState.silenceDelayMs === "number") nextAudioCfg.silenceDelayMs = coreState.silenceDelayMs;
      if (Object.keys(nextAudioCfg).length) audio?.configure?.(nextAudioCfg);
    }

    // 4) project to renderState
    projectCoreToRender(coreState);

    // 5) push immediately (event-driven render)
    ui.render(renderState);

    return coreState;
  }

  function dispatch(event) {
    return internalDispatch(event);
  }

  /* =========================
     PUBLIC API
     ========================= */
  function start() {
    if (running) return;
    running = true;
    lastTime = nowFn();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function getRenderState() {
    // runtime -> UI only, but allow debug read
    return { ...renderState, ui: { ...renderState.ui } };
  }

  function getCoreState() {
    return { ...coreState };
  }

  return {
    dispatch,
    start,
    stop,
    getRenderState,
    getCoreState,
  };
}



