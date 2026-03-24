/* ============================================================
   NeuroBreak™ Prompteur V2 — ui-shell.js
   IA-UI: UI shell mobile-first (zéro logique moteur/audio).
   - ui.init(runtimeDispatch, uiRoot)
   - ui.render(renderState)
   - émet: EV_SELECT_MODE_*, EV_LOAD_TEXT, EV_START_FOCUS,
           EV_PAUSE_MANUAL, EV_RESUME, EV_STOP, EV_DRAG, EV_DRAG_END
   - Aucun calcul de scroll: applique seulement offsetY reçu.
   ============================================================ */
const SETTINGS_KEY = "neurobreak_prompt_settings";
const TEXT_KEY = "neurobreak_prompt_text";

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);

    if (raw) {
      return JSON.parse(raw);
    }

    const defaultSettings = {
      scrollSpeed: 28,
      fontSize: 24,
      fontWeight: 600,
      thresholdRms: 0.006,
      silenceDelayMs: 50,
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
    return defaultSettings;
  } catch (e) {
    return null;
  }
}

function saveTextDraft(data) {
  try {
    localStorage.setItem(TEXT_KEY, JSON.stringify(data));
  } catch (e) {}
}

function loadTextDraft() {
  try {
    const raw = localStorage.getItem(TEXT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
import { STATES, EVENTS } from "../engine/contracts.js";
import { createDirectorMode } from "./director-mode.js";
import { createCameraModule } from "./camera-module.js";
import { createVideoRecorder } from "./video-recorder.js";
import { createMp4Converter } from "./mp4-converter.js";

export function createUIShell() {
    let dispatch = null;
  let runtimeDispatch = null;
  let root = null;
  // ------------------------------------------------
// Gestion rotation écran mobile
// ------------------------------------------------
function handleOrientation() {
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isLandscape) {
    document.body.classList.add("nb-landscape");
    document.body.classList.remove("nb-portrait");
  } else {
    document.body.classList.add("nb-portrait");
    document.body.classList.remove("nb-landscape");
  }

  if (runtimeDispatch) {
    runtimeDispatch({
      type: EVENTS.ORIENTATION_CHANGE,
      orientation: isLandscape ? "LANDSCAPE" : "PORTRAIT",
      shouldPause: false,
    });
  }
}

window.addEventListener("resize", handleOrientation);
window.addEventListener("orientationchange", handleOrientation);
// camera (SELFIE_FOCUS)
    let camera = null;
let recorder = null;
let mp4Converter = null;
let audioEngine = null;
let $focusRecBtn = null;
  let taCommitTimer = null;
  // DOM refs
  let $app, $topbar, $modeSelfie, $statusPill;
  let $loadZone, $fileInput, $fileBtn, $fileName;
  let $controlsRow, $btnStart, $btnPause, $btnResume, $btnStop, $micMeterFill, $micStatus; let selectedMicId = "";

    let $focusOverlay, $focusTextWrap, $focusTextInner, $focusWidthRange, $focusWidthValue, $readingZone, $focusZoneRange, $focusZoneValue, $focusPromptBtn;
let $focusBtnPause, $focusBtnStop, $focusHint, $focusRecStatus;
let $exportModal, $exportBtnWebm, $exportBtnMp4, $exportBtnRetake, $exportBtnClose;
let lastRecordingResult = null;
let textWidthPercent = 75, readingZoneTop = 38, promptManualArmed = false;
const initialTextOffsetY = 120;

  // local UI cache (UI-only)
          let loadedText = "";
  let loadedFilename = "";
  let isRecBusy = false;
  let isStopBusy = false;
  let lastFocusVisible = null;
  let lastPromptState = STATES.SPLASH;
  let recStartedAt = 0;
  let recPausedAccumMs = 0;
  let recPauseStartedAt = 0;
  let isDragging = false;
  let dragPointerId = null;
  let dragStartY = 0;
  let dragLastY = 0;

  /* =========================
     INIT
     ========================= */
    function init(runtimeDispatchFn, uiRoot, services = {}) {
  if (typeof runtimeDispatchFn !== "function") {
    throw new Error("ui-shell: init(runtimeDispatch, uiRoot) requires a dispatch function.");
  }
  if (!uiRoot) throw new Error("ui-shell: uiRoot is required.");

    dispatch = runtimeDispatchFn;
  runtimeDispatch = runtimeDispatchFn; // <- fixe le runtimeDispatch de fermeture
  root = uiRoot;
  audioEngine = services.audioEngine ?? null;

       mount();
  bind();
handleOrientation(); 
  const savedTextDraft = loadTextDraft();
  if (savedTextDraft && typeof savedTextDraft.text === "string") {
    loadedText = savedTextDraft.text;
    loadedFilename = savedTextDraft.filename || "textarea";

    const $ta = root?.querySelector(".nbp-ta");
    if ($ta) $ta.value = loadedText;

    if ($fileName) $fileName.textContent = loadedFilename;
    paintTextIntoFocus(loadedText);

    dispatch({
      type: EVENTS.LOAD_TEXT,
      text: loadedText,
      filename: loadedFilename,
      mime: "text/plain",
    });
    dispatch({ type: EVENTS.TEXT_LOADED_OK });
  }

  // Selfie-only: one-shot mode selection so core can leave SPLASH immediately
  dispatch({ type: EVENTS.SELECT_MODE_SELFIE });

  const saved = loadSettings();

  if (saved) {
    if (typeof saved.scrollSpeed === "number") {
      runtimeDispatch({ type: "EV_SET_SCROLL_SPEED", value: saved.scrollSpeed });
    }

    if (typeof saved.fontSize === "number") {
      runtimeDispatch({ type: "EV_SET_FONT_SIZE", value: saved.fontSize });
    }

    if (typeof saved.fontWeight === "number") {
      runtimeDispatch({ type: "EV_SET_FONT_WEIGHT", value: saved.fontWeight });
    }

    if (typeof saved.thresholdRms === "number") {
      runtimeDispatch({ type: "EV_SET_THRESHOLD_RMS", value: saved.thresholdRms });
    }

    if (typeof saved.silenceDelayMs === "number") {
      runtimeDispatch({ type: "EV_SET_SILENCE_DELAY", value: saved.silenceDelayMs });
    }
  }
  const setAdvInput = (key, value) => {
    const el = root?.querySelector(`.nbp-advanced input[data-k="${key}"]`);
    const badge = el?.closest?.(".nbp-control")?.querySelector?.(".nbp-val");
    if (el && typeof value === "number") {
      el.value = String(value);
      if (badge) badge.textContent = String(value);
    }
  };

  if (saved) {
    setAdvInput("EV_SET_SCROLL_SPEED", saved.scrollSpeed);
    setAdvInput("EV_SET_FONT_SIZE", saved.fontSize);
    setAdvInput("EV_SET_FONT_WEIGHT", saved.fontWeight);
    setAdvInput("EV_SET_THRESHOLD_RMS", saved.thresholdRms);
    setAdvInput("EV_SET_SILENCE_DELAY", saved.silenceDelayMs);
  }
    // camera module mounted behind focus overlay
  camera = createCameraModule($focusOverlay);
  recorder = createVideoRecorder();
  mp4Converter = createMp4Converter();
}


  function mount() {
    root.innerHTML = "";

    injectStylesOnce();

    $app = document.createElement("div");
    $app.className = "nbp-ui";

    $app.innerHTML = `
      <div class="nbp-surface">
        <div class="nbp-topbar">
  <div class="nbp-status">
    <span class="nbp-pill" aria-live="polite">…</span>
  </div>
</div>

        <div class="nbp-body">
          <div class="nbp-block nbp-load" aria-label="Chargement du texte">
            <div class="nbp-title">Texte</div>

            <div class="nbp-dropzone" tabindex="0" role="button" aria-label="Glisser-déposer un fichier texte">
              <div class="nbp-drop-title">Glisser / déposer</div>
              <div class="nbp-drop-sub">ou choisir un fichier .txt / .md</div>

              <div class="nbp-drop-actions">
                <button class="nbp-btn nbp-btn-ghost" type="button" data-action="choose-file">
                  Choisir un fichier
                </button>
                <input class="nbp-file" type="file" accept=".txt,.md,text/plain,text/markdown" />
              </div>

              <div class="nbp-filemeta">
                <span class="nbp-filelabel">Fichier :</span>
                <span class="nbp-filename">Aucun</span>
              </div>
            </div>
          </div>

          <div class="nbp-block nbp-controls" aria-label="Contrôles">
            <div class="nbp-title">Contrôle</div>

            <div class="nbp-mic"><div class="nbp-title">Micro actif</div><div class="nbp-small nbp-mic-status">Micro détecté</div><div class="nbp-mic-meter"><div class="nbp-mic-meter-fill"></div></div><div class="nbp-small nbp-mic-note">Le prompteur utilise le micro actuellement reconnu par le navigateur.</div></div><div class="nbp-home-help">Comment utiliser le prompteur : 1. Charge ou colle ton texte  2. Clique sur Start Selfie  3. Parle naturellement : le prompteur suit ta voix  4. Ajuste les paramètres avancés seulement si nécessaire</div>
<div class="nbp-controls-row">
  <button class="nbp-btn nbp-btn-primary" type="button" data-action="start">Start Selfie</button>
</div>
<div class="nbp-small">
  En focus, l’interface se masque automatiquement (texte + pause/stop).
</div>
          </div>
        </div>
      </div>

      <div class="nbp-focus" aria-hidden="true">
        <div class="nbp-focus-top">
  <div class="nbp-focus-actions">
    <button class="nbp-btn nbp-btn-ghost" type="button" data-action="focus-advanced">⚙</button>
    <button class="nbp-btn nbp-btn-ghost" type="button" data-action="focus-home">🏠</button>
  </div>
</div>

<div class="nbp-focus-text" role="region" aria-label="Texte en focus">
<div class="nbp-rule-of-thirds"></div>
  <div class="nbp-reading-zone"></div><div class="nbp-focus-inner"></div>
</div>
<div class="nbp-focus-bottom">
  <div class="nbp-focus-rec-row"><button class="nbp-btn nbp-btn-primary nbp-btn-rec" type="button" data-action="focus-reset">REC</button></div>
  <div class="nbp-focus-rec-status" aria-live="polite"></div>
  <div class="nbp-focus-main-row">
    <button class="nbp-btn nbp-btn-ghost" type="button" data-action="focus-pause">⏸ PROMPT</button>
    <button class="nbp-btn nbp-btn-danger" type="button" data-action="focus-stop">STOP</button>
  </div>
  <div class="nbp-focus-sliders-row">
    <label class="nbp-mini-slider">↔<input class="nbp-text-width-range" type="range" min="50" max="100" step="5" value="75"></label>
  </div>
</div>
<label class="nbp-zone-slider-rail">
  <input class="nbp-reading-zone-range" type="range" min="20" max="70" step="1" value="38" orient="vertical">
</label>
<div class="nbp-focus-hint">Glisse pour ajuster (manual drag)</div>
      </div>
	  <div class="nbp-export-modal" aria-hidden="true">
  <div class="nbp-export-card">
    <div class="nbp-export-title">Export de la vidéo</div>
    <div class="nbp-export-text">Votre prise est prête.</div>

    <div class="nbp-export-actions">
      <button class="nbp-btn nbp-btn-primary" type="button" data-action="export-webm">
        Télécharger en WebM
      </button>
      <button class="nbp-btn" type="button" data-action="export-mp4">
        Convertir en MP4
      </button>
      <button class="nbp-btn" type="button" data-action="export-retake">
        Refaire une prise
      </button>
      <button class="nbp-btn nbp-btn-ghost" type="button" data-action="export-close">
        Fermer
      </button>
    </div>
  </div>
</div>
    `;

    root.appendChild($app);

    $topbar = $app.querySelector(".nbp-topbar");
    $modeSelfie = $app.querySelector('[data-mode="SELFIE"]');
    $statusPill = $app.querySelector(".nbp-pill");

    $loadZone = $app.querySelector(".nbp-dropzone");
    $fileInput = $app.querySelector(".nbp-file");
    $fileBtn = $app.querySelector('[data-action="choose-file"]');
    $fileName = $app.querySelector(".nbp-filename");

    $controlsRow = $app.querySelector(".nbp-controls-row");
$btnStart = $app.querySelector('[data-action="start"]'); $micMeterFill = $app.querySelector(".nbp-mic-meter-fill"); $micStatus = $app.querySelector(".nbp-mic-status");
$btnPause = null;
$btnResume = null;
$btnStop = null;

    $focusOverlay = $app.querySelector(".nbp-focus");
$focusTextWrap = $app.querySelector(".nbp-focus-text");
$readingZone = $app.querySelector(".nbp-reading-zone");
$focusTextInner = $app.querySelector(".nbp-focus-inner");
$focusWidthRange = $app.querySelector(".nbp-text-width-range");
$focusWidthValue = $app.querySelector(".nbp-text-width-value");
$focusZoneRange = $app.querySelector(".nbp-reading-zone-range");
$focusZoneValue = $app.querySelector(".nbp-reading-zone-value");
$focusBtnPause = $app.querySelector('[data-action="focus-pause"]');
$focusBtnStop = $app.querySelector('[data-action="focus-stop"]');
$focusHint = $app.querySelector(".nbp-focus-hint");
$focusRecStatus = $app.querySelector(".nbp-focus-rec-status");
$exportModal = $app.querySelector(".nbp-export-modal");
$exportBtnWebm = $app.querySelector('[data-action="export-webm"]');
$exportBtnMp4 = $app.querySelector('[data-action="export-mp4"]');
$exportBtnRetake = $app.querySelector('[data-action="export-retake"]');
$exportBtnClose = $app.querySelector('[data-action="export-close"]');
$focusWidthRange?.addEventListener("input", (e) => { textWidthPercent = Number(e.target.value) || 75; if ($focusWidthValue) $focusWidthValue.textContent = `${textWidthPercent}%`; if ($focusTextInner) { $focusTextInner.style.maxWidth = `${textWidthPercent}%`; $focusTextInner.style.marginLeft = "auto"; $focusTextInner.style.marginRight = "auto"; } });
$focusZoneRange?.addEventListener("input", (e) => { readingZoneTop = Number(e.target.value) || 38; if ($focusZoneValue) $focusZoneValue.textContent = `${readingZoneTop}%`; if ($readingZone) $readingZone.style.top = `${readingZoneTop}%`; });
    // HOME tweaks V2.0 (UI-only)
    $btnStart.textContent = "Start Selfie";
    const $loadBlock = $app.querySelector(".nbp-block.nbp-load");
    const $ta = Object.assign(document.createElement("textarea"), { className: "nbp-ta", rows: 6, placeholder: "Coller / écrire le texte ici…" });
    $loadBlock.appendChild($ta);
    const $adv = document.createElement("div");
    $adv.className = "nbp-block nbp-advanced";
$adv.innerHTML = `<button class="nbp-adv-toggle" type="button" aria-expanded="false">
    <span class="nbp-title">Advanced</span><span class="nbp-adv-caret">▾</span>
  </button>
  <div class="nbp-adv-body" hidden>
    <label class="nbp-row"><span>Speed</span><span class="nbp-control"><input data-k="EV_SET_SCROLL_SPEED" type="range" min="5" max="70" step="1" value="28"><span class="nbp-val">28</span></span></label>
    <label class="nbp-row"><span>Font</span><span class="nbp-control"><input data-k="EV_SET_FONT_SIZE" type="range" min="14" max="48" step="1" value="24"><span class="nbp-val">24</span></span></label>
    <label class="nbp-row"><span>Weight</span><span class="nbp-control"><input data-k="EV_SET_FONT_WEIGHT" type="range" min="200" max="900" step="100" value="600"><span class="nbp-val">600</span></span></label>
    <label class="nbp-row"><span>RMS</span><span class="nbp-control"><input data-k="EV_SET_THRESHOLD_RMS" type="range" min="0.005" max="0.15" step="0.005" value="0.02"><span class="nbp-val">0.006</span></span></label>
    <label class="nbp-row"><span>Silence ms</span><span class="nbp-control"><input data-k="EV_SET_SILENCE_DELAY" type="range" min="50" max="600" step="25" value="180"><span class="nbp-val">180</span></span></label>
  </div>`;
        $focusOverlay.appendChild($adv); // Advanced vit dans le Focus
    $ta.addEventListener("input", () => {
  loadedText = $ta.value || "";
  loadedFilename = "textarea";
  paintTextIntoFocus(loadedText);

  saveTextDraft({
    text: loadedText,
    filename: loadedFilename,
  });

  dispatch({ type: "EV_TEXT_LOAD_RAW", text: loadedText, filename: loadedFilename });

  clearTimeout(taCommitTimer);
  taCommitTimer = setTimeout(() => {
    dispatch({ type: EVENTS.LOAD_TEXT, text: loadedText, filename: loadedFilename, mime: "text/plain" });
    dispatch({ type: EVENTS.TEXT_LOADED_OK });
  }, 250);
});
    $adv.addEventListener("input", (e) => {
  const k = e.target?.dataset?.k;
  const n = Number(e.target?.value);
  const $v = e.target?.closest?.(".nbp-control")?.querySelector?.(".nbp-val");
  if ($v) $v.textContent = String(e.target.value);

  if (!k) return;

  const payload = { type: k, value: n };
  if (k === "EV_SET_SCROLL_SPEED") payload.scrollSpeed = n;
  else if (k === "EV_SET_FONT_SIZE") payload.fontSize = n;
  else if (k === "EV_SET_FONT_WEIGHT") payload.fontWeight = n;
  else if (k === "EV_SET_THRESHOLD_RMS") payload.thresholdRms = n;
  else if (k === "EV_SET_SILENCE_DELAY") payload.silenceDelayMs = n;

  dispatch(payload);

  const getVal = (key, fallback = 0) => {
    const el = $adv.querySelector(`input[data-k="${key}"]`);
    return el ? Number(el.value) : fallback;
  };

  saveSettings({
    scrollSpeed: getVal("EV_SET_SCROLL_SPEED", 28),
    fontSize: getVal("EV_SET_FONT_SIZE", 24),
    fontWeight: getVal("EV_SET_FONT_WEIGHT", 600),
    thresholdRms: getVal("EV_SET_THRESHOLD_RMS", 0.006),
    silenceDelayMs: getVal("EV_SET_SILENCE_DELAY", 180),
  });
});
  }
      function buildRecordingStream() {
  const videoStream = camera?.getRecordingStream?.() || camera?.getStream?.();
  const audioStream = audioEngine?.getStream?.();

  const videoTracks = videoStream?.getVideoTracks?.() || [];
  const audioTracks = audioStream?.getAudioTracks?.() || [];

  if (!videoTracks.length) {
    throw new Error("Recorder: aucune piste vidéo caméra disponible.");
  }

  if (!audioTracks.length) {
    throw new Error("Recorder: aucune piste audio micro disponible.");
  }

  return new MediaStream([
    ...videoTracks,
    ...audioTracks,
  ]);
}
  function formatRecDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function updateRecStatus() {
    if (!$focusRecStatus || !recorder) return;

    const state = recorder.getState();
    const now = Date.now();

    let elapsedMs = 0;
    if (recStartedAt > 0) {
      elapsedMs = now - recStartedAt - recPausedAccumMs;
      if (state === "PAUSED" && recPauseStartedAt > 0) {
        elapsedMs -= (now - recPauseStartedAt);
      }
    }

    if (state === "RECORDING") {
      $focusRecStatus.innerHTML = `<span class="nbp-rec-dot"></span><span>REC ${formatRecDuration(elapsedMs)}</span>`;
    } else if (state === "PAUSED") {
      $focusRecStatus.innerHTML = `<span class="nbp-rec-dot is-paused"></span><span>PAUSE ${formatRecDuration(elapsedMs)}</span>`;
    } else {
      $focusRecStatus.textContent = "";
    }
  }
    function updateRecButton() {
    if (!$focusRecBtn || !recorder) return;

    const state = recorder.getState();

    if (state === "RECORDING") $focusRecBtn.textContent = "PAUSE REC";
    else if (state === "PAUSED") $focusRecBtn.textContent = "RESUME REC";
    else $focusRecBtn.textContent = "REC";

    updateRecStatus();
  }

    async function handleRecClick() {
    if (!camera) return;

    if (!camera.getState?.().hasStream) {
      await camera.start();
    }

    const recState = recorder.getState();

    if (recState === "IDLE") {
      const mixedStream = buildRecordingStream();
      recorder.start(mixedStream);
      recStartedAt = Date.now();
      recPausedAccumMs = 0;
      recPauseStartedAt = 0;
    } else if (recState === "RECORDING") {
      recorder.pause();
      recPauseStartedAt = Date.now();
    } else if (recState === "PAUSED") {
      recorder.resume();
      if (recPauseStartedAt > 0) {
        recPausedAccumMs += Date.now() - recPauseStartedAt;
      }
      recPauseStartedAt = 0;
    }

    updateRecButton();
  }
function makeMp4FileName() {
  return `neurobreak-selfie-${Date.now()}.mp4`;
}
    function downloadRecording(result) {
    const url = typeof result?.url === "string" ? result.url : "";
    if (!url) return;

    const a = document.createElement("a");

    try {
      a.href = url;
      a.download = `neurobreak-selfie-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
    } catch (err) {
      console.error("downloadRecording error:", err);
    } finally {
      a.remove();
    }
  }
  function openExportModal(result) {
  lastRecordingResult = result || null;
  if (!$exportModal) return;
  $exportModal.classList.add("is-open");
  $exportModal.setAttribute("aria-hidden", "false");
}

function closeExportModal() {
  if (!$exportModal) return;
  $exportModal.classList.remove("is-open");
  $exportModal.setAttribute("aria-hidden", "true");
}

      async function finalizeRecordingIfNeeded() {
    if (!recorder) return null;

    const recState = recorder.getState();

    if (
      recState === "IDLE" ||
      recState === "STOPPED" ||
      recState === "ERROR"
    ) {
      recStartedAt = 0;
      recPausedAccumMs = 0;
      recPauseStartedAt = 0;
      updateRecButton();
      return null;
    }

    const result = await recorder.stop();
    recStartedAt = 0;
    recPausedAccumMs = 0;
    recPauseStartedAt = 0;
    updateRecButton();
    return result;
  }

  function bind() {
    // modes
    $modeSelfie?.addEventListener("click", () => dispatch({ type: EVENTS.SELECT_MODE_SELFIE }));

    // file choose
    $fileBtn.addEventListener("click", () => $fileInput.click());
    $fileInput.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      await handleFile(f);
      // reset input to allow re-upload same file
      $fileInput.value = "";
    });

    // drag&drop zone
    $loadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      $loadZone.classList.add("is-dragover");
    });
    $loadZone.addEventListener("dragleave", () => $loadZone.classList.remove("is-dragover"));
    $loadZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      $loadZone.classList.remove("is-dragover");
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      await handleFile(f);
    });

    // buttons
$btnStart?.addEventListener("click", () => {
  promptManualArmed = false;
  runtimeDispatch({ type: EVENTS.START_FOCUS });
  requestAnimationFrame(() => dispatch({ type: EVENTS.PAUSE_MANUAL }));
});
    

            // focus buttons
            $focusRecBtn = $app.querySelector('[data-action="focus-reset"]');
    $focusRecBtn.addEventListener("click", async () => {
      if (isRecBusy || isStopBusy) return;

      isRecBusy = true;
      $focusRecBtn.disabled = true;

      try {
        await handleRecClick();
      } catch (err) {
        console.error("REC error:", err);
      } finally {
        isRecBusy = false;
        $focusRecBtn.disabled = false;
        updateRecButton();
      }
    });
$focusBtnStop.addEventListener("click", async () => {
  if (isStopBusy) return;

  isStopBusy = true;
  $focusBtnStop.disabled = true;
  if ($focusRecBtn) $focusRecBtn.disabled = true;

  try {
    const result = await finalizeRecordingIfNeeded();
    dispatch({ type: EVENTS.STOP });

    if (result) {
      openExportModal(result);
    }
  } catch (err) {
    console.error("STOP finalize recording error:", err);
    dispatch({ type: EVENTS.STOP });
  } finally {
    isStopBusy = false;
    $focusBtnStop.disabled = false;
    if ($focusRecBtn) $focusRecBtn.disabled = false;
    updateRecButton();
  }
});

        $focusPromptBtn = $app.querySelector('[data-action="focus-pause"]');
    $focusPromptBtn?.addEventListener("click", () => {
      if (
        lastPromptState === STATES.FOCUS_RUNNING ||
        lastPromptState === STATES.PAUSED_AUDIO
      ) {
        dispatch({ type: EVENTS.PAUSE_MANUAL });
      } else if (lastPromptState === STATES.PAUSED_MANUAL) {
        dispatch({ type: EVENTS.RESUME });
      } else if (lastPromptState === STATES.PRE_FOCUS) {
        dispatch({ type: EVENTS.START_FOCUS });
      }
    });

$app.querySelector('[data-action="focus-advanced"]').addEventListener("click", () => {
  promptManualArmed = false;
  console.log("SEND PAUSE_MANUAL");
  dispatch({ type: EVENTS.PAUSE_MANUAL });
  const open = !$focusOverlay.classList.toggle("has-adv");
  const $t = $focusOverlay.querySelector(".nbp-adv-toggle");
  const $b = $focusOverlay.querySelector(".nbp-adv-body");
  $t?.setAttribute("aria-expanded", open ? "false" : "true");
  if ($b) $b.hidden = open;
});
$app.querySelector('[data-action="focus-home"]')?.addEventListener("click", async () => {
  if (isStopBusy) return;

  isStopBusy = true;
  $focusBtnStop.disabled = true;
  if ($focusRecBtn) $focusRecBtn.disabled = true;

  try {
    const result = await finalizeRecordingIfNeeded();
    dispatch({ type: EVENTS.STOP });

    if (result) {
      openExportModal(result);
    }
  } catch (err) {
    console.error("HOME finalize recording error:", err);
    dispatch({ type: EVENTS.STOP });
  } finally {
    isStopBusy = false;
    $focusBtnStop.disabled = false;
    if ($focusRecBtn) $focusRecBtn.disabled = false;
    updateRecButton();
  }
});
$exportBtnWebm?.addEventListener("click", () => {
  if (lastRecordingResult) {
    downloadRecording(lastRecordingResult);
  }
  closeExportModal();
});

$exportBtnMp4?.addEventListener("click", async () => {
  if (!lastRecordingResult?.blob || !mp4Converter) return;

  const previousLabel = $exportBtnMp4.textContent;
  const previousWebmLabel = $exportBtnWebm?.textContent || "";
  const previousRetakeLabel = $exportBtnRetake?.textContent || "";
  const previousCloseLabel = $exportBtnClose?.textContent || "";

  try {
    $exportBtnMp4.disabled = true;
    if ($exportBtnWebm) $exportBtnWebm.disabled = true;
    if ($exportBtnRetake) $exportBtnRetake.disabled = true;
    if ($exportBtnClose) $exportBtnClose.disabled = true;

    $exportBtnMp4.textContent = "Conversion MP4...";

    const mp4Result = await mp4Converter.convertBlobToMp4(lastRecordingResult.blob, {
      fileName: makeMp4FileName(),
      onProgress: ({ step, ratio }) => {
        if (step === "converting") {
          const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
          $exportBtnMp4.textContent = `Conversion MP4... ${pct}%`;
        }
      },
      onLog: (message) => {
        console.log("[MP4]", message);
      },
    });

    mp4Converter.downloadMp4(mp4Result);
    mp4Converter.revokeUrl(mp4Result);
    closeExportModal();
  } catch (err) {
    console.error("MP4 conversion error:", err);
    alert("La conversion MP4 a échoué sur cet appareil ou ce navigateur.");
  } finally {
    $exportBtnMp4.disabled = false;
    if ($exportBtnWebm) $exportBtnWebm.disabled = false;
    if ($exportBtnRetake) $exportBtnRetake.disabled = false;
    if ($exportBtnClose) $exportBtnClose.disabled = false;

    $exportBtnMp4.textContent = previousLabel;
    if ($exportBtnWebm) $exportBtnWebm.textContent = previousWebmLabel;
    if ($exportBtnRetake) $exportBtnRetake.textContent = previousRetakeLabel;
    if ($exportBtnClose) $exportBtnClose.textContent = previousCloseLabel;
  }
});

$exportBtnRetake?.addEventListener("click", () => {
  closeExportModal();

  // Reset état UI recording
  recStartedAt = 0;
  recPausedAccumMs = 0;
  recPauseStartedAt = 0;

  // Reset mémoire export
  lastRecordingResult = null;

  // Reset recorder si possible
  try {
    recorder?.reset?.();
  } catch (err) {
    console.warn("Retake: recorder reset skipped", err);
  }

  // Reset bouton REC
  updateRecButton();

  // Reset scroll visuel
  if ($focusTextInner) {
    $focusTextInner.style.transform = `translate3d(0, ${initialTextOffsetY}px, 0)`;
  }

  // Relance une nouvelle session focus, prête à tourner
  runtimeDispatch({ type: EVENTS.START_FOCUS });
  requestAnimationFrame(() => {
    dispatch({ type: EVENTS.PAUSE_MANUAL });
  });
});

$exportBtnClose?.addEventListener("click", () => {
  closeExportModal();
});

    // pointer drag (focus only; motion module may listen to DRAG payload)
    // NOTE: UI does NOT compute offset; it only emits intent (deltaY).
    const onPointerDown = (e) => {
      // only left button / primary touch
      if (e.pointerType === "mouse" && e.button !== 0) return;
      isDragging = true;
      dragPointerId = e.pointerId;
      dragStartY = e.clientY;
      dragLastY = e.clientY;
      $focusTextWrap.setPointerCapture?.(dragPointerId);

      dispatch({
        type: EVENTS.DRAG,
        phase: "start",
        clientY: e.clientY,
        deltaY: 0,
      });
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      const dy = e.clientY - dragLastY;
      dragLastY = e.clientY;

      dispatch({
        type: EVENTS.DRAG,
        phase: "move",
        clientY: e.clientY,
        deltaY: dy,
        totalDeltaY: e.clientY - dragStartY,
      });
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;

      isDragging = false;
      try {
        $focusTextWrap.releasePointerCapture?.(dragPointerId);
      } catch (_) {}
      dispatch({
        type: EVENTS.DRAG_END,
        clientY: e.clientY,
        totalDeltaY: e.clientY - dragStartY,
      });

      dragPointerId = null;
      dragStartY = 0;
      dragLastY = 0;
    };

    $focusTextWrap.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
  }

  async function handleFile(file) {
    // UI-only read, then emit EV_LOAD_TEXT
    const text = await file.text();

    loadedText = text || "";
loadedFilename = file.name || "texte";

// Update UI immediately (shell)
$fileName.textContent = loadedFilename;

const $ta = root?.querySelector(".nbp-ta");
if ($ta) $ta.value = loadedText;

paintTextIntoFocus(loadedText);

saveTextDraft({
  text: loadedText,
  filename: loadedFilename,
});

    // Tell runtime/core: user wants to load text
        dispatch({
      type: EVENTS.LOAD_TEXT,
      text: loadedText,
      filename: loadedFilename,
      mime: file.type || null,
      size: typeof file.size === "number" ? file.size : null,
    });
    dispatch({ type: EVENTS.TEXT_LOADED_OK });
  }

  /* =========================
     RENDER
     ========================= */
    function render(renderState) {
    if (!renderState) return;
    lastPromptState = renderState.state;
    ensureFocusLayer();
    console.log("RENDER STATE", renderState.state, renderState.pauseReason);

    // mode chips
    // Selfie-only: chip stays active (no Studio mode)

    // status
    $statusPill.textContent = statusLabel(renderState);

    // controls enable/disable (UI only; runtime/core still decides)
        const isFocus = !!renderState.ui?.focusMode || [
      STATES.FOCUS_RUNNING,
      STATES.PAUSED_AUDIO,
      STATES.PAUSED_MANUAL,
      STATES.PAUSED_ORIENTATION
    ].includes(renderState.state);


    // Focus overlay visibility
    setFocusVisible(isFocus);

        // Apply offsetY only (no math)
    // Convention: offsetY positive => content moves up (typical scroll)
    applyOffsetY(renderState.offsetY || 0);
if ($readingZone) $readingZone.style.top = `${readingZoneTop}%`;
if ($focusZoneValue) $focusZoneValue.textContent = `${readingZoneTop}%`;
if ($focusTextInner) { $focusTextInner.style.maxWidth = `${textWidthPercent}%`; $focusTextInner.style.marginLeft = "auto"; $focusTextInner.style.marginRight = "auto"; }
if ($focusWidthValue) $focusWidthValue.textContent = `${textWidthPercent}%`;

        // Live typography (UI only): override CSS clamp via inline styles
    if (typeof renderState.fontSize === "number") $focusTextInner.style.fontSize = `${renderState.fontSize}px`;
    if (typeof renderState.fontWeight === "number") $focusTextInner.style.fontWeight = `${renderState.fontWeight}`;
    if ($micMeterFill) $micMeterFill.style.width = `${Math.max(4, Math.min(100, Math.round(((typeof renderState.audioLevel === "number" ? renderState.audioLevel : 0) * 100))))}%`;
        if ($micStatus) $micStatus.textContent = "Micro détecté";
    updateRecButton();

    // keep focus text present (if loaded)
    if (!$focusTextInner.textContent && loadedText) {
      paintTextIntoFocus(loadedText);
    }

        // Button states (simple heuristics, no engine logic)
    // Start is available whenever we're NOT actively running focus.
    const canStart = renderState.state !== STATES.FOCUS_RUNNING;

    const canPause =
      renderState.state === STATES.FOCUS_RUNNING ||
      renderState.state === STATES.PRE_FOCUS ||
      renderState.state === STATES.TEXT_LOADING;
    const canResume =
      renderState.state === STATES.PAUSED_MANUAL ||
      renderState.state === STATES.PAUSED_AUDIO ||
      renderState.state === STATES.PAUSED_ORIENTATION;

    if ($btnStart) $btnStart.disabled = !canStart;
if ($btnPause) $btnPause.disabled = !canPause;
if ($btnResume) $btnResume.disabled = !canResume;
if ($btnStop) $btnStop.disabled = false;

    if (!isFocus || [STATES.READY, STATES.SPLASH, STATES.TEXT_LOADING].includes(renderState.state)) {
  promptManualArmed = false;
}
$focusBtnPause.disabled = false;
$focusBtnStop.disabled = false;
if ($focusPromptBtn) {
  const isManualPause =
    renderState.state === STATES.PAUSED_MANUAL;

  const isPromptArmed =
    renderState.state === STATES.FOCUS_RUNNING ||
    renderState.state === STATES.PAUSED_AUDIO ||
    renderState.state === STATES.PAUSED_ORIENTATION;

  if (isManualPause || renderState.state === STATES.PRE_FOCUS) {
    $focusPromptBtn.textContent = "▶ PROMPT";
  } else if (isPromptArmed) {
    $focusPromptBtn.textContent = "⏸ PROMPT";
  }
}



    // hint
    $focusHint.style.opacity = isFocus ? "1" : "0";
  }

 function setChipActive() {
  // Selfie-only
  $modeSelfie?.classList.add("is-active");
}

      function setFocusVisible(show) {
    const visible = !!show;

    $focusOverlay.classList.toggle("is-on", visible);
    $focusOverlay.setAttribute("aria-hidden", visible ? "false" : "true");

    if (lastFocusVisible === visible) return;
    lastFocusVisible = visible;

    if (camera) {
      if (visible) camera.start();
      else camera.stop();
    }
  }

  function applyOffsetY(offsetY) {
  const visualY = initialTextOffsetY - offsetY;
  $focusTextInner.style.transform = `translate3d(0, ${visualY}px, 0)`;
}
function ensureFocusLayer() {
  return;
}

  function paintTextIntoFocus(text) {
    // Keep it simple: plain text rendering (no markup parsing).
    // Preserve line breaks.
    $focusTextInner.textContent = text || "";
  }

  function statusLabel(rs) {
    const mode = "Selfie";
    const st = rs.state;

    // minimal readable status
    if (st === STATES.SPLASH) return `${mode} · Splash`;
    if (st === STATES.TEXT_LOADING) return `${mode} · Chargement…`;
    if (st === STATES.PRE_FOCUS) return `${mode} · Prêt`;
    if (st === STATES.FOCUS_RUNNING) return `${mode} · Focus`;
    if (st === STATES.PAUSED_MANUAL) return `${mode} · Pause (manuel)`;
    if (st === STATES.PAUSED_AUDIO) return `${mode} · Pause (audio)`;
    if (st === STATES.PAUSED_ORIENTATION) return `${mode} · Pause (orientation)`;
    if (st === STATES.READY) return `${mode} · Ready`;
    return `${mode} · ${st}`;
  }

  /* =========================
     STYLES (mobile-first)
     ========================= */
  function injectStylesOnce() {
    const ID = "nbp-ui-shell-styles";
    if (document.getElementById(ID)) return;

    const style = document.createElement("style");
    style.id = ID;
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Syne:wght@400;500;600;700;800&display=swap');

      :root{
        --nbp-bg: #080910;
        --nbp-surface: rgba(255,255,255,0.035);
        --nbp-surface-hover: rgba(255,255,255,0.055);
        --nbp-border: rgba(255,255,255,0.075);
        --nbp-border-active: rgba(139,92,246,0.50);
        --nbp-text: rgba(255,255,255,0.93);
        --nbp-muted: rgba(255,255,255,0.48);
        --nbp-muted2: rgba(255,255,255,0.30);
        --nbp-accent: #a78bfa;
        --nbp-accent-glow: rgba(139,92,246,0.22);
        --nbp-accent-bright: #c4b5fd;
        --nbp-danger: #f87171;
        --nbp-danger-bg: rgba(248,113,113,0.08);
        --nbp-danger-border: rgba(248,113,113,0.28);
        --nbp-rec: #fb7185;
        --nbp-rec-glow: rgba(251,113,133,0.45);
        --nbp-radius: 20px;
        --nbp-radius-sm: 12px;
        --nbp-shadow: 0 24px 64px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.04) inset;
        --nbp-font: 'Syne', ui-sans-serif, system-ui, -apple-system, sans-serif;
        --nbp-font-mono: 'DM Mono', ui-monospace, monospace;
      }

      .nbp-ui{
        font-family: var(--nbp-font);
        color: var(--nbp-text);
        width: 100%;
        height: 100%;
        min-height: 100%;
        background:
          radial-gradient(ellipse 800px 500px at 20% -5%, rgba(139,92,246,0.07), transparent 60%),
          radial-gradient(ellipse 600px 400px at 85% 15%, rgba(99,102,241,0.05), transparent 55%),
          radial-gradient(ellipse 500px 300px at 50% 90%, rgba(139,92,246,0.04), transparent 60%),
          var(--nbp-bg);
      }

      .nbp-surface{
        width: min(920px, 100%);
        margin: 0 auto;
        padding: 16px;
        box-sizing: border-box;
      }

      .nbp-topbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        padding: 12px 16px;
        border: 1px solid var(--nbp-border);
        background: rgba(255,255,255,0.025);
        border-radius: var(--nbp-radius);
        box-shadow: var(--nbp-shadow);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      /* Brand wordmark in topbar */
      .nbp-topbar::before {
        content: "NEUROBREAK™";
        font-family: var(--nbp-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.20em;
        color: var(--nbp-accent);
        opacity: 0.70;
        flex-shrink: 0;
      }

      .nbp-modes{
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .nbp-chip{
        appearance:none;
        border: 1px solid var(--nbp-border);
        background: rgba(255,255,255,0.03);
        color: var(--nbp-muted);
        padding: 7px 12px;
        border-radius: 999px;
        font-family: var(--nbp-font);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        line-height: 1;
        cursor: pointer;
        transition: transform .10s ease, background .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease;
      }
      .nbp-chip:active{ transform: scale(0.97); }
      .nbp-chip.is-active{
        color: var(--nbp-accent-bright);
        border-color: var(--nbp-border-active);
        background: var(--nbp-accent-glow);
        box-shadow: 0 0 12px rgba(139,92,246,0.15);
      }

      .nbp-status{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        min-width: 130px;
      }

      .nbp-pill{
        display:inline-flex;
        align-items:center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid var(--nbp-border);
        background: rgba(0,0,0,0.30);
        color: var(--nbp-muted);
        font-family: var(--nbp-font-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }

      .nbp-body{
        display:grid;
        grid-template-columns: 1fr;
        gap: 14px;
        margin-top: 14px;
      }

      .nbp-block{
        border: 1px solid var(--nbp-border);
        background: var(--nbp-surface);
        border-radius: var(--nbp-radius);
        box-shadow: var(--nbp-shadow);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 16px;
        transition: border-color .20s ease;
      }
      .nbp-block:focus-within {
        border-color: rgba(139,92,246,0.20);
      }

      .nbp-title{
        font-size: 10px;
        font-weight: 700;
        color: var(--nbp-accent);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        margin-bottom: 12px;
        opacity: 0.70;
      }

      .nbp-dropzone{
        border: 1px dashed rgba(139,92,246,0.22);
        background: rgba(139,92,246,0.03);
        border-radius: 14px;
        padding: 18px;
        outline: none;
        cursor: pointer;
        user-select: none;
        transition: border-color .15s ease, background .15s ease;
      }
      .nbp-dropzone:hover {
        border-color: rgba(139,92,246,0.38);
        background: rgba(139,92,246,0.055);
      }
      .nbp-dropzone.is-dragover{
        border-color: var(--nbp-accent);
        background: rgba(139,92,246,0.09);
        box-shadow: 0 0 0 3px rgba(139,92,246,0.10);
      }

      .nbp-drop-title{
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .nbp-drop-sub{
        font-size: 12px;
        color: var(--nbp-muted);
        margin-bottom: 14px;
        font-family: var(--nbp-font-mono);
      }

      .nbp-drop-actions{
        display:flex;
        align-items:center;
        gap: 10px;
      }

      .nbp-file{
        display:none;
      }

      .nbp-filemeta{
        margin-top: 12px;
        font-size: 12px;
        color: var(--nbp-muted);
        display:flex;
        gap: 6px;
        font-family: var(--nbp-font-mono);
        align-items: center;
      }
      .nbp-filemeta::before {
        content: "·";
        color: var(--nbp-accent);
        opacity: 0.60;
      }
      .nbp-filename{
        color: var(--nbp-accent-bright);
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .nbp-controls-row{
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .nbp-btn{
        appearance:none;
        border: 1px solid var(--nbp-border);
        background: rgba(255,255,255,0.05);
        color: var(--nbp-text);
        padding: 11px 18px;
        border-radius: var(--nbp-radius-sm);
        font-family: var(--nbp-font);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.04em;
        cursor:pointer;
        transition: transform .09s ease, background .14s ease, border-color .14s ease, opacity .14s ease, box-shadow .14s ease;
      }
      .nbp-btn:hover:not(:disabled){
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.14);
      }
      .nbp-btn:active:not(:disabled){ transform: scale(0.975); }
      .nbp-btn:disabled{
        opacity: 0.35;
        cursor:not-allowed;
      }
      .nbp-btn-primary{
        background: linear-gradient(135deg, rgba(139,92,246,0.28) 0%, rgba(99,102,241,0.18) 100%);
        border-color: rgba(139,92,246,0.42);
        color: var(--nbp-accent-bright);
        box-shadow: 0 0 20px rgba(139,92,246,0.12), 0 1px 0 rgba(255,255,255,0.07) inset;
      }
      .nbp-btn-primary:hover:not(:disabled){
        background: linear-gradient(135deg, rgba(139,92,246,0.38) 0%, rgba(99,102,241,0.26) 100%);
        border-color: rgba(139,92,246,0.60);
        box-shadow: 0 0 28px rgba(139,92,246,0.22), 0 1px 0 rgba(255,255,255,0.07) inset;
      }
      .nbp-btn-ghost{
        background: rgba(255,255,255,0.03);
        border-color: rgba(255,255,255,0.08);
        font-size: 16px;
        padding: 10px 14px;
      }
      .nbp-btn-ghost:hover:not(:disabled){
        background: rgba(255,255,255,0.06);
      }
      .nbp-btn-danger{
        border-color: var(--nbp-danger-border);
        background: var(--nbp-danger-bg);
        color: var(--nbp-danger);
      }
      .nbp-btn-danger:hover:not(:disabled){
        background: rgba(248,113,113,0.14);
        border-color: rgba(248,113,113,0.42);
      }

      /* ============ V2.0 UI additions (textarea + advanced) ============ */
      .nbp-ta{
        width:100%; box-sizing:border-box; margin-top:12px;
        background: rgba(0,0,0,0.25);
        border: 1px solid var(--nbp-border);
        border-radius: 14px;
        padding: 14px 16px;
        color: var(--nbp-text);
        font-family: var(--nbp-font-mono);
        font-size: 13px;
        line-height: 1.6;
        resize: vertical;
        min-height: 130px;
        max-height: 42vh;
        outline: none;
        transition: border-color .15s ease, box-shadow .15s ease;
      }
      .nbp-ta:focus{
        border-color: rgba(139,92,246,0.38);
        box-shadow: 0 0 0 3px rgba(139,92,246,0.08);
      }
      .nbp-ta::placeholder{ color: var(--nbp-muted2); }

      .nbp-advanced{ margin-top: 0; }
      .nbp-row{
        display:grid;
        grid-template-columns: 92px 1fr;
        gap: 10px;
        align-items:center;
        padding: 8px 0;
        color: var(--nbp-muted);
        font-size: 12px;
        font-family: var(--nbp-font-mono);
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .nbp-row:last-child { border-bottom: none; }
      .nbp-control{ display:flex; align-items:center; gap: 10px; min-width: 0; }
      .nbp-row input[type="range"]{ width:100%; min-width: 0; accent-color: var(--nbp-accent); }
      .nbp-advanced input[type="range"]{
        appearance: auto;
        -webkit-appearance: auto;
        background: transparent;
      }
      .nbp-val{
        display:inline-flex; align-items:center; justify-content:center;
        min-width: 52px; padding: 6px 9px;
        border-radius: 8px;
        border: 1px solid var(--nbp-border);
        background: rgba(0,0,0,0.30);
        color: var(--nbp-accent-bright);
        font-family: var(--nbp-font-mono);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }

      .nbp-small{
        margin-top: 10px;
        font-size: 11px;
        color: var(--nbp-muted2);
        line-height: 1.45;
        font-family: var(--nbp-font-mono);
      }
      .nbp-mic-meter{
        height:3px;
        margin-top:10px;
        border-radius:999px;
        background:rgba(255,255,255,0.06);
        overflow:hidden;
        position: relative;
      }
      .nbp-mic-meter-fill{
        height:100%;
        width:4%;
        background: linear-gradient(90deg, var(--nbp-accent) 0%, var(--nbp-accent-bright) 100%);
        border-radius: 999px;
        transition:width .10s ease;
        box-shadow: 0 0 6px var(--nbp-accent);
      }
      .nbp-mic-note,.nbp-home-help{margin-top:8px;line-height:1.5;color:var(--nbp-muted2);font-size:12px;font-family:var(--nbp-font-mono)}
      .nbp-home-help{
        padding:12px 14px;
        border:1px solid rgba(139,92,246,0.10);
        border-radius:12px;
        background:rgba(139,92,246,0.04);
        counter-reset: step;
      }

      /* ============ FOCUS OVERLAY ============ */
      .nbp-focus{
        position: fixed;
        inset: 0;
        background: #040406;
        display:none;
        z-index: 9999;
      }
      .nbp-focus.is-on{
        display:block;
        animation: nbp-focus-in 0.25s ease both;
      }
      @keyframes nbp-focus-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      .nbp-focus-top{
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        display:flex;
        justify-content:flex-end;
        pointer-events: none;
        z-index: 5;
      }
      .nbp-focus-actions{
        display:flex;
        gap: 8px;
        pointer-events: auto;
      }
      .nbp-focus-bottom{
        position:absolute;left:14px;right:14px;bottom:16px;z-index:4;display:grid;gap:10px;
      }
      .nbp-focus-rec-row,.nbp-focus-main-row,.nbp-focus-sliders-row{display:flex;justify-content:center;gap:10px;align-items:center}
      .nbp-btn-rec{
        min-width: 140px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.10em;
        padding: 14px 22px;
        background: rgba(220,38,38,0.14);
        border-color: rgba(220,38,38,0.45);
        color: #fca5a5;
        border-radius: 14px;
        box-shadow: 0 0 18px rgba(220,38,38,0.12);
        transition: background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .09s ease;
      }
      .nbp-btn-rec:hover:not(:disabled){
        background: rgba(220,38,38,0.22);
        border-color: rgba(220,38,38,0.65);
        box-shadow: 0 0 28px rgba(220,38,38,0.25);
      }
      .nbp-focus-rec-status{
        display:flex;
        justify-content:center;
        align-items:center;
        gap:8px;
        min-height:18px;
        font-size:11px;
        font-family: var(--nbp-font-mono);
        letter-spacing: 0.06em;
        color:rgba(255,255,255,0.70);
      }
      .nbp-rec-dot{
        width:8px;
        height:8px;
        border-radius:999px;
        background: var(--nbp-rec);
        box-shadow:0 0 8px var(--nbp-rec-glow);
        animation: nbp-rec-pulse 1.2s ease infinite;
      }
      @keyframes nbp-rec-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.45; }
      }
      .nbp-rec-dot.is-paused{
        background:rgba(255,255,255,0.35);
        box-shadow:none;
        animation: none;
      }
      .nbp-mini-slider{display:flex;align-items:center;gap:8px;color:var(--nbp-muted);font-family:var(--nbp-font-mono);font-size:12px}
      .nbp-mini-slider input{width:110px;accent-color:var(--nbp-accent)}

      /* Vertical zone slider — right edge of focus overlay */
      .nbp-zone-slider-rail{
        position: absolute;
        right: 10px;
        top: 10%;
        height: 55%;
        width: 28px;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }
      .nbp-zone-slider-rail input[type="range"]{
        writing-mode: vertical-lr;
        direction: rtl;
        -webkit-appearance: slider-vertical;
        appearance: slider-vertical;
        width: 4px;
        height: 100%;
        accent-color: var(--nbp-accent);
        cursor: pointer;
        opacity: 0.55;
        transition: opacity .15s ease;
      }
      .nbp-zone-slider-rail:hover input[type="range"]{
        opacity: 1;
      }

      /* Width slider — centered at bottom of focus sliders row */
      .nbp-focus-sliders-row{
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        color: var(--nbp-muted);
        font-family: var(--nbp-font-mono);
        font-size: 12px;
      }
      .nbp-focus-sliders-row .nbp-mini-slider input{
        width: 160px;
      }
      .nbp-focus-actions .nbp-btn,
      .nbp-focus-bottom .nbp-btn{
        background: rgba(10,10,18,0.75);
        color: rgba(255,255,255,0.80);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }
      .nbp-focus-actions .nbp-btn:hover,
      .nbp-focus-bottom .nbp-btn:hover{
        background: rgba(20,20,36,0.85);
        border-color: rgba(255,255,255,0.20);
        color: #fff;
      }
      /* Override danger in focus */
      .nbp-focus-bottom .nbp-btn-danger{
        border-color: var(--nbp-danger-border);
        color: var(--nbp-danger);
      }
      /* Override prompt btn active state */
      .nbp-focus-main-row .nbp-btn{
        flex: 1;
        justify-content: center;
        text-align: center;
      }
      .nbp-focus-bottom .nbp-btn[data-action="focus-pause"]{
        background: rgba(139,92,246,0.10);
        border-color: rgba(139,92,246,0.28);
        color: var(--nbp-accent-bright);
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .nbp-focus-bottom .nbp-btn[data-action="focus-pause"]:hover{
        background: rgba(139,92,246,0.18);
        border-color: rgba(139,92,246,0.45);
        box-shadow: 0 0 18px rgba(139,92,246,0.15);
      }

      .nbp-focus.has-adv .nbp-focus-bottom,.nbp-focus.has-adv .nbp-focus-hint{display:none}
      .nbp-text-width,.nbp-reading-zone-control{display:none}

      .nbp-focus-text{
        position:absolute;
        inset: 68px 14px 174px 14px;
        overflow:hidden;
        border-radius: 18px;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.06);
        touch-action: none;
      }
      .nbp-focus-text::before,
      .nbp-focus-text::after{
        content:none;
      }
      .nbp-reading-zone{
        position:absolute;
        left:8px;
        right:8px;
        top:38%;
        transform:translateY(-50%);
        height:72px;
        border:1px solid rgba(139,92,246,0.22);
        border-radius:14px;
        background:rgba(5,4,14,0.65);
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.15) inset,
          0 0 20px rgba(139,92,246,0.06);
        pointer-events:none;
        z-index:2;
      }
      .nbp-focus:not(.has-adv) .nbp-advanced{ display:none; }
      .nbp-focus .nbp-advanced{
        position:absolute; left:14px; right:14px; bottom:14px;
        max-height:80px; overflow:auto; padding: 8px 12px;
        border-radius: 14px;
        background: rgba(5,4,14,0.80);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(139,92,246,0.15);
      }
      .nbp-focus.has-adv .nbp-focus-text{ inset: 68px 14px 108px 14px; }
      .nbp-focus.has-adv .nbp-text-width{ display:none; }

      .nbp-adv-toggle{
        width:100%; display:flex; align-items:center; justify-content:space-between;
        background: transparent; border:0; padding: 0 0 8px 0; cursor:pointer;
        color: var(--nbp-muted);
        font-family: var(--nbp-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .nbp-adv-caret{ color: var(--nbp-accent); opacity:0.60; transition: transform 180ms ease; }
      .nbp-focus.has-adv .nbp-adv-caret{ transform: rotate(180deg); }

      /* compact sliders in focus */
      .nbp-row{ padding: 4px 0; gap: 8px; grid-template-columns: 58px 1fr; border-bottom: none; }
      .nbp-row input[type="range"]{ height: 12px; }
      .nbp-val{ min-width: 44px; padding: 4px 7px; }

      .nbp-rule-of-thirds{
        position:absolute;
        inset:0;
        pointer-events:none;
        z-index:1;
      }
      .nbp-rule-of-thirds::before{
        content:"";
        position:absolute;
        inset:0;
        background-image:
          linear-gradient(to right,
            transparent calc(33.333% - 1px),
            rgba(255, 215, 0, 0.80) calc(33.333% - 1px),
            rgba(255, 215, 0, 0.80) calc(33.333% + 1px),
            transparent calc(33.333% + 1px)),
          linear-gradient(to right,
            transparent calc(66.666% - 1px),
            rgba(255, 215, 0, 0.80) calc(66.666% - 1px),
            rgba(255, 215, 0, 0.80) calc(66.666% + 1px),
            transparent calc(66.666% + 1px));
      }
      .nbp-rule-of-thirds::after{
        content:"";
        position:absolute;
        inset:0;
        background-image:
          linear-gradient(to bottom,
            transparent calc(33.333% - 1px),
            rgba(255, 215, 0, 0.80) calc(33.333% - 1px),
            rgba(255, 215, 0, 0.80) calc(33.333% + 1px),
            transparent calc(33.333% + 1px)),
          linear-gradient(to bottom,
            transparent calc(66.666% - 1px),
            rgba(255, 215, 0, 0.80) calc(66.666% - 1px),
            rgba(255, 215, 0, 0.80) calc(66.666% + 1px),
            transparent calc(66.666% + 1px));
      }

      .nbp-focus-inner{
        position:absolute;
        left: 0;
        right: 0;
        top: 0;
        padding: 24px 20px;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: var(--nbp-font);
        font-size: clamp(18px, 3.4vw, 30px);
        font-weight: 500;
        line-height: 1.55;
        color: rgba(255,255,255,0.95);
        text-shadow: 0 2px 12px rgba(0,0,0,0.70);
        z-index: 4;
        will-change: transform;
      }

      .nbp-focus-hint{
        position:absolute;
        left: 14px;
        right: 14px;
        bottom: 14px;
        text-align:center;
        font-size: 11px;
        font-family: var(--nbp-font-mono);
        letter-spacing: 0.06em;
        color: rgba(255,255,255,0.30);
        transition: opacity .18s ease;
        user-select:none;
        pointer-events:none;
      }

      /* Desktop enhancements */
      @media (min-width: 860px){
        .nbp-body{
          grid-template-columns: 1fr;
          align-items: start;
        }
      }

      /* =====================================================
         Landscape layout for focus mode
         ===================================================== */
      .nb-landscape .nbp-focus-bottom{
        position:absolute;
        right:14px;
        bottom:14px;
        left:auto;
        top:auto;
        width:240px;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
        align-items:stretch;
        gap:14px;
        z-index:6;
      }
      .nb-landscape .nbp-focus-text{
        inset:68px 14px 14px 14px;
      }
	        .nbp-export-modal{
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 10050;
        padding: 20px;
      }

      .nbp-export-modal.is-open{
        display: flex;
      }

      .nbp-export-card{
        width: min(420px, 100%);
        border: 1px solid var(--nbp-border);
        background: rgba(10,10,18,0.94);
        border-radius: 18px;
        box-shadow: var(--nbp-shadow);
        padding: 22px;
      }

      .nbp-export-title{
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.04em;
        margin-bottom: 10px;
        color: var(--nbp-text);
      }

      .nbp-export-text{
        font-size: 13px;
        color: var(--nbp-muted);
        margin-bottom: 18px;
        font-family: var(--nbp-font-mono);
      }

      .nbp-export-actions{
        display: grid;
        gap: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================
     API
     ========================= */
  return {
   init,
   render
 };
}

/* Convenience default export (optional style) */
export const ui = createUIShell();

/* ============================================================
   UI livré — shell indépendant.
   ============================================================ */
