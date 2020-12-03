import { simd } from "https://unpkg.com/wasm-feature-detect?module";

const settings = {
  duration: 5,
  context: 'webgl',
  fps: 60,
  dimensions: [256, 256],
};

const download = (data, filename) => {
  const url = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download.mp4";
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 5000);
};

const show = (data) => {
  const url = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
  const video = document.createElement("video");
  video.setAttribute("muted", "muted");
  video.setAttribute("autoplay", "autoplay");
  video.setAttribute("controls", "controls");
  const min = Math.min(
    settings.dimensions[0],
    window.innerWidth,
    window.innerHeight
  );
  const aspect = settings.dimensions[0] / settings.dimensions[1];
  const size = min * 0.75;
  video.style.width = `${size}px`;
  video.style.height = `${size / aspect}px`;

  document.body.appendChild(video);
  video.src = url;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.id = 'download';
  anchor.textContent = 'Click here to download MP4 file...';
  anchor.download = "download.mp4";
  document.body.appendChild(anchor);
};

const isOffscreenSupported = (() => {
  if (typeof self.OffscreenCanvas === "undefined") return false;
  try {
    new self.OffscreenCanvas(32, 32).getContext("2d");
    return true;
  } catch (_) {
    return false;
  }
})();

const wasmSupported = (() => {
  try {
    if (
      typeof WebAssembly === "object" &&
      typeof WebAssembly.instantiate === "function"
    ) {
      const module = new WebAssembly.Module(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      );
      if (module instanceof WebAssembly.Module)
        return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
    }
  } catch (e) {}
  return false;
})();

async function createWorker(sketch) {
  // This worker setup could be better done with esbuild/bundler/etc,
  // or by just putting the sketch code into the worker
  const rendererResp = await fetch("./encoder/renderer.js");
  const rendererSrc = sketch + ";\n" + (await rendererResp.text());
  const rendererBlob = new Blob([rendererSrc], {
    type: "application/javascript",
  });
  const rendererUrl = URL.createObjectURL(rendererBlob);
  return new Worker(rendererUrl);
  // If you had it all in the renderer.js it would just look like this:
  // return new Worker("./encoder/renderer.js");
}

(async () => {
  const startButton = document.querySelector("#start");
  const resolutionSelect = document.querySelector("#resolution");
  const durationInput = document.querySelector("#duration");
  const progressText = document.querySelector("#progress");
  const settingsEl = document.querySelector("#settings");
  const sketchEl = document.querySelector("#sketch");
  if (!wasmSupported) {
    progressText.textContent =
      "No WASM support found; try again with latest Chrome or FireFox";
    return;
  }
  if (!isOffscreenSupported) {
    progressText.textContent = "No support for OffscreenCanvas on this browser";
    return;
  }

  const simdSupported = await simd();

  const format = "rgba"; // todo: support RGB on windows
  const channels = format === "rgba" ? 4 : 3;
  const convertYUV = true;
  const yuvPointer = true;
  const webgl = true;
  const bitmap = true;
  const frameQueueLimit = 5;

  console.log("Loading wasm...");
  let Module = await import(
    simdSupported
      ? "../h264/simd/h264-mp4-encoder.js"
      : "../h264/no-simd/h264-mp4-encoder.js"
  );
  const hme = await Module.default();
  const encoder = new hme.H264MP4Encoder();
  encoder.FS = hme.FS;
  console.log("Done loading wasm");

  console.log("Configuration:");
  console.log("SIMD Support?", simdSupported);
  console.log("JS YUV Conversion:", convertYUV);
  console.log("YUV Pointer Optimization:", yuvPointer);
  console.log("Bitmap Images?", bitmap);
  console.log("WebGL Pixel Grabber?", webgl);
  console.log("Pixel Format:", format);

  let currentFrame = 0;
  let totalFrames;
  let _yuv_buffer;

  onEncoderReady();

  function getDimensions() {
    const selected =
      resolutionSelect.options[resolutionSelect.selectedIndex].value;
    switch (selected) {
      case "2160p":
        return [3840, 2160];
      case "1440p":
        return [2560, 1440];
      case "1080p":
        return [1920, 1080];
      case "720p":
        return [1280, 720];
      case "360p":
        return [640, 360];
      case "240p":
        return [426, 240];
      default:
        throw new Error("invalid resolution " + selected);
    }
  }

  // Initial setup of renderer
  async function startEncoding() {
    const selectedSketch = sketchEl.options[sketchEl.selectedIndex].value;
    const sketchSrc = await (await fetch(selectedSketch)).text();
    const renderer = await createWorker(sketchSrc);

    Object.assign(settings, {
      duration: parseFloat(durationInput.value),
      dimensions: getDimensions(),
    });

    settingsEl.style.display = "none";
    console.time("encoder");

    const [width, height] = settings.dimensions;
    const { fps, duration } = settings;
    totalFrames = Math.round(duration * fps);


    console.log("Dimensions: %d x %d", width, height);
    console.log("FPS:", fps);
    console.log("Total Frames:", totalFrames);

    // Must be a multiple of 2.
    encoder.width = width;
    encoder.height = height;
    encoder.quantizationParameter = 10;
    encoder.speed = 10; // adjust to taste
    encoder.frameRate = fps;
    // encoder.groupOfPictures = fps; // adjust to taste
    encoder.debug = false;
    encoder.initialize();

    if (convertYUV && yuvPointer) {
      _yuv_buffer = encoder.create_yuv_buffer(encoder.width, encoder.height);
    }

    renderer.addEventListener("message", ({ data }) => {
      if (typeof data === "string" && data === "finish") {
        finalize();
      } else {
        // console.log('Encoding frame %d / %d', currentFrame + 1, totalFrames);
        progressText.textContent = `Encoding frame ${
          currentFrame + 1
        } / ${totalFrames}`;
        addFrame(data, channels);
        renderer.postMessage("frame");
      }
    });

    renderer.postMessage({
      event: "setup",
      settings,
      config: {
        frameQueueLimit,
        format,
        convertYUV,
        bitmap,
        webgl,
      },
    });
  }

  function addFrame(pixels) {
    if (convertYUV) {
      if (yuvPointer) {
        hme.HEAP8.set(pixels, _yuv_buffer);
        encoder.fast_encode_yuv(_yuv_buffer);
      } else {
        encoder.addFrameYuv(pixels);
      }
    } else {
      if (channels === 4) encoder.addFrameRgba(pixels);
      else encoder.addFrameRgb(pixels);
    }
    currentFrame++;
  }

  function finalize() {
    encoder.finalize();
    const uint8Array = encoder.FS.readFile(encoder.outputFilename);
    const buf = uint8Array.buffer;
    show(buf);
    progressText.textContent = "Finished Encoding";
    if (convertYUV && yuvPointer) encoder.free_yuv_buffer(_yuv_buffer);
    encoder.delete();
    console.timeEnd("encoder");
  }

  function onEncoderReady() {
    startButton.style.display = "";
    settingsEl.style.display = "";
    progressText.textContent =
      "Choose video settings, then click Start to encode an MP4.";

    startButton.addEventListener("click", () => {
      startButton.style.display = "none";
      startEncoding();
    });
  }
})();
