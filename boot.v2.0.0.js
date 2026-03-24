/* ============================================================
   NeuroBreak™ Prompteur V2 — boot.v2.0.0.js
   IA-BOOT: point d’entrée unique (assemblage Antigravity).
   Zéro logique métier. Zéro rendu UI. Zéro CSS.
   ============================================================ */

"use strict";

const logBootError = (err) => {
  try {
    console.error("NeuroBreak boot error", err);
  } catch (_) {}
};

async function safeImport(path) {
  try {
    return await import(path);
  } catch (err) {
    logBootError(err);
    return null;
  }
}

function safeFn(mod, name) {
  const fn = mod?.[name];
  return typeof fn === "function" ? fn : null;
}

function safeCreate(factory, args) {
  if (!factory) return null;
  try {
    return factory(args);
  } catch (err) {
    logBootError(err);
    return null;
  }
}

(async () => {
  // Root DOM (seul querySelector autorisé)
  let root = null;
  try {
    root = document.querySelector("#nb-root");
  } catch (err) {
    logBootError(err);
  }

  const user = window.nbUser ?? { premium: false };

  // 1) Imports modules
  const runtimeMod = await safeImport("./engine/runtime.js");
  const coreMod = await safeImport("./engine/core-engine.js");
  const motionMod = await safeImport("./engine/motion-engine.js");
  const audioMod = await safeImport("./engine/audio-engine.js");
  const uiMod = await safeImport("./ui/ui-shell.js");

  let semanticMod = null;
  if (user?.premium === true) {
    semanticMod = await safeImport("./engine/semantic-engine.js");
  }

  // Factories
  const createRuntime = safeFn(runtimeMod, "createRuntime");
  const createCoreEngine = safeFn(coreMod, "createCoreEngine");
  const createMotionEngine = safeFn(motionMod, "createMotionEngine");
  const createAudioEngine = safeFn(audioMod, "createAudioEngine");
  const createUIShell = safeFn(uiMod, "createUIShell");
  const createSemanticEngine = safeFn(semanticMod, "createSemanticEngine");

  // Engines instances
  const core = safeCreate(createCoreEngine);
  const motion = safeCreate(createMotionEngine, { runAccel: 120.0 });
  const audio = safeCreate(createAudioEngine);
  const semantic = safeCreate(createSemanticEngine);

  // ============================================================
  // ORDRE STRICT DEMANDÉ
  // ============================================================

  // 2) UI AVANT runtime
const ui = safeCreate(createUIShell);

// 3) Runtime avec UI injectée
let runtime = null;
try {
  if (createRuntime) {
    runtime = createRuntime({
      core,
      motion,
      audio,
      semantic: null,
      ui
    });
  }
} catch (err) {
  logBootError(err);
}

// 4) Init UI avec dispatch runtime
try {
    if (ui && root && runtime && typeof runtime.dispatch === "function" && typeof ui.init === "function") {
    ui.init(runtime.dispatch, root, { audioEngine: audio });
  }
  // ===== DEBUG EXPOSURE (NE MODIFIE RIEN AU MOTEUR) =====
  window.__NB_RUNTIME__ = runtime;
  window.__NB_UI__ = ui;
} catch (err) {
  logBootError(err);
}


  // 5) Démarrage
  try {
    audio?.start?.();
  } catch (err) {
    logBootError(err);
  }

    try {
    runtime?.start?.();
  } catch (err) {
    logBootError(err);
  }

  // 6) Boucle unique rAF -> tick(dtMs) + renderState -> UI (wiring V2.0)
  try {
    if (runtime && typeof runtime.tick === "function" && runtime.__bootLoopStarted !== true) {
      runtime.__bootLoopStarted = true;
      let lastTs = performance.now();
      const frame = (ts) => {
        const dtMs = Math.max(0, ts - lastTs);
        lastTs = ts;
        try { runtime.tick(dtMs); } catch (err) { logBootError(err); }
        try {
          const renderState =
            runtime.getRenderState?.() ?? runtime.getState?.() ?? runtime.state ?? null;
          ui?.render?.(renderState);
        } catch (err) { logBootError(err); }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  } catch (err) {
    logBootError(err);
  }
})();

