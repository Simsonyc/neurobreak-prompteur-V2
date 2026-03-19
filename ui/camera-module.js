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
  video.style.cssText = "width:100%;height:100%;object-fit:cover;transform:scaleX(-1);";
  wrap.appendChild(video);
  function drawFrame() {
  if (!video.videoWidth) {
    requestAnimationFrame(drawFrame);
    return;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const targetRatio = 9 / 16;

  let cropW = vw;
  let cropH = cropW / targetRatio;

  if (cropH > vh) {
    cropH = vh;
    cropW = cropH * targetRatio;
  }

  const cropX = (vw - cropW) / 2;
  const cropY = (vh - cropH) / 2;

  canvas.width = 720;
  canvas.height = 1280;

  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

  requestAnimationFrame(drawFrame);
}
  focusOverlayEl.prepend(wrap);

  async function start() {
    if (stream || !navigator?.mediaDevices?.getUserMedia) return;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
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


