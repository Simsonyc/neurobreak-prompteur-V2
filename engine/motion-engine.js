/* ============================================================
   NeuroBreak™ Prompteur V2 — motion-engine.js
   IA-MOTION: physique pure (scroll + inertie + snap). Zéro DOM/UI/audio.
   API:
     - update(input, dtMs) -> { offsetY, scrollSpeed, snapping, inertiaState }
     - start(), stop()
     - applyLatencyCorrection(latencyMs)  // à appeler UNIQUEMENT si pauseReason==="AUDIO"
   ============================================================ */

/**
 * @typedef {Object} MotionInput
 * @property {number} baseSpeed              // unités / seconde (positif = descend)
 * @property {number} semanticMultiplier     // ex: 0.7 (calme) -> 1.3 (impact)
 * @property {boolean} isRunning             // intention “run” (core)
 * @property {boolean} isDragging            // drag utilisateur actif
 * @property {number} deltaY                 // delta drag depuis la frame précédente (unités)
 * @property {null|"MANUAL"|"AUDIO"|"ORIENTATION"} pauseReason
 */

/**
 * @typedef {Object} MotionOutput
 * @property {number} offsetY
 * @property {number} scrollSpeed            // vitesse instantanée (unités / seconde)
 * @property {{active:boolean,targetOffset:number,softness:number}} snapping
 * @property {{mode:"IDLE"|"DRAG"|"INERTIA"|"RUN"|"PAUSED", velocity:number, targetSpeed:number, accel:number}} inertiaState
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function createMotionEngine(options = {}) {
  // Unités arbitraires: “1” peut représenter 1px, 1/10 de ligne, etc. (à mapper côté UI).
  const cfg = {
    // Progression douce au redémarrage
    runAccel: typeof options.runAccel === "number" ? options.runAccel : 6.0, // (unités/s²) vers targetSpeed
    runDecel: typeof options.runDecel === "number" ? options.runDecel : 10.0, // freinage quand on quitte RUN

    // Inertie après drag
    dragVelocityGain:
      typeof options.dragVelocityGain === "number" ? options.dragVelocityGain : 18.0, // transforme deltaY/dt en vitesse
    inertiaFriction:
      typeof options.inertiaFriction === "number" ? options.inertiaFriction : 8.5, // frein exponentiel (s⁻¹)
    maxSpeed: typeof options.maxSpeed === "number" ? options.maxSpeed : 4000, // clamp sécurité

    // Snap doux (vers pas discret)
    snapStep: typeof options.snapStep === "number" ? options.snapStep : 1, // 1 = “pas” minimal (ex: 1 ligne)
    snapSoftness:
      typeof options.snapSoftness === "number" ? options.snapSoftness : 14.0, // plus haut = colle plus vite
    snapDeadSpeed:
      typeof options.snapDeadSpeed === "number" ? options.snapDeadSpeed : 18.0, // vitesse sous laquelle le snap peut agir

    // Sécurité dt
    dtMin: 1,
    dtMax: 60,
  };

  // État interne (aucune connaissance du DOM)
  const st = {
    offsetY: 0,
    velocity: 0, // unités/s
    mode: /** @type {"IDLE"|"DRAG"|"INERTIA"|"RUN"|"PAUSED"} */ ("IDLE"),

    // pour correction latence “AUDIO”
    lastRunSpeed: 0,
    lastPauseReason: null,

        // snapping
    snapActive: false,
    snapTarget: 0,

        // mémoire minimale du drag
    wasRunningBeforeDrag: false,
    wasDragging: false,

    // anti double-catchup
    lastCatchupAppliedAt: 0,

        // flags locaux neutralisés
    localRunning: false,
  };

  function start() {}

  function stop() {}

  /**
   * IMPORTANT: à appeler uniquement si pauseReason==="AUDIO"
   * Ajuste l’offset pour compenser une latence (ex: audio détecté en retard).
   * - latencyMs > 0 : on “avance” l’offset comme si le scroll avait continué
   * - latencyMs < 0 : on “revient” légèrement en arrière
   */
  function applyLatencyCorrection(latencyMs) {
    if (st.lastPauseReason !== "AUDIO") return;

    const ms = typeof latencyMs === "number" ? latencyMs : 0;
    if (!isFinite(ms) || ms === 0) return;

    // On utilise la dernière vitesse “RUN” connue (stable), pas la vitesse actuelle (qui est à 0 en PAUSED).
    const correction = st.lastRunSpeed * (ms / 1000);
    st.offsetY += correction;

    // Pendant une pause audio, on évite de relancer une inertie parasite.
    st.velocity = 0;
    st.mode = "PAUSED";
    st.snapActive = true;
    st.snapTarget = quantizeToStep(st.offsetY, cfg.snapStep);
  }

  function quantizeToStep(v, step) {
    const s = step > 0 ? step : 1;
    return Math.round(v / s) * s;
  }

  function computeTargetSpeed(input) {
    const base = isFinite(input.baseSpeed) ? input.baseSpeed : 0;
    const mul = isFinite(input.semanticMultiplier) ? input.semanticMultiplier : 1;
    return clamp(base * mul, -cfg.maxSpeed, cfg.maxSpeed);
  }

  function approach(current, target, accelPerSec, dtSec) {
    const maxDelta = Math.abs(accelPerSec) * dtSec;
    const delta = target - current;
    if (Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
  }

  function applyInertia(dtSec) {
    // friction exponentielle: v *= exp(-k*dt)
    const k = cfg.inertiaFriction;
    const damp = Math.exp(-k * dtSec);
    st.velocity *= damp;

    // si très faible, on stoppe net
    if (Math.abs(st.velocity) < 0.02) st.velocity = 0;
  }

  function updateSnap(dtSec) {
    const speedAbs = Math.abs(st.velocity);
    if (speedAbs > cfg.snapDeadSpeed) {
      st.snapActive = false;
      return;
    }

    // Snap vers pas discret
    st.snapActive = true;
    st.snapTarget = quantizeToStep(st.offsetY, cfg.snapStep);

    // correction douce (spring critically damp-ish)
    const err = st.snapTarget - st.offsetY;
    const pull = cfg.snapSoftness; // s⁻¹
    st.offsetY += err * (1 - Math.exp(-pull * dtSec));

    // si on est très proche, on lock pour stabilité
    if (Math.abs(err) < 0.0005) st.offsetY = st.snapTarget;
  }

  /**
   * @param {MotionInput} input
   * @param {number} dtMs
   * @returns {MotionOutput}
   */
  function update(input, dtMs) {
    const dt = clamp(dtMs || 16, cfg.dtMin, cfg.dtMax);
    const dtSec = dt / 1000;

    const pauseReason = input.pauseReason ?? null;
const prevPauseReason = st.lastPauseReason;
const paused = !!pauseReason;
st.lastPauseReason = pauseReason;

            
                const targetSpeed = computeTargetSpeed(input);
const effectiveRunning = !!input.isRunning && !paused;

if (
  prevPauseReason === "AUDIO" &&
  !pauseReason &&
  !input.isDragging &&
  (input.lastSilenceDurationMs || 0) > 0 &&
  st.lastCatchupAppliedAt !== input.lastSilenceDurationMs
) {
  const usefulSilenceMs = Math.min(
    input.lastSilenceDurationMs || 0,
    input.silenceDelayMs || 0,
    3000
  );
  const silenceSec = usefulSilenceMs / 1000;
  const catchup = (st.lastRunSpeed || 0) * silenceSec;
  st.offsetY -= catchup;
  st.lastCatchupAppliedAt = input.lastSilenceDurationMs;
}

if (input.isDragging) {
  if (!st.wasDragging) st.wasRunningBeforeDrag = !!input.isRunning && pauseReason !== "MANUAL";
  st.wasDragging = true;
  st.mode = "DRAG";
  st.velocity = 0;
  st.offsetY += isFinite(input.deltaY) ? input.deltaY : 0;
  st.snapActive = false;
  return {
    offsetY: st.offsetY,
    scrollSpeed: st.velocity,
    snapping: { active: st.snapActive, targetOffset: st.snapTarget, softness: cfg.snapSoftness },
    inertiaState: { mode: st.mode, velocity: st.velocity, targetSpeed: 0, accel: 0 },
  };
}
if (st.wasDragging) {
  st.wasDragging = false;
  if (!st.wasRunningBeforeDrag) st.velocity = 0;
  if (pauseReason !== "MANUAL") updateSnap(dtSec);
  return {
    offsetY: st.offsetY,
    scrollSpeed: st.velocity,
    snapping: { active: st.snapActive, targetOffset: st.snapTarget, softness: cfg.snapSoftness },
    inertiaState: { mode: paused ? "PAUSED" : "IDLE", velocity: st.velocity, targetSpeed: 0, accel: 0 },
  };
}

if (paused) {
  // Pause: gel strict du scroll, sans déplacement résiduel
  st.mode = "PAUSED";
  st.lastRunSpeed = st.lastRunSpeed || 0;
  st.velocity = 0;

  if (pauseReason !== "MANUAL") updateSnap(dtSec);

  return {
    offsetY: st.offsetY,
    scrollSpeed: st.velocity,
    snapping: { active: st.snapActive, targetOffset: st.snapTarget, softness: cfg.snapSoftness },
    inertiaState: {
      mode: st.mode,
      velocity: st.velocity,
      targetSpeed: 0,
      accel: 0,
    },
  };
}

    // RUN: accélération progressive vers la cible
    if (effectiveRunning) {
      st.mode = "RUN";

      const vPrev = st.velocity;
      st.velocity = approach(st.velocity, targetSpeed, cfg.runAccel * Math.max(1, Math.abs(targetSpeed)), dtSec);

      st.velocity = clamp(st.velocity, -cfg.maxSpeed, cfg.maxSpeed);
      st.offsetY += st.velocity * dtSec;

      // mémorise une vitesse de run “utile” pour correction latence audio
      st.lastRunSpeed = st.velocity;

      // en run: pas de snap
      st.snapActive = false;

      return {
        offsetY: st.offsetY,
        scrollSpeed: st.velocity,
        snapping: { active: st.snapActive, targetOffset: st.snapTarget, softness: cfg.snapSoftness },
        inertiaState: {
          mode: st.mode,
          velocity: st.velocity,
          targetSpeed,
          accel: (st.velocity - vPrev) / dtSec,
        },
      };
    }

    // Pas en run: inertie résiduelle si on a de la vitesse
    if (Math.abs(st.velocity) > 0) {
      st.mode = "INERTIA";
      const vPrev = st.velocity;

      applyInertia(dtSec);
      st.offsetY += st.velocity * dtSec;

      updateSnap(dtSec);

      return {
        offsetY: st.offsetY,
        scrollSpeed: st.velocity,
        snapping: { active: st.snapActive, targetOffset: st.snapTarget, softness: cfg.snapSoftness },
        inertiaState: {
          mode: st.mode,
          velocity: st.velocity,
          targetSpeed: 0,
          accel: (st.velocity - vPrev) / dtSec,
        },
      };
    }

    // IDLE: stable + snap final
    st.mode = "IDLE";
    st.velocity = 0;
    updateSnap(dtSec);

    return {
      offsetY: st.offsetY,
      scrollSpeed: st.velocity,
      snapping: { active: st.snapActive, targetOffset: st.snapTarget, softness: cfg.snapSoftness },
      inertiaState: {
        mode: st.mode,
        velocity: st.velocity,
        targetSpeed: 0,
        accel: 0,
      },
    };
  }

  function getState() {
    return {
      offsetY: st.offsetY,
      scrollSpeed: st.velocity,
      mode: st.mode,
      snapActive: st.snapActive,
      snapTarget: st.snapTarget,
      lastRunSpeed: st.lastRunSpeed,
      lastPauseReason: st.lastPauseReason,
    };
  }
// V2.0 SELFIE: events + tick(dtMs) (sans DOM)
function onEvent(event) {
  const t = event?.type;

  if (t === "EV_PAUSE_AUDIO_SILENCE") {
    const latencyMs =
      typeof event.latencyMs === "number"
        ? event.latencyMs
        : event?.payload?.latencyMs || 0;

    st.lastPauseReason = "AUDIO";
    st.offsetY -= (st.lastRunSpeed || 0) * (latencyMs / 1000);
    st.velocity = 0;
    st.mode = "PAUSED";
  }

    if (t === "EV_RESUME_AUDIO_SPEAKING" && st.lastPauseReason === "AUDIO") {
    st.lastPauseReason = null;
  }

  if (t === "EV_RESET_TEXT") {
    st.offsetY = 0;
    st.velocity = 0;
    st.snapActive = false;
    st.snapTarget = 0;
  }
}

function tick(dtMs) {
  return update(
    {
      baseSpeed: 220,
      semanticMultiplier: 1,
      isRunning: false,
      isDragging: false,
      deltaY: 0,
      pauseReason: st.lastPauseReason,
    },
    dtMs
  );
}
  return {
  update,
  start,
  stop,
  applyLatencyCorrection,
  onEvent,
  tick,
  getState,
};
}
