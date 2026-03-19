/* ============================================================
   NeuroBreak™ Prompteur Selfie V2 — video-recorder.js
   Module UI isolé pour l'enregistrement vidéo via MediaRecorder.
   Responsabilités :
   - start(stream)
   - pause()
   - resume()
   - stop()
   - getState()
   - getBlob()
   - getUrl()
   - reset()
   Aucune dépendance au runtime/core/motion.
   ============================================================ */

export function createVideoRecorder(userConfig = {}) {
  const cfg = {
    mimeType: userConfig.mimeType ?? "video/webm;codecs=vp8,opus",
  };

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let recordedUrl = null;
  let currentStream = null;

  let state = "IDLE"; // IDLE | RECORDING | PAUSED

  function cleanupUrl() {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
  }

  function resolveMimeType() {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder non supporté par ce navigateur.");
    }

    if (cfg.mimeType && MediaRecorder.isTypeSupported(cfg.mimeType)) {
      return cfg.mimeType;
    }

    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
      return "video/webm;codecs=vp9,opus";
    }

    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
      return "video/webm;codecs=vp8,opus";
    }

    if (MediaRecorder.isTypeSupported("video/webm")) {
      return "video/webm";
    }

    return "";
  }

  function getState() {
    return state;
  }

  function getBlob() {
    return recordedBlob;
  }

  function getUrl() {
    return recordedUrl;
  }

  function reset() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      throw new Error("Impossible de reset pendant un enregistrement actif.");
    }

    cleanupUrl();
    recordedChunks = [];
    recordedBlob = null;
    currentStream = null;
    mediaRecorder = null;
    state = "IDLE";
  }

  function start(stream) {
    if (!stream) {
      throw new Error("Aucun MediaStream fourni au recorder.");
    }

    if (state !== "IDLE") {
      throw new Error(`Impossible de démarrer l'enregistrement depuis l'état ${state}.`);
    }

    cleanupUrl();
    recordedChunks = [];
    recordedBlob = null;
    currentStream = stream;

    const mimeType = resolveMimeType();

    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const finalType = mediaRecorder?.mimeType || mimeType || "video/webm";
      recordedBlob = new Blob(recordedChunks, { type: finalType });
      cleanupUrl();
      recordedUrl = URL.createObjectURL(recordedBlob);
      state = "IDLE";
    };

    mediaRecorder.start();
    state = "RECORDING";
  }

  function pause() {
    if (!mediaRecorder || state !== "RECORDING") {
      throw new Error("Pause impossible : aucun enregistrement actif.");
    }

    mediaRecorder.pause();
    state = "PAUSED";
  }

  function resume() {
    if (!mediaRecorder || state !== "PAUSED") {
      throw new Error("Resume impossible : le recorder n'est pas en pause.");
    }

    mediaRecorder.resume();
    state = "RECORDING";
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder) {
        reject(new Error("Stop impossible : recorder non initialisé."));
        return;
      }

      if (state === "IDLE") {
        resolve({
          blob: recordedBlob,
          url: recordedUrl,
        });
        return;
      }

      const recorderRef = mediaRecorder;

      recorderRef.onerror = (event) => {
        reject(event?.error || new Error("Erreur MediaRecorder inconnue."));
      };

      recorderRef.onstop = () => {
        const finalType = recorderRef.mimeType || "video/webm";
        recordedBlob = new Blob(recordedChunks, { type: finalType });
        cleanupUrl();
        recordedUrl = URL.createObjectURL(recordedBlob);
        state = "IDLE";

        resolve({
          blob: recordedBlob,
          url: recordedUrl,
        });
      };

      recorderRef.stop();
    });
  }

  return {
    start,
    pause,
    resume,
    stop,
    getState,
    getBlob,
    getUrl,
    reset,
  };
}
