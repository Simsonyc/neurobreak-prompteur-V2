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

// ── Variables état nouvelle UI focus (portée createUIShell) ──
let nbfSpeed = 28;
const nbfRmsList = [0.001,0.002,0.003,0.004,0.006,0.008,0.01,0.015,0.02,0.03,0.05,0.07];
let nbfRmsIdx = 4;
let nbfFontSize = 24;
const nbfWeightList = [300,400,500,600,700,800];
let nbfWeightIdx = 3;
let nbfSilDelay = 650;
let nbfRzTopPct = 0.38;
let nbfRzHeight = 72;
let nbfTimerInterval = null;
let nbfVDragging = false, nbfVDragStartY = 0, nbfVDragStartPct = 0;
let nbfTextAlign = "center"; // "left" | "center" | "right"
let nbfGridMode = "off"; // "off" | "grid" | "face"
let $nbfGrid = null;
let $nbfAlignBtns = null;

// Refs DOM nouvelles (initialisées dans mount)
let $nbfStatusDot, $nbfStatusTxt, $nbfRecTimer, $nbfRecTimerDot, $nbfRecTimerVal;
let $nbfMicState, $nbfSpeedVal, $nbfRmsVal, $nbfPromptIcon, $nbfPromptLbl;
let $nbfRecPauseIcon, $nbfRecPauseLbl, $nbfRecDot, $nbfRecPauseBtn, $nbfAdvOverlay;
let $nbfAdvFontVal, $nbfAdvWeightVal, $nbfAdvSilVal, $nbfVThumb, $nbfVTrack;
let $nbfMicCanvas = null, nbfMicCtx = null;
const nbfMicHistory = new Array(60).fill(0);

// ── Fonctions timer ──
function nbfFormatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0");
}
function nbfStartTimer() {
  if ($nbfRecTimer) $nbfRecTimer.style.opacity = "1";
  if ($nbfRecTimerDot) { $nbfRecTimerDot.style.background="#ef4444"; $nbfRecTimerDot.style.animationPlayState="running"; }
  clearInterval(nbfTimerInterval);
  nbfTimerInterval = setInterval(() => {
    const elapsed = Date.now() - recStartedAt - recPausedAccumMs;
    if ($nbfRecTimerVal) $nbfRecTimerVal.textContent = nbfFormatTime(elapsed);
  }, 500);
}
function nbfPauseTimer() {
  clearInterval(nbfTimerInterval);
  if ($nbfRecTimerDot) { $nbfRecTimerDot.style.background="#f59e0b"; $nbfRecTimerDot.style.animationPlayState="paused"; }
}
function nbfStopTimer() {
  clearInterval(nbfTimerInterval); nbfTimerInterval = null;
  if ($nbfRecTimer) $nbfRecTimer.style.opacity = "0";
  if ($nbfRecTimerVal) $nbfRecTimerVal.textContent = "00:00";
}

// ── Appliquer largeur texte + reading zone ──
function nbfApplyWidth() {
  if ($focusTextInner) {
    $focusTextInner.style.width = textWidthPercent + "%";
    $focusTextInner.style.maxWidth = textWidthPercent + "%";
    nbfApplyAlign();
  }
  nbfApplyReadingZoneAlign();
  if ($focusWidthValue) $focusWidthValue.textContent = textWidthPercent + "%";
}

// ── Synchroniser la reading zone avec l'alignement ──
function nbfApplyReadingZoneAlign() {
  if (!$readingZone) return;
  const GAP = "16px";
  const margin = (100 - textWidthPercent) / 2 + "%";
  if (nbfTextAlign === "left") {
    $readingZone.style.left = GAP;
    $readingZone.style.right = margin;
  } else if (nbfTextAlign === "right") {
    $readingZone.style.left = margin;
    $readingZone.style.right = GAP;
  } else {
    $readingZone.style.left = margin;
    $readingZone.style.right = margin;
  }
}

// ── Appliquer alignement texte ──
function nbfApplyAlign() {
  if (!$focusTextInner) return;
  $focusTextInner.style.textAlign = nbfTextAlign;
  const GAP = "16px";
  if (nbfTextAlign === "left") {
    $focusTextInner.style.marginLeft = GAP;
    $focusTextInner.style.marginRight = "auto";
  } else if (nbfTextAlign === "right") {
    $focusTextInner.style.marginLeft = "auto";
    $focusTextInner.style.marginRight = GAP;
  } else {
    $focusTextInner.style.marginLeft = "auto";
    $focusTextInner.style.marginRight = "auto";
  }
  if ($nbfAlignBtns) {
    $nbfAlignBtns.forEach(btn => {
      btn.classList.toggle("nbf-align-active", btn.dataset.align === nbfTextAlign);
    });
  }
  nbfApplyReadingZoneAlign();
}

// ── Cycle grille : off → grid → face → off ──
function nbfToggleGrid() {
  const modes = ["off", "grid", "face"];
  nbfGridMode = modes[(modes.indexOf(nbfGridMode) + 1) % modes.length];
  if ($nbfGrid) {
    $nbfGrid.className = "nbf-grid";
    if (nbfGridMode !== "off") $nbfGrid.classList.add("nbf-grid-" + nbfGridMode);
  }
  const $btn = $app?.querySelector('[data-action="focus-grid"]');
  if ($btn) {
    $btn.classList.toggle("nbf-ico-on", nbfGridMode !== "off");
    $btn.title = nbfGridMode === "off" ? "Grille des tiers" : nbfGridMode === "grid" ? "Ellipse visage" : "Désactiver";
    // Swap icône selon mode
    const svgGrid = '<line x1="8" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/>';
    const svgFace = '<ellipse cx="12" cy="10" rx="6" ry="7"/><path d="M6 17c0 3 2.5 5 6 5s6-2 6-5"/>';
    $btn.querySelector("svg").innerHTML = nbfGridMode === "face" ? svgFace : svgGrid;
  }
}

// ── Positionner la reading zone ──
function nbfPositionRZ() {
  const focusH = window.innerHeight;
  const topPx = focusH * nbfRzTopPct;
  if ($readingZone) {
    $readingZone.style.top = topPx + "px";
    $readingZone.style.height = nbfRzHeight + "px";
    $readingZone.style.transform = "none";
  }
  readingZoneTop = Math.round(nbfRzTopPct * 100);
  if ($focusZoneValue) $focusZoneValue.textContent = nbfRzHeight + "px";
}

// ── Statut pill ──
function nbfSetStatus(state, pauseReason) {
  if (!$nbfStatusDot || !$nbfStatusTxt) return;
  $nbfStatusDot.className = "nbf-pill-dot";
  if (state === "S9_FOCUS_RUNNING") {
    $nbfStatusDot.classList.add("speaking"); $nbfStatusTxt.textContent = "En lecture";
  } else if (pauseReason === "MANUAL") {
    $nbfStatusDot.classList.add("paused"); $nbfStatusTxt.textContent = "En pause";
  } else if (pauseReason === "AUDIO") {
    $nbfStatusDot.classList.add("paused"); $nbfStatusTxt.textContent = "Silence…";
  } else {
    $nbfStatusTxt.textContent = "Prêt";
  }
}

// ── Bouton Rec+Pause ──
function nbfUpdateRecPause() {
  if (!recorder) return;
  const state = recorder.getState();
  if (!$nbfRecDot || !$nbfRecPauseIcon || !$nbfRecPauseLbl) return;
  if (state === "RECORDING") {
    $nbfRecDot.classList.add("nbf-rec-dot-pulse"); $nbfRecDot.classList.remove("nbf-rec-dot-paused");
    $nbfRecPauseLbl.textContent = "Pause";
    $nbfRecPauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    $nbfRecPauseBtn?.classList.add("nbf-btn-recpause-on"); $nbfRecPauseBtn?.classList.remove("nbf-btn-recpause-paused");
  } else if (state === "PAUSED") {
    $nbfRecDot.classList.remove("nbf-rec-dot-pulse"); $nbfRecDot.classList.add("nbf-rec-dot-paused");
    $nbfRecPauseLbl.textContent = "Reprendre";
    $nbfRecPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    $nbfRecPauseBtn?.classList.remove("nbf-btn-recpause-on"); $nbfRecPauseBtn?.classList.add("nbf-btn-recpause-paused");
  } else {
    $nbfRecDot.classList.remove("nbf-rec-dot-pulse","nbf-rec-dot-paused");
    $nbfRecPauseLbl.textContent = "Rec + lancer";
    $nbfRecPauseIcon.innerHTML = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="rgba(239,68,68,0.85)" stroke="none"/>';
    $nbfRecPauseBtn?.classList.remove("nbf-btn-recpause-on","nbf-btn-recpause-paused");
  }
}

// ── Bouton Prompt ──
function nbfUpdatePrompt(promptState) {
  if (!$nbfPromptIcon || !$nbfPromptLbl || !$focusBtnPause) return;
  const isPaused = promptState === "S10_PAUSED_MANUAL";
  const isRunning = promptState === "S9_FOCUS_RUNNING" || promptState === "S11_PAUSED_AUDIO";
  if (isPaused || promptState === "S7_PRE_FOCUS") {
    $nbfPromptIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    $nbfPromptLbl.textContent = "Prompt";
    $focusBtnPause.classList.remove("nbf-btn-prompt-on");
  } else if (isRunning) {
    $nbfPromptIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    $nbfPromptLbl.textContent = "Stopper";
    $focusBtnPause.classList.add("nbf-btn-prompt-on");
  }
}

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

        <!-- TOPBAR FOCUS -->
        <div class="nbf-topbar">
          <div class="nbf-pill">
            <span class="nbf-pill-dot" id="nbf-status-dot"></span>
            <span class="nbf-pill-txt" id="nbf-status-txt">Prêt</span>
          </div>
          <div class="nbf-rec-timer" id="nbf-rec-timer">
            <span class="nbf-rec-timer-dot" id="nbf-rec-timer-dot"></span>
            <span class="nbf-rec-timer-val" id="nbf-rec-timer-val">00:00</span>
          </div>
          <div class="nbf-topbar-right">
            <div class="nbf-align-group">
              <button class="nbf-ico nbf-align-btn" type="button" data-align="left" title="Gauche">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
              </button>
              <button class="nbf-ico nbf-align-btn nbf-align-active" type="button" data-align="center" title="Centre">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>
              </button>
              <button class="nbf-ico nbf-align-btn" type="button" data-align="right" title="Droite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
            <button class="nbf-ico" type="button" data-action="focus-grid" title="Grille des tiers">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>
            </button>
            <button class="nbf-ico" type="button" data-action="focus-home" title="Écran noir">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            </button>
            <button class="nbf-ico" type="button" data-action="focus-advanced" title="Paramètres avancés">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>

        <!-- ZONE TEXTE -->
        <div class="nbp-focus-text" role="region" aria-label="Texte en focus">
          <div class="nbp-reading-zone"></div>
          <div class="nbp-focus-inner"></div>
        </div>

        <!-- GRILLE DES TIERS / ELLIPSE VISAGE -->
        <div class="nbf-grid" id="nbf-grid" aria-hidden="true">
          <div class="nbf-grid-line nbf-grid-v1"></div>
          <div class="nbf-grid-line nbf-grid-v2"></div>
          <div class="nbf-grid-line nbf-grid-h1"></div>
          <div class="nbf-grid-line nbf-grid-h2"></div>
          <svg class="nbf-face-ellipse" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="50" cy="38" rx="22" ry="30" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="0.4"/>
          </svg>
        </div>

        <!-- SLIDER VERTICAL HAUTEUR (droite) -->
        <div class="nbf-vslider-wrap">
          <span class="nbf-vslider-lbl">hauteur</span>
          <div class="nbf-vslider-track" id="nbf-vslider-track">
            <div class="nbf-vslider-thumb" id="nbf-vslider-thumb"></div>
          </div>
          <span class="nbf-vslider-val" id="nbf-vslider-val">72px</span>
        </div>

        <!-- BOTTOMBAR -->
        <div class="nbf-bottombar">

          <!-- Slider largeur texte -->
          <div class="nbf-hslider-wrap">
            <span class="nbf-hslider-lbl">largeur</span>
            <input class="nbp-text-width-range nbf-hrange" type="range" min="40" max="100" step="1" value="75">
            <span class="nbf-hslider-val" id="nbf-hslider-val">75%</span>
          </div>

          <!-- Indicateur micro -->
          <div class="nbf-mic-row">
            <svg class="nbf-mic-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
            <canvas class="nbf-mic-canvas" id="nbf-mic-canvas" width="160" height="24"></canvas>
            <span class="nbf-mic-state" id="nbf-mic-state">—</span>
          </div>

          <!-- +/- Vitesse et Seuil micro -->
          <div class="nbf-pm-row">
            <div class="nbf-pm-block">
              <div class="nbf-pm-label">Vitesse</div>
              <div class="nbf-pm-ctrl">
                <button class="nbf-pm-btn" type="button" data-action="speed-minus">−</button>
                <span class="nbf-pm-val" id="nbf-speed-val">28</span>
                <button class="nbf-pm-btn" type="button" data-action="speed-plus">+</button>
              </div>
            </div>
            <div class="nbf-pm-block">
              <div class="nbf-pm-label">Seuil micro</div>
              <div class="nbf-pm-ctrl">
                <button class="nbf-pm-btn" type="button" data-action="rms-minus">−</button>
                <span class="nbf-pm-val" id="nbf-rms-val">0.006</span>
                <button class="nbf-pm-btn" type="button" data-action="rms-plus">+</button>
              </div>
            </div>
          </div>

          <!-- Boutons principaux -->
          <div class="nbf-btn-row">
            <button class="nbf-btn-prompt" type="button" data-action="focus-pause">
              <svg id="nbf-prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span id="nbf-prompt-lbl">Prompt</span>
            </button>
            <button class="nbf-btn-recpause" type="button" data-action="focus-reset">
              <span class="nbf-rec-dot" id="nbf-rec-dot"></span>
              <svg id="nbf-recpause-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="rgba(239,68,68,0.85)" stroke="none"/></svg>
              <span id="nbf-recpause-lbl">Rec + lancer</span>
            </button>
            <button class="nbf-btn-stop" type="button" data-action="focus-stop" title="Stop — sauvegarde">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
          </div>

        </div>

        <!-- PANNEAU AVANCÉ (overlay dans focus) -->
        <div class="nbf-adv-overlay" id="nbf-adv-overlay">
          <div class="nbf-adv-header">
            <span class="nbf-adv-title">Paramètres avancés</span>
            <button class="nbf-adv-close" type="button" data-action="focus-adv-close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="nbf-adv-body">
            <div class="nbf-adv-section">Texte</div>
            <div class="nbf-adv-row">
              <div><div class="nbf-adv-lbl">Taille de police</div><div class="nbf-adv-sub">px</div></div>
              <div class="nbf-adv-ctrl">
                <button class="nbf-adv-pm" type="button" data-k="EV_SET_FONT_SIZE" data-dir="-1">−</button>
                <span class="nbf-adv-pval" id="nbf-adv-font-val">24px</span>
                <button class="nbf-adv-pm" type="button" data-k="EV_SET_FONT_SIZE" data-dir="1">+</button>
              </div>
            </div>
            <div class="nbf-adv-row">
              <div><div class="nbf-adv-lbl">Poids de police</div><div class="nbf-adv-sub">font-weight</div></div>
              <div class="nbf-adv-ctrl">
                <button class="nbf-adv-pm" type="button" data-k="EV_SET_FONT_WEIGHT" data-dir="-1">−</button>
                <span class="nbf-adv-pval" id="nbf-adv-weight-val">600</span>
                <button class="nbf-adv-pm" type="button" data-k="EV_SET_FONT_WEIGHT" data-dir="1">+</button>
              </div>
            </div>
            <div class="nbf-adv-section">Audio</div>
            <div class="nbf-adv-row">
              <div><div class="nbf-adv-lbl">Délai silence</div><div class="nbf-adv-sub">ms avant pause auto</div></div>
              <div class="nbf-adv-ctrl">
                <button class="nbf-adv-pm" type="button" data-k="EV_SET_SILENCE_DELAY" data-dir="-1">−</button>
                <span class="nbf-adv-pval" id="nbf-adv-sil-val">650ms</span>
                <button class="nbf-adv-pm" type="button" data-k="EV_SET_SILENCE_DELAY" data-dir="1">+</button>
              </div>
            </div>
          </div>
        </div>

        <div class="nbp-focus-rec-status" aria-live="polite" style="display:none"></div>
        <div class="nbp-focus-hint" style="display:none"></div>
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

    $focusOverlay  = $app.querySelector(".nbp-focus");
$focusTextWrap = $app.querySelector(".nbp-focus-text");
$readingZone   = $app.querySelector(".nbp-reading-zone");
$focusTextInner = $app.querySelector(".nbp-focus-inner");
$focusWidthRange = $app.querySelector(".nbp-text-width-range");
$focusWidthValue = $app.querySelector("#nbf-hslider-val");
$focusZoneRange  = null;
$focusZoneValue  = $app.querySelector("#nbf-vslider-val");
$focusBtnPause   = $app.querySelector('[data-action="focus-pause"]');
$focusBtnStop    = $app.querySelector('[data-action="focus-stop"]');
$focusHint       = $app.querySelector(".nbp-focus-hint");
$focusRecStatus  = $app.querySelector(".nbp-focus-rec-status");
$exportModal     = $app.querySelector(".nbp-export-modal");
$exportBtnWebm   = $app.querySelector('[data-action="export-webm"]');
$exportBtnMp4    = $app.querySelector('[data-action="export-mp4"]');
$exportBtnRetake = $app.querySelector('[data-action="export-retake"]');
$exportBtnClose  = $app.querySelector('[data-action="export-close"]');

// Assignation refs DOM nouvelles UI (les variables sont déclarées au niveau createUIShell)
$nbfStatusDot    = $app.querySelector("#nbf-status-dot");
$nbfStatusTxt    = $app.querySelector("#nbf-status-txt");
$nbfRecTimer     = $app.querySelector("#nbf-rec-timer");
$nbfRecTimerDot  = $app.querySelector("#nbf-rec-timer-dot");
$nbfRecTimerVal  = $app.querySelector("#nbf-rec-timer-val");
$nbfMicState     = $app.querySelector("#nbf-mic-state");
$nbfMicCanvas  = $app.querySelector("#nbf-mic-canvas");
nbfMicCtx      = $nbfMicCanvas?.getContext("2d");
$nbfSpeedVal     = $app.querySelector("#nbf-speed-val");
$nbfRmsVal       = $app.querySelector("#nbf-rms-val");
$nbfPromptIcon   = $app.querySelector("#nbf-prompt-icon");
$nbfPromptLbl    = $app.querySelector("#nbf-prompt-lbl");
$nbfRecPauseIcon = $app.querySelector("#nbf-recpause-icon");
$nbfRecPauseLbl  = $app.querySelector("#nbf-recpause-lbl");
$nbfRecDot       = $app.querySelector("#nbf-rec-dot");
$nbfRecPauseBtn  = $app.querySelector('[data-action="focus-reset"]');
$nbfAdvOverlay   = $app.querySelector("#nbf-adv-overlay");
$nbfAdvFontVal   = $app.querySelector("#nbf-adv-font-val");
$nbfAdvWeightVal = $app.querySelector("#nbf-adv-weight-val");
$nbfAdvSilVal    = $app.querySelector("#nbf-adv-sil-val");
$nbfVThumb       = $app.querySelector("#nbf-vslider-thumb");
$nbfVTrack       = $app.querySelector("#nbf-vslider-track");
$nbfGrid         = $app.querySelector("#nbf-grid");
$nbfAlignBtns    = $app.querySelectorAll(".nbf-align-btn");
nbfApplyAlign();

// Slider vertical drag (hauteur reading zone)
if ($nbfVThumb && $nbfVTrack) {
  const onVDown = (e) => {
    nbfVDragging = true;
    nbfVDragStartY = e.clientY;
    nbfVDragStartPct = nbfRzTopPct;
    e.preventDefault();
    e.stopPropagation();
    $nbfVThumb.setPointerCapture(e.pointerId);
  };
  const onVMove = (e) => {
    if (!nbfVDragging) return;
    e.preventDefault();
    e.stopPropagation();
    const dy = e.clientY - nbfVDragStartY;
    nbfRzTopPct = Math.max(0.01, Math.min(0.85, nbfVDragStartPct + dy / window.innerHeight));
const pct = 1 - ((nbfRzTopPct - 0.01) / 0.84);
    $nbfVThumb.style.bottom = (pct * 100) + "%";
    nbfPositionRZ();
  };
  const onVUp = () => { nbfVDragging = false; };
  $nbfVThumb.addEventListener("pointerdown", onVDown);
  $nbfVThumb.addEventListener("pointermove", onVMove);
  $nbfVThumb.addEventListener("pointerup", onVUp);
  $nbfVTrack.addEventListener("pointerdown", onVDown);
  $nbfVTrack.addEventListener("pointermove", onVMove);
  $nbfVTrack.addEventListener("pointerup", onVUp);
}

// Slider horizontal largeur (centré)
$focusWidthRange?.addEventListener("input", (e) => {
  textWidthPercent = Number(e.target.value) || 75;
  nbfApplyWidth();
});

// Boutons +/- vitesse
$app.querySelector('[data-action="speed-minus"]')?.addEventListener("click", () => {
  nbfSpeed = Math.max(5, nbfSpeed - 5);
  if ($nbfSpeedVal) $nbfSpeedVal.textContent = nbfSpeed;
  dispatch({ type: "EV_SET_SCROLL_SPEED", value: nbfSpeed });
  saveSettings({ scrollSpeed: nbfSpeed, fontSize: nbfFontSize, fontWeight: nbfWeightList[nbfWeightIdx], thresholdRms: nbfRmsList[nbfRmsIdx], silenceDelayMs: nbfSilDelay });
});
$app.querySelector('[data-action="speed-plus"]')?.addEventListener("click", () => {
  nbfSpeed = Math.min(200, nbfSpeed + 5);
  if ($nbfSpeedVal) $nbfSpeedVal.textContent = nbfSpeed;
  dispatch({ type: "EV_SET_SCROLL_SPEED", value: nbfSpeed });
  saveSettings({ scrollSpeed: nbfSpeed, fontSize: nbfFontSize, fontWeight: nbfWeightList[nbfWeightIdx], thresholdRms: nbfRmsList[nbfRmsIdx], silenceDelayMs: nbfSilDelay });
});

// Boutons +/- seuil micro
$app.querySelector('[data-action="rms-minus"]')?.addEventListener("click", () => {
  nbfRmsIdx = Math.max(0, nbfRmsIdx - 1);
  if ($nbfRmsVal) $nbfRmsVal.textContent = nbfRmsList[nbfRmsIdx].toFixed(3);
  dispatch({ type: "EV_SET_THRESHOLD_RMS", value: nbfRmsList[nbfRmsIdx] });
  saveSettings({ scrollSpeed: nbfSpeed, fontSize: nbfFontSize, fontWeight: nbfWeightList[nbfWeightIdx], thresholdRms: nbfRmsList[nbfRmsIdx], silenceDelayMs: nbfSilDelay });
});
$app.querySelector('[data-action="rms-plus"]')?.addEventListener("click", () => {
  nbfRmsIdx = Math.min(nbfRmsList.length - 1, nbfRmsIdx + 1);
  if ($nbfRmsVal) $nbfRmsVal.textContent = nbfRmsList[nbfRmsIdx].toFixed(3);
  dispatch({ type: "EV_SET_THRESHOLD_RMS", value: nbfRmsList[nbfRmsIdx] });
  saveSettings({ scrollSpeed: nbfSpeed, fontSize: nbfFontSize, fontWeight: nbfWeightList[nbfWeightIdx], thresholdRms: nbfRmsList[nbfRmsIdx], silenceDelayMs: nbfSilDelay });
});

// Paramètres avancés — boutons +/-
$app.querySelectorAll(".nbf-adv-pm").forEach(btn => {
  btn.addEventListener("click", () => {
    const k = btn.dataset.k;
    const dir = parseInt(btn.dataset.dir) || 1;
    if (k === "EV_SET_FONT_SIZE") {
      nbfFontSize = Math.max(12, Math.min(48, nbfFontSize + dir * 2));
      if ($nbfAdvFontVal) $nbfAdvFontVal.textContent = nbfFontSize + "px";
      dispatch({ type: k, value: nbfFontSize });
    } else if (k === "EV_SET_FONT_WEIGHT") {
      nbfWeightIdx = Math.max(0, Math.min(nbfWeightList.length - 1, nbfWeightIdx + dir));
      if ($nbfAdvWeightVal) $nbfAdvWeightVal.textContent = nbfWeightList[nbfWeightIdx];
      dispatch({ type: k, value: nbfWeightList[nbfWeightIdx] });
    } else if (k === "EV_SET_SILENCE_DELAY") {
      nbfSilDelay = Math.max(100, Math.min(3000, nbfSilDelay + dir * 50));
      if ($nbfAdvSilVal) $nbfAdvSilVal.textContent = nbfSilDelay + "ms";
      dispatch({ type: k, value: nbfSilDelay });
    }
    saveSettings({ scrollSpeed: nbfSpeed, fontSize: nbfFontSize, fontWeight: nbfWeightList[nbfWeightIdx], thresholdRms: nbfRmsList[nbfRmsIdx], silenceDelayMs: nbfSilDelay });
  });
});

// Fermer paramètres avancés
$app.querySelector('[data-action="focus-adv-close"]')?.addEventListener("click", () => {
  if ($nbfAdvOverlay) $nbfAdvOverlay.classList.remove("nbf-adv-open");
});

// Boutons alignement texte
$app.querySelectorAll(".nbf-align-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    nbfTextAlign = btn.dataset.align || "center";
    nbfApplyAlign();
  });
});

// Toggle grille des tiers
$app.querySelector('[data-action="focus-grid"]')?.addEventListener("click", () => {
  nbfToggleGrid();
});

// Init position RZ après mount
requestAnimationFrame(nbfPositionRZ);
// Connecter les fonctions timer et UI aux hooks REC
window.__nbfStartTimer = () => { nbfStartTimer(); nbfUpdateRecPause(); };
window.__nbfPauseTimer = () => { nbfPauseTimer(); nbfUpdateRecPause(); };
window.__nbfStopTimer  = () => { nbfStopTimer();  nbfUpdateRecPause(); };
window.__nbfMicState   = $nbfMicState;
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

  // Audio optional: record without audio if mic stream not ready
  if (!audioTracks.length) {
    console.warn("Recorder: aucune piste audio — enregistrement vidéo seul.");
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
    if (!camera) {
      console.error("REC: camera module non initialisé.");
      return;
    }

    // Start camera if not already streaming
    const camState = camera.getState?.();
    if (!camState?.hasStream) {
      try {
        await camera.start();
      } catch (err) {
        console.error("REC: échec démarrage caméra:", err);
        return;
      }
    }

    const recState = recorder.getState();

    if (recState === "IDLE") {
      let mixedStream;
      try {
        mixedStream = buildRecordingStream();
      } catch (err) {
        console.error("REC: impossible de construire le stream:", err);
        return;
      }
      recorder.start(mixedStream);
      recStartedAt = Date.now();
      recPausedAccumMs = 0;
      recPauseStartedAt = 0;
      window.__nbfStartTimer?.();
      // Lance aussi le prompt si pas déjà en cours
      if (lastPromptState !== "S9_FOCUS_RUNNING") {
        dispatch({ type: EVENTS.START_FOCUS });
      }
    } else if (recState === "RECORDING") {
      recorder.pause();
      recPauseStartedAt = Date.now();
      window.__nbfPauseTimer?.();
      dispatch({ type: EVENTS.PAUSE_MANUAL });
    } else if (recState === "PAUSED") {
      recorder.resume();
      if (recPauseStartedAt > 0) {
        recPausedAccumMs += Date.now() - recPauseStartedAt;
      }
      recPauseStartedAt = 0;
      window.__nbfStartTimer?.();
      dispatch({ type: EVENTS.RESUME });
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
      window.__nbfStopTimer?.();
      updateRecButton();
      return null;
    }

    const result = await recorder.stop();
    recStartedAt = 0;
    recPausedAccumMs = 0;
    recPauseStartedAt = 0;
    window.__nbfStopTimer?.();
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
  dispatch({ type: EVENTS.PAUSE_MANUAL });
  const advEl = $app.querySelector("#nbf-adv-overlay");
  if (advEl) advEl.classList.toggle("nbf-adv-open");
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
    nbfPositionRZ();
    if ($focusTextInner) {
      nbfApplyWidth();
      $focusTextInner.style.left = "0";
      $focusTextInner.style.right = "0";
    }
    
        // Live typography (UI only): override CSS clamp via inline styles
    if (typeof renderState.fontSize === "number") $focusTextInner.style.fontSize = `${renderState.fontSize}px`;
    if (typeof renderState.fontWeight === "number") $focusTextInner.style.fontWeight = `${renderState.fontWeight}`;
    if (nbfMicCtx && $nbfMicCanvas) {
      const lvl = typeof renderState.audioLevel === "number" ? renderState.audioLevel : 0;
      const w = 160;
      const h = 24;
      $nbfMicCanvas.width = w;
      $nbfMicCanvas.height = h;
      nbfMicCtx.clearRect(0, 0, w, h);
      const micColor = lvl > 0.75 ? "#f87171" : lvl > 0.45 ? "#fbbf24" : "#4ade80";
      const amp = lvl * (h / 2 - 2);
      const now = performance.now() / 1000;
      nbfMicCtx.beginPath();
      nbfMicCtx.strokeStyle = micColor;
      nbfMicCtx.lineWidth = 1.5;
      nbfMicCtx.globalAlpha = lvl < 0.05 ? 0.25 : 0.85;
      for (let x = 0; x <= w; x++) {
        const freq = 0.08 + lvl * 0.12;
        const y = h / 2 + Math.sin(x * freq + now * 4) * amp * Math.sin(x * 0.035 + 0.5);
        if (x === 0) nbfMicCtx.moveTo(x, y);
        else nbfMicCtx.lineTo(x, y);
      }
      nbfMicCtx.stroke();
      nbfMicCtx.globalAlpha = 1;
    }
    if ($micMeterFill) $micMeterFill.style.width = `${Math.max(4, Math.min(100, Math.round(((typeof renderState.audioLevel === "number" ? renderState.audioLevel : 0) * 100))))}%`;
        if ($micStatus) $micStatus.textContent = "Micro détecté";
    // Nouvelle UI focus
    nbfSetStatus(renderState.state, renderState.pauseReason);
    nbfUpdatePrompt(renderState.state);
    nbfUpdateRecPause();
    // Mic state label
    if (window.__nbfMicState) {
      const lvl = typeof renderState.audioLevel === "number" ? renderState.audioLevel : 0;
      window.__nbfMicState.textContent = isFocus ? (lvl > 0.15 ? "actif" : "silence") : "—";
    }
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

      /* ============ FOCUS OVERLAY — nouveau design ============ */
      .nbp-focus{
        position: fixed;
        inset: 0;
        background: #040406;
        display:none;
        z-index: 9999;
        overflow: hidden;
      }
      .nbp-focus.is-on{
        display:block;
        animation: nbp-focus-in 0.25s ease both;
      }
      @keyframes nbp-focus-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      /* --- TOPBAR FOCUS --- */
      .nbf-topbar{
        position:absolute;top:0;left:0;right:0;height:52px;z-index:30;
        display:flex;align-items:center;justify-content:space-between;padding:0 14px;
        background:linear-gradient(to bottom,rgba(0,0,0,0.65),transparent);
      }
      .nbf-pill{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.12);border-radius:20px;padding:4px 10px;}
      .nbf-pill-dot{width:6px;height:6px;border-radius:50%;background:#555;transition:background .3s;}
      .nbf-pill-dot.speaking{background:#4ade80;animation:nbf-blink .9s ease-in-out infinite;}
      .nbf-pill-dot.paused{background:#f59e0b;animation:none;}
      @keyframes nbf-blink{0%,100%{opacity:1}50%{opacity:.2}}
      .nbf-pill-txt{font-size:10px;color:rgba(255,255,255,0.72);font-family:var(--nbp-font-mono);letter-spacing:.04em;}
      .nbf-rec-timer{display:flex;align-items:center;gap:6px;opacity:0;transition:opacity .25s;font-family:var(--nbp-font-mono);font-size:13px;color:rgba(255,255,255,0.88);font-weight:500;letter-spacing:.08em;}
      .nbf-rec-timer-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:nbf-recdot .9s ease-in-out infinite;animation-play-state:paused;}
      @keyframes nbf-recdot{0%,100%{opacity:1}50%{opacity:.15}}
      .nbf-topbar-right{display:flex;gap:8px;}
      .nbf-ico{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,0.65);transition:background .15s;}
      .nbf-ico:hover{background:rgba(255,255,255,0.14);}
      .nbf-ico svg{width:14px;height:14px;stroke:currentColor;}
      .nbf-ico.nbf-adv-ico-open{background:rgba(139,92,246,0.22);border-color:rgba(139,92,246,0.42);color:#a78bfa;}
      .nbf-ico.nbf-ico-on{background:rgba(255,255,255,0.18);border-color:rgba(255,255,255,0.32);color:#fff;}

      /* --- GROUPE ALIGNEMENT --- */
      .nbf-align-group{display:flex;gap:3px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:20px;padding:3px;}
      .nbf-align-btn{background:transparent;border:none;}
      .nbf-align-btn.nbf-align-active{background:rgba(255,255,255,0.16);color:#fff;}
      .nbf-align-btn svg{width:13px;height:13px;}

      /* --- GRILLE DES TIERS / ELLIPSE VISAGE --- */
      .nbf-grid{position:absolute;inset:0;z-index:6;pointer-events:none;display:none;}
      .nbf-grid.nbf-grid-grid{display:block;}
      .nbf-grid.nbf-grid-face{display:block;}
      /* lignes grille visibles seulement en mode grid */
      .nbf-grid-line{position:absolute;background:rgba(255,255,255,0.18);display:none;}
      .nbf-grid.nbf-grid-grid .nbf-grid-line{display:block;}
      .nbf-grid-v1{top:0;bottom:0;left:33.333%;width:0.5px;}
      .nbf-grid-v2{top:0;bottom:0;left:66.666%;width:0.5px;}
      .nbf-grid-h1{left:0;right:0;top:33.333%;height:0.5px;}
      .nbf-grid-h2{left:0;right:0;top:66.666%;height:0.5px;}
      /* ellipse visage visible seulement en mode face */
      .nbf-face-ellipse{position:absolute;inset:0;width:100%;height:100%;display:none;}
      .nbf-grid.nbf-grid-face .nbf-face-ellipse{display:block;}

      /* --- ZONE TEXTE --- */
      .nbp-focus-text{
        position:absolute;
        top:52px;left:0;right:52px;bottom:180px;
        overflow:hidden;
        display:flex;justify-content:center;
        touch-action:none;
        border:none;background:transparent;border-radius:0;
      }
      .nbp-focus-text::before,.nbp-focus-text::after{content:none;}

      /* --- READING ZONE --- */
      .nbp-reading-zone{
        position:absolute;
        left:12.5%;right:12.5%;
        height:72px;
        top:38%;
        transform:none;
        border:0.5px solid rgba(139,92,246,0.28);
        background:rgba(5,4,14,0.35);
        border-radius:0;
        box-shadow:none;
        pointer-events:none;
        z-index:2;
      }
      .nbp-reading-zone::before,.nbp-reading-zone::after{
        content:"";position:absolute;left:0;right:0;height:1px;background:rgba(139,92,246,0.45);
      }
      .nbp-reading-zone::before{top:-1px;}
      .nbp-reading-zone::after{bottom:-1px;}

      /* --- TEXTE INNER --- */
      .nbp-focus-inner{
        position:absolute;
        top:0;left:0;right:0;
        width:75%;
        margin-left:auto;margin-right:auto;
        padding:16px 0;
        white-space:pre-wrap;word-break:break-word;
        font-family:var(--nbp-font);
        font-size:24px;font-weight:600;line-height:1.6;
        color:rgba(255,255,255,0.92);
        text-shadow:0 2px 12px rgba(0,0,0,0.70);
        z-index:4;will-change:transform;
      }

      /* --- SLIDER VERTICAL HAUTEUR --- */
      .nbf-vslider-wrap{
        position:absolute;right:0;top:52px;bottom:180px;width:50px;z-index:20;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
        touch-action:none;overscroll-behavior:none;
      }
      .nbf-vslider-lbl{font-size:9px;color:rgba(255,255,255,0.28);font-family:var(--nbp-font-mono);letter-spacing:.06em;writing-mode:vertical-rl;transform:rotate(180deg);}
      .nbf-vslider-track{flex:1;width:3px;background:rgba(255,255,255,0.1);border-radius:2px;position:relative;cursor:pointer;max-height:200px;}
      .nbf-vslider-thumb{width:36px;height:36px;border-radius:50%;background:#8b5cf6;position:absolute;left:50%;transform:translate(-50%,50%);bottom:38%;cursor:grab;transition:background .15s;touch-action:none;}
      .nbf-vslider-thumb::after{content:"";position:absolute;inset:-10px;border-radius:50%;}
      .nbf-vslider-thumb:active{cursor:grabbing;background:#a78bfa;}
      .nbf-vslider-val{font-size:9px;color:rgba(255,255,255,0.35);font-family:var(--nbp-font-mono);}

      /* --- BOTTOMBAR FOCUS --- */
      .nbf-bottombar{
        position:absolute;bottom:0;left:0;right:0;z-index:25;
        padding:8px 14px 16px;
        background:linear-gradient(to top,rgba(0,0,0,0.88) 80%,transparent);
      }

      .nbf-hslider-wrap{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .nbf-hslider-lbl{font-size:9px;color:rgba(255,255,255,0.28);font-family:var(--nbp-font-mono);flex-shrink:0;}
      .nbf-hrange{flex:1;-webkit-appearance:none;appearance:none;height:20px;border-radius:10px;background:rgba(255,255,255,0.08);outline:none;cursor:pointer;accent-color:#8b5cf6;touch-action:none;}
      .nbf-hrange::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#8b5cf6;cursor:pointer;box-shadow:0 0 0 6px rgba(139,92,246,0.15);}
      .nbf-hrange::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:#8b5cf6;border:none;cursor:pointer;box-shadow:0 0 0 6px rgba(139,92,246,0.15);}
      .nbf-hslider-val{font-size:9px;color:rgba(255,255,255,0.35);font-family:var(--nbp-font-mono);min-width:28px;text-align:right;flex-shrink:0;}

      .nbf-mic-row{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
      .nbf-mic-ico{width:13px;height:13px;stroke:rgba(255,255,255,0.4);flex-shrink:0;}
      .nbf-mic-canvas{width:160px;flex:none;height:24px;border-radius:4px;background:transparent;display:block;}
      .nbf-mic-state{font-size:9px;color:rgba(255,255,255,0.3);font-family:var(--nbp-font-mono);min-width:36px;text-align:right;}

      .nbf-pm-row{display:flex;gap:8px;margin-bottom:9px;}
      .nbf-pm-block{flex:1;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:7px 8px;}
      .nbf-pm-label{font-size:9px;color:rgba(255,255,255,0.30);font-family:var(--nbp-font-mono);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px;}
      .nbf-pm-ctrl{display:flex;align-items:center;justify-content:space-between;gap:4px;}
      .nbf-pm-btn{width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.75);font-size:17px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:background .12s;flex-shrink:0;line-height:1;font-family:var(--nbp-font-mono);}
      .nbf-pm-btn:hover{background:rgba(255,255,255,0.14);}
      .nbf-pm-btn:active{background:rgba(139,92,246,0.28);}
      .nbf-pm-val{font-size:13px;color:rgba(255,255,255,0.85);font-family:var(--nbp-font-mono);text-align:center;flex:1;}

      /* --- BOUTONS PRINCIPAUX --- */
      .nbf-btn-row{display:flex;gap:8px;align-items:center;}

      .nbf-btn-prompt{
        width:82px;flex-shrink:0;height:46px;border-radius:13px;
        border:0.5px solid rgba(139,92,246,0.45);background:rgba(139,92,246,0.15);
        color:rgba(255,255,255,0.88);font-size:11px;font-family:var(--nbp-font);font-weight:600;
        cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
        transition:background .15s;line-height:1;
      }
      .nbf-btn-prompt:hover{background:rgba(139,92,246,0.26);}
      .nbf-btn-prompt.nbf-btn-prompt-on{background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.4);color:rgba(74,222,128,0.9);}
      .nbf-btn-prompt svg{width:13px;height:13px;}

      .nbf-btn-recpause{
        flex:1;height:46px;border-radius:13px;
        border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);
        color:rgba(255,255,255,0.78);font-size:12px;font-family:var(--nbp-font);font-weight:600;
        cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;
        transition:background .15s,border-color .15s;
      }
      .nbf-btn-recpause:hover{background:rgba(255,255,255,0.11);}
      .nbf-btn-recpause.nbf-btn-recpause-on{background:rgba(74,222,128,0.15);border-color:rgba(74,222,128,0.65);color:#86efac;box-shadow:0 0 0 1px rgba(74,222,128,0.2);}
      .nbf-btn-recpause.nbf-btn-recpause-paused{background:rgba(251,191,36,0.18);border-color:rgba(251,191,36,0.65);color:#fde68a;box-shadow:0 0 0 1px rgba(251,191,36,0.2);}
      .nbf-btn-recpause svg{width:14px;height:14px;}
      .nbf-rec-dot{width:8px;height:8px;border-radius:50%;background:rgba(239,68,68,0.5);flex-shrink:0;transition:background .2s;}
      .nbf-rec-dot.nbf-rec-dot-pulse{background:#4ade80;animation:nbf-recdot .8s ease-in-out infinite;}
      .nbf-rec-dot.nbf-rec-dot-paused{background:#f59e0b;animation:none;}

      .nbf-btn-stop{
        width:46px;height:46px;border-radius:13px;
        background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.09);
        display:flex;align-items:center;justify-content:center;cursor:pointer;
        transition:background .15s,border-color .15s;flex-shrink:0;color:rgba(255,255,255,0.45);
      }
      .nbf-btn-stop:hover{background:rgba(239,68,68,0.14);border-color:rgba(239,68,68,0.32);color:rgba(239,68,68,0.8);}
      .nbf-btn-stop svg{width:14px;height:14px;}

      /* --- PANNEAU AVANCÉ --- */
      .nbf-adv-overlay{
        position:absolute;inset:0;background:rgba(5,4,14,0.97);z-index:45;
        display:none;flex-direction:column;
      }
      .nbf-adv-overlay.nbf-adv-open{display:flex;}
      .nbf-adv-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:0.5px solid rgba(255,255,255,0.08);}
      .nbf-adv-title{font-size:13px;color:rgba(255,255,255,0.8);font-family:var(--nbp-font);font-weight:600;}
      .nbf-adv-close{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,0.55);}
      .nbf-adv-close svg{width:12px;height:12px;}
      .nbf-adv-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:6px;}
      .nbf-adv-section{font-size:9px;color:rgba(255,255,255,0.22);font-family:var(--nbp-font-mono);letter-spacing:.1em;text-transform:uppercase;margin-top:6px;margin-bottom:2px;padding:0 2px;}
      .nbf-adv-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.07);border-radius:10px;gap:12px;}
      .nbf-adv-lbl{font-size:12px;color:rgba(255,255,255,0.75);font-family:var(--nbp-font);}
      .nbf-adv-sub{font-size:10px;color:rgba(255,255,255,0.28);font-family:var(--nbp-font-mono);}
      .nbf-adv-ctrl{display:flex;align-items:center;gap:6px;flex-shrink:0;}
      .nbf-adv-pm{width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:background .12s;line-height:1;font-family:var(--nbp-font-mono);}
      .nbf-adv-pm:hover{background:rgba(139,92,246,0.22);}
      .nbf-adv-pval{font-size:12px;color:rgba(255,255,255,0.8);font-family:var(--nbp-font-mono);min-width:52px;text-align:center;}

      /* Masquer les anciens éléments focus inutilisés */
      .nbp-focus-top,.nbp-focus-bottom,.nbp-zone-slider-rail,
      .nbp-focus-hint,.nbp-focus-rec-status,.nbp-advanced,
      .nbp-rule-of-thirds,.nbp-text-width,.nbp-reading-zone-control{display:none!important;}

      /* Export modal reste inchangé */
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

/* ============================================================
   UI livré — shell indépendant.
   ============================================================ */
