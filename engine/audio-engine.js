/* ============================================================
   NeuroBreak™ Prompteur V2 — audio-engine.js
   IA-AUDIO — Web Audio API only (RMS). No speech recognition.

   MODIFICATION:
   - Ajout GRACE PERIOD 2000ms après start()
   ============================================================ */

export function createAudioEngine(userConfig = {}) {
    const cfg = {
    thresholdRms: userConfig.thresholdRms ?? 0.07,
    silenceDelayMs: 220,
    deviceId: userConfig.deviceId ?? null,

    minSignalRms: 0.0015,
    noSignalAfterMs: 1200,

    fftSize: 2048,
    smoothingTimeConstant: 0.0,

    confidenceCeilRms: 0.08,

    gracePeriodMs: 2000, // ✅ NEW

    ...userConfig,
  };

  let audioCtx = null;
  let stream = null;
  let source = null;
  let analyser = null;

  let timeData = null;

  let started = false;
  let lastTickAt = 0;

    let lastAboveThresholdAt = 0;
  let lowSignalSinceAt = 0;
  let noSignal = true;
    let lastRms = 0;
let baselineRms = 0;
let baselineAccum = 0;
let baselineSamples = 0;
let silenceStartedAt = 0;
let lastSilenceDurationMs = 0;
let silenceCandidateAt = 0;


  // ✅ NEW — grace period
  let internalStartTime = 0;

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

  function computeRmsFromAnalyser() {
    if (!analyser || !timeData) return 0;

    analyser.getFloatTimeDomainData(timeData);

    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i];
      sumSq += v * v;
    }
    const meanSq = sumSq / timeData.length;
    const rms = Math.sqrt(meanSq);

    return Number.isFinite(rms) ? rms : 0;
  }

  function estimateLatencyMs() {
    if (!audioCtx || !analyser) return 0;

    const windowMs = (analyser.fftSize / audioCtx.sampleRate) * 1000;

    const outLatMs =
      typeof audioCtx.outputLatency === "number"
        ? audioCtx.outputLatency * 1000
        : 0;

    return Math.round(windowMs + outLatMs);
  }

  async function start() {
    if (started) return;

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("audio-engine: getUserMedia not available.");
    }

        stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        ...(cfg.deviceId ? { deviceId: { exact: cfg.deviceId } } : {}),
      },
      video: false,
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();

    if (audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch (_) {}
    }

    source = audioCtx.createMediaStreamSource(stream);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = cfg.fftSize;
    analyser.smoothingTimeConstant = cfg.smoothingTimeConstant;

    source.connect(analyser);

    timeData = new Float32Array(analyser.fftSize);

    const t = nowMs();
    lastTickAt = t;
    lastAboveThresholdAt = 0;
    lowSignalSinceAt = t;
            noSignal = true;
    lastRms = 0;
    lastAboveThresholdAt = 0;
    baselineRms = 0; baselineAccum = 0; baselineSamples = 0;

        internalStartTime = t; // ✅ NEW
silenceStartedAt = 0; lastSilenceDurationMs = 0;

    started = true;
  }

  async function stop() {
    started = false;

    try {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    } catch (_) {}

    stream = null;
    source = null;
    analyser = null;
    timeData = null;

    try {
      if (audioCtx) await audioCtx.close();
    } catch (_) {}
    audioCtx = null;

               noSignal = true;
    lastRms = 0;
    lastAboveThresholdAt = 0;
    lowSignalSinceAt = 0;
        internalStartTime = 0; // reset
    baselineRms = 0; baselineAccum = 0; baselineSamples = 0;
    silenceStartedAt = 0; lastSilenceDurationMs = 0;

baselineRms = 0; baselineAccum = 0; baselineSamples = 0;
  }

    function tick() {
    const t = nowMs();
    const dtMs = lastTickAt > 0 ? (t - lastTickAt) : 0;
    lastTickAt = t;

    if (!started || !audioCtx || !analyser) {
      return {
        isSpeaking: false,
        latencyMs: 0,
        confidence: 0,
        noSignal: true,
        hasSignal: false,
        rms: 0,
      };
    }

    // =========================================================
    // ✅ GRACE PERIOD — BLOQUE AUDIO_SPEAKING_FALSE AU DÉMARRAGE
    // =========================================================
                const inGrace = internalStartTime && (t - internalStartTime) < cfg.gracePeriodMs;
    const rms = computeRmsFromAnalyser();
    lastRms = rms;
    if (inGrace) {
      return { isSpeaking: true, latencyMs: 0, confidence: 0.5, noSignal: false, hasSignal: true, rms };
    }

    // =========================================================

        const effectiveThreshold = cfg.thresholdRms;
const above = rms >= effectiveThreshold;
if (above) {
  if (silenceStartedAt > 0) lastSilenceDurationMs = t - silenceStartedAt;
  silenceStartedAt = 0;
  silenceCandidateAt = 0;
  lastAboveThresholdAt = t;
} else {
  if (!silenceCandidateAt) {
    silenceCandidateAt = t;
  }

  if ((t - silenceCandidateAt) > cfg.silenceDelayMs) {
    if (!silenceStartedAt) silenceStartedAt = t;
  }
}

let isSpeaking;
if (above) isSpeaking = true;
else if (lastAboveThresholdAt > 0) isSpeaking = (t - lastAboveThresholdAt) <= cfg.silenceDelayMs;
else isSpeaking = false;

    noSignal = rms < cfg.minSignalRms;
    const confidence = isSpeaking ? clamp01(rms / cfg.confidenceCeilRms) : 0;

    return {
      isSpeaking,
      latencyMs: estimateLatencyMs(),
      confidence,
      noSignal,
      hasSignal: !noSignal,
            rms,
      silenceStartedAt,
      silenceDurationMs: lastSilenceDurationMs,
    };
  }

    function getStream() {
    return stream;
  }

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
        rms: lastRms,
        noSignal,
                        cfg: { ...cfg, deviceId: cfg.deviceId ?? null },
        hasOpenStream: !!stream,
                baselineRms,
        silenceStartedAt,
        lastSilenceDurationMs,
        effectiveThreshold: cfg.thresholdRms,
        audioState: audioCtx?.state || "closed",
        sampleRate: audioCtx?.sampleRate || 0,
      };
    },
  };
}

