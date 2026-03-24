/* ============================================================
   NeuroBreak™ Prompteur V2 — mp4-converter.js
   Conversion optionnelle WebM -> MP4 via ffmpeg.wasm
   - Ne touche pas au flux principal REC/WebM
   - À appeler seulement depuis la popup d'export
   ============================================================ */

let ffmpegInstance = null;
let ffmpegReady = false;
let ffmpegLoadingPromise = null;

async function loadFfmpegDeps() {
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import("../vendor/ffmpeg/ffmpeg/dist/esm/index.js"),
    import("../vendor/ffmpeg/util/dist/esm/index.js"),
  ]);

  return { FFmpeg, fetchFile };
}

async function ensureFfmpeg(onLog) {
  if (ffmpegReady && ffmpegInstance) {
    return ffmpegInstance;
  }

  if (ffmpegLoadingPromise) {
    return ffmpegLoadingPromise;
  }

  ffmpegLoadingPromise = (async () => {
    const { FFmpeg } = await loadFfmpegDeps();

    const ffmpeg = new FFmpeg();

    if (typeof onLog === "function") {
      ffmpeg.on("log", ({ message }) => {
        onLog(message);
      });
    }

    const baseURL = "/vendor/ffmpeg/core/dist/esm";

await ffmpeg.load({
  coreURL: `${baseURL}/ffmpeg-core.js`,
  wasmURL: `${baseURL}/ffmpeg-core.wasm`,
});

    ffmpegInstance = ffmpeg;
    ffmpegReady = true;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadingPromise;
  } finally {
    ffmpegLoadingPromise = null;
  }
}

function makeNames() {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    input: `input-${uid}.webm`,
    output: `output-${uid}.mp4`,
  };
}

async function safeDelete(ffmpeg, path) {
  try {
    await ffmpeg.deleteFile(path);
  } catch (_) {}
}

export function createMp4Converter(userConfig = {}) {
  const cfg = {
    defaultFileName: userConfig.defaultFileName ?? "neurobreak-export.mp4",
  };

  async function convertBlobToMp4(webmBlob, options = {}) {
    if (!(webmBlob instanceof Blob)) {
      throw new Error("mp4-converter: un Blob WebM est requis.");
    }

    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : null;
    const onLog = typeof options.onLog === "function" ? options.onLog : null;

    const ffmpeg = await ensureFfmpeg(onLog);

    const { fetchFile } = await loadFfmpegDeps();
    const { input, output } = makeNames();

    if (onProgress) onProgress({ step: "loading", ratio: 0 });

    await ffmpeg.writeFile(input, await fetchFile(webmBlob));

    if (onProgress) onProgress({ step: "converting", ratio: 0 });

    // Progress callback
    const progressHandler = ({ progress }) => {
      if (onProgress) {
        onProgress({
          step: "converting",
          ratio: Number.isFinite(progress) ? progress : 0,
        });
      }
    };

    ffmpeg.on("progress", progressHandler);

    let converted = false;
    let outputData = null;

    try {
      // Tentative 1 : export MP4 "propre" pour compatibilité maximale
      try {
        await ffmpeg.exec([
          "-i",
          input,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          output,
        ]);
        converted = true;
      } catch (firstErr) {
        // Tentative 2 : fallback plus tolérant
        if (onLog) {
          onLog("Fallback conversion MP4...");
        }

        await safeDelete(ffmpeg, output);

        await ffmpeg.exec([
          "-i",
          input,
          "-movflags",
          "+faststart",
          output,
        ]);
        converted = true;
      }

      if (!converted) {
        throw new Error("mp4-converter: conversion MP4 échouée.");
      }

      outputData = await ffmpeg.readFile(output);

      const mp4Blob = new Blob([outputData], { type: "video/mp4" });
      const mp4Url = URL.createObjectURL(mp4Blob);

      if (onProgress) onProgress({ step: "done", ratio: 1 });

      return {
        blob: mp4Blob,
        url: mp4Url,
        fileName:
          typeof options.fileName === "string" && options.fileName.trim()
            ? options.fileName.trim()
            : cfg.defaultFileName,
      };
    } finally {
      ffmpeg.off?.("progress", progressHandler);
      await safeDelete(ffmpeg, input);
      await safeDelete(ffmpeg, output);
    }
  }

  function downloadMp4(result) {
    const url = result?.url;
    if (!url) {
      throw new Error("mp4-converter: aucun URL MP4 à télécharger.");
    }

    const fileName =
      typeof result?.fileName === "string" && result.fileName.trim()
        ? result.fileName.trim()
        : cfg.defaultFileName;

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);

    try {
      a.click();
    } finally {
      a.remove();
    }
  }

  function revokeUrl(result) {
    if (result?.url) {
      try {
        URL.revokeObjectURL(result.url);
      } catch (_) {}
    }
  }

  return {
    convertBlobToMp4,
    downloadMp4,
    revokeUrl,
  };
}
