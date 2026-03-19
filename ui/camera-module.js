// ui/camera-module.js — UI ONLY (DOM + getUserMedia allowed)
// Export STRICT: createCameraModule

export function createCameraModule(focusOverlayEl) {
  let stream = null;
  const wrap = document.createElement("div");
  wrap.className = "nbp-cam";
  wrap.style.cssText = "position:absolute;inset:0;z-index:0;overflow:hidden;";
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.style.cssText = "width:100%;height:100%;object-fit:cover;transform:scaleX(-1);";
  wrap.appendChild(video);
  focusOverlayEl.prepend(wrap);

  async function start() {
    if (stream || !navigator?.mediaDevices?.getUserMedia) return;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream;
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

  function getState() {
    return {
      isActive: !!stream,
      hasStream: !!stream
    };
  }

  return { start, stop, getStream, getState };
}


