// /prompteur/audio.js
(() => {
  let audioCtx = null;
  let analyser = null;
  let data = null;
  let rafId = 0;

  let threshold = 0.02;
  let silenceMs = 650;

  let isSpeaking = false;
  let lastAbove = 0;
  let running = false;

  function emit(state){
    window.dispatchEvent(new CustomEvent("speakingchange", { detail: { isSpeaking: state }}));
  }

  function setParams(next){
    if (typeof next.threshold === "number") threshold = next.threshold;
    if (typeof next.silenceMs === "number") silenceMs = next.silenceMs;
  }

  async function startAudioMonitor(){
    if (running) return;
    running = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    src.connect(analyser);

    data = new Float32Array(analyser.fftSize);
    lastAbove = performance.now();
    isSpeaking = false;
    emit(false);

    const loop = () => {
      analyser.getFloatTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++){
        const v = data[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);

      const now = performance.now();
      if (rms >= threshold){
        lastAbove = now;
        if (!isSpeaking){
          isSpeaking = true;
          emit(true);
        }
      } else {
        if (isSpeaking && (now - lastAbove) > silenceMs){
          isSpeaking = false;
          emit(false);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
  }

  function stopAudioMonitor(){
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (audioCtx){
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;
    data = null;
    if (isSpeaking){
      isSpeaking = false;
      emit(false);
    }
  }

  window.AudioMonitor = { startAudioMonitor, stopAudioMonitor, setParams };
})();



