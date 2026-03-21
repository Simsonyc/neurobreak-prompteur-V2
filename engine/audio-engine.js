/* ============================================================
   NeuroBreak™ Prompteur V2 — audio-engine.js
   IA-AUDIO — Web Audio API only (RMS). No speech recognition.

   V2.1 — Logique détection alignée sur prompteur miroir :
   - Un seul timer (lastAboveThresholdAt)
   - smoothingTimeConstant: 0.8 (lissage natif WebAudio)
   - autoGainControl: true (compense distance micro)
   - thresholdRms: 0.02 (stable sous les creux naturels)
   - silenceDelayMs: 650ms (confortable, sans oscillation)
   - Grace period conservée (utile au démarrage)
   - silenceDurationMs exposée pour motion-engine catchup
   ============================================================ */

export function createAudioEngine(userConfig = {}) {
  const cfg = {
    thresholdRms:          userConfig.thresholdRms   ?? 0.02,
    silenceDelayMs:        userConfig.silenceDelayMs ?? 650,
    deviceId:              userConfig.deviceId       ?? null,

    minSignalRms:          0.0015,
    fftSize:               2048,
    smoothingTimeConstant: 0.8,    // lissage WebAudio natif — clé de la stabilité
    confidenceCeilRms:     0.08,
    gracePeriodMs:         2000,

    ...userConfig,
  };

  let audioCtx  = null;
  let stream    = null;
  let source    = null;
  let analyser  = null;
  let timeData  = null;

  let started   = false;
  let lastTickAt = 0;

  // ── Un seul timer, comme le miroir ──────────────────────────
  let lastAboveThresholdAt = 0;   // dernière frame où rms >= threshold
  let isSpeaking           = false;
  let silenceStartedAt     = 0;   // début du silence en cours
  let lastSilenceDurationMs = 0;  // durée du dernier silence (→ motion catchup)

  let noSignal  = true;
  let lastRms   = 0;

  // Grace period
  let internalStartTime = 0;

  /* ── utils ─────────────────────────────────────────────── */
  function nowMs() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now()
      : Date.now();
  }

  function clamp01(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x;
  }

  function computeRms() {
    if (!analyser || !timeData) return 0;
    analyser.getFloatTimeDomainData(timeData);
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / timeData.length);
    return Number.isFinite(rms) ? rms : 0;
  }

  function estimateLatencyMs() {
    if (!audioCtx || !analyser) return 0;
    const windowMs = (analyser.fftSize / audioCtx.sampleRate) * 1000;
    const outLatMs = typeof audioCtx.outputLatency === "number"
      ? audioCtx.outputLatency * 1000 : 0;
    return Math.round(windowMs + outLatMs);
  }

  /* ── start ─────────────────────────────────────────────── */
  async function start() {
    if (started) return;

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("audio-engine: getUserMedia not available.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation:  true,
        noiseSuppression:  true,
        autoGainControl:   true,   // compense les variations d'amplitude
        ...(cfg.deviceId ? { deviceId: { exact: cfg.deviceId } } : {}),
      },
      video: false,
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch (_) {}
    }

    source   = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize               = cfg.fftSize;
    analyser.smoothingTimeConstant = cfg.smoothingTimeConstant;
    source.connect(analyser);

    timeData = new Float32Array(analyser.fftSize);

    const t = nowMs();
    lastTickAt            = t;
    lastAboveThresholdAt  = t;   // on initialise "comme si" on parlait
    isSpeaking            = false;
    silenceStartedAt      = 0;
    lastSilenceDurationMs = 0;
    noSignal              = true;
    lastRms               = 0;
    internalStartTime     = t;
    started               = true;
  }

  /* ── stop ──────────────────────────────────────────────── */
  async function stop() {
    started = false;

    try {
      if (stream) stream.getTracks().forEach(t => t.stop());
    } catch (_) {}

    stream = null; source = null; analyser = null; timeData = null;

    try { if (audioCtx) await audioCtx.close(); } catch (_) {}
    audioCtx = null;

    lastAboveThresholdAt  = 0;
    isSpeaking            = false;
    silenceStartedAt      = 0;
    lastSilenceDurationMs = 0;
    noSignal              = true;
    lastRms               = 0;
    internalStartTime     = 0;
    lastTickAt            = 0;
  }

  /* ── tick ──────────────────────────────────────────────── */
  function tick() {
    const t = nowMs();
    lastTickAt = t;

    if (!started || !audioCtx || !analyser) {
      return { isSpeaking: false, latencyMs: 0, confidence: 0,
               noSignal: true, hasSignal: false, rms: 0 };
    }

    // Grace period — on renvoie speaking:true le temps que le micro chauffe
    const inGrace = internalStartTime && (t - internalStartTime) < cfg.gracePeriodMs;
    const rms = computeRms();
    lastRms = rms;

    if (inGrace) {
      return { isSpeaking: true, latencyMs: 0, confidence: 0.5,
               noSignal: false, hasSignal: true, rms };
    }

    // ── Logique miroir : un seul timer ───────────────────────
    if (rms >= cfg.thresholdRms) {
      // Signal détecté
      if (!isSpeaking) {
        // Reprise — on calcule la durée du silence qui vient de finir
        if (silenceStartedAt > 0) {
          lastSilenceDurationMs = t - silenceStartedAt;
        }
        silenceStartedAt = 0;
        isSpeaking = true;
      }
      lastAboveThresholdAt = t;
    } else {
      // Silence — on attend silenceDelayMs avant de basculer
      if (isSpeaking && (t - lastAboveThresholdAt) > cfg.silenceDelayMs) {
        silenceStartedAt = lastAboveThresholdAt + cfg.silenceDelayMs; // début réel du silence
        isSpeaking = false;
      }
    }

    noSignal = rms < cfg.minSignalRms;
    const confidence = isSpeaking ? clamp01(rms / cfg.confidenceCeilRms) : 0;

    return {
      isSpeaking,
      latencyMs:          estimateLatencyMs(),
      confidence,
      noSignal,
      hasSignal:          !noSignal,
      rms,
      silenceStartedAt:   isSpeaking ? 0 : silenceStartedAt,
      silenceDurationMs:  lastSilenceDurationMs,
    };
  }

  /* ── API publique ──────────────────────────────────────── */
  function getStream() { return stream; }

  return {
    start,
    stop,
    tick,
    getStream,
    configure(next = {}) {
      Object.assign(cfg, next);
    },
    getDebug() {
      return {
        started,
        rms:                  lastRms,
        noSignal,
        isSpeaking,
        lastAboveThresholdAt,
        silenceStartedAt,
        lastSilenceDurationMs,
        effectiveThreshold:   cfg.thresholdRms,
        effectiveSilenceMs:   cfg.silenceDelayMs,
        audioState:           audioCtx?.state || "closed",
        sampleRate:           audioCtx?.sampleRate || 0,
        cfg: { ...cfg, deviceId: cfg.deviceId ?? null },
      };
    },
  };
}
