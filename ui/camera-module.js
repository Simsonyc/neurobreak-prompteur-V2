// ui/camera-module.js — UI ONLY (DOM + getUserMedia allowed)
// Export STRICT: createCameraModule

export function createCameraModule(focusOverlayEl) {
  let stream = null;
  const wrap = document.createElement("div");
  wrap.className = "nbp-cam";
  wrap.style.cssText = "position:absolute;inset:0;z-index:0;overflow:hidden;";
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;"; // caché, sert juste de source
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
  wrap.appendChild(video);
  wrap.appendChild(canvas);
  function drawFrame() {
  if (!video.videoWidth) {
    requestAnimationFrame(drawFrame);
    return;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isLandscape) {
    canvas.width = 1280;
    canvas.height = 720;
  } else {
    canvas.width = 720;
    canvas.height = 1280;
  }

  // Cover : remplit tout le canvas, recadre si nécessaire (comme object-fit:cover)
  const scaleX = canvas.width / vw;
  const scaleY = canvas.height / vh;
  const scale = Math.max(scaleX, scaleY);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const offsetX = (canvas.width - drawW) / 2;
  const offsetY = (canvas.height - drawH) / 2;

  // Miroir horizontal (selfie)
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, canvas.width - offsetX - drawW, offsetY, drawW, drawH);
  ctx.restore();

  requestAnimationFrame(drawFrame);
}
  focusOverlayEl.prepend(wrap);

  async function start() {
    if (stream || !navigator?.mediaDevices?.getUserMedia) return;
    const constraints = {
      video: {
        facingMode: "user",
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      drawFrame();
    };
  }

  function stop() {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function getStream() {
    return stream;
  }
function getRecordingStream() {
  if (!canvas) return null;
  return canvas.captureStream(30);
}
  function getState() {
    return {
      isActive: !!stream,
      hasStream: !!stream
    };
  }

  return { start, stop, getStream, getRecordingStream, getState };
}


