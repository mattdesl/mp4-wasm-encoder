// one worker which steps forward, renders frames,
// and pushes RGB or RGBA into a (limited size) queue of buffers

async function setupHandler ({ data }) {
  self.removeEventListener('message', setupHandler)
  if (data.event === 'start') {
    const settings = { ...data.settings };
    console.log('Starting renderer...');
    console.time('render')
    await start(settings);
  }
}

self.addEventListener('message', setupHandler)

const isDocument = () => {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

function createCanvas(width, height, useOffscreen = true) {
  const doc = isDocument();
  if (useOffscreen || !doc) return new OffscreenCanvas(width, height);
  else if (doc) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
}

function pixelGrabber (canvas, opts = {}) {
  const { format = 'rgba', useOffscreen = true } = opts;
  const { width, height } = canvas;

  const useGL = true;
  const useBitmap = true;
  const usingBitmap =
    useBitmap && typeof canvas.transferToImageBitmap === "function";

  const webgl = createCanvas(width, height, useOffscreen);
  const gl = webgl.getContext("webgl");
  const texture = gl.createTexture();
  const glFormat = format === 'rgba' ? gl.RGBA : gl.RGB;
  const glInternalFormat = glFormat;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(
    gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
    gl.BROWSER_DEFAULT_WEBGL
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  const channels = glFormat === gl.RGB ? 3 : 4;
  const bufferSize = width * height * channels;

  return {
    bufferSize,
    read () {
      if (useGL) {
        const output = new Uint8Array(bufferSize);
        let input;
        if (usingBitmap) {
          input = canvas.transferToImageBitmap();
        } else {
          input = canvas;
        }
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          glInternalFormat,
          glFormat,
          gl.UNSIGNED_BYTE,
          input
        );
        gl.readPixels(0, 0, width, height, glFormat, gl.UNSIGNED_BYTE, output);
        if (usingBitmap) input.close();
        return output;
      } else {
        return context.getImageData(0, 0, width, height).data;
      }
    }
  }
}

async function start (settings) {
  const { sketch } = await import('./sketch.js');

  const [width, height] = settings.dimensions;
  const { fps, duration, format = 'rgba', convertYUV = false, maxBuffers = 4 } = settings;
  const totalFrames = Math.round(duration * fps);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  
  const props = {
    canvas,
    context,
    width,
    height,
    fps,
    duration,
    totalFrames,
    frame: 0,
    time: 0,
    playhead: 0,
    deltaTime: 0,
    exporting: false,
  };

  const fpsInterval = 1 / props.fps;
  const render = sketch(props);

  let frame = 0;
  let queue = [];
  const reader = pixelGrabber(canvas, { format });

  let finished = false;
  const activeBuffers = [];
  const sharedBuffer = new Uint8Array(width * height * 3 / 2);

  let isRequestingFrame = false;
  self.addEventListener('message', ({ data }) => {
    if (data.event === 'flush') {
      // console.log('Requesting frame')
      // if (isRequestingFrame) throw new Error('wtf! already requesting frame')
      // isRequestingFrame = true;
      // pop(); // try to pop here but it might fail if we are waiting on a push
      // flush();
    }
  })

  let loop = setInterval(push, 0);
  self.postMessage({ event: 'ready' })
  push();
  // flush();

  // TODO:
  // have a big buffer that holds multiple YUV frames
  // post them all at once to the encoder, and let it run through
  // each in C++ land ?

  function pop () {
    if (isRequestingFrame && activeBuffers.length > 0) {
      isRequestingFrame = false;
      const frame = activeBuffers.shift()
      if (frame.end) {
        // console.log('Finished rendering all frames');
        self.postMessage({ event: 'renderer-end' });
      } else {
        self.postMessage({ activeBuffers: activeBuffers.length, data: frame.data, frame: frame.frame, event: 'receive-next-frame' }, [ frame.data.buffer ]);
      }
    }
  }

  function push () {
    // we still have more space to fill our active buffers
    if (!finished && activeBuffers.length < maxBuffers) {
      const curFrame = frame;
      const done = renderFrame();
      let evtFrame;
      if (done) {
        console.timeEnd('render')
        finished = true;
        clearInterval(loop);
        evtFrame = { end: true };
      } else {
        const next = reader.read();
        evtFrame = { frame: curFrame, data: next };
      }
      activeBuffers.push(evtFrame);
    }
    flush();
  }

  function flush () {
    if (!activeBuffers.length) return;
    const evtFrame = activeBuffers.shift();
    if (evtFrame.end) {
      // console.log('Finished rendering all frames');
      self.postMessage({ event: 'renderer-end' });
    } else {
      const pixels = format === 'rgb' && convertYUV ? RGB2YUV420p(evtFrame.data, width, height) : evtFrame.data;
      self.postMessage({ data: pixels, frame: evtFrame.frame, event: 'receive-next-frame' }, [ pixels.buffer ]);
    }
  }

  function RGB2YUV420p (rgb, width, height, buffer) {
    const image_size = width * height;
    let upos = image_size;
    let vpos = upos + upos / 4;
    let i = 0;
    if (!buffer) buffer = new Uint8Array(width * height * 3 / 2);

    for (let line = 0; line < height; ++line)
    {
      if (!(line % 2))
      {
        for (let x = 0; x < width; x += 2)
        {
          let r = rgb[3 * i];
          let g = rgb[3 * i + 1];
          let b = rgb[3 * i + 2];

          buffer[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;

          buffer[upos++] = ((-38 * r + -74 * g + 112 * b) >> 8) + 128;
          buffer[vpos++] = ((112 * r + -94 * g + -18 * b) >> 8) + 128;

          r = rgb[3 * i];
          g = rgb[3 * i + 1];
          b = rgb[3 * i + 2];

          buffer[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;
        }
      }
      else
      {
        for (let x = 0; x < width; x += 1)
        {
          let r = rgb[3 * i];
          let g = rgb[3 * i + 1];
          let b = rgb[3 * i + 2];

          buffer[i++] = ((66 * r + 129 * g + 25 * b) >> 8) + 16;
        }
      }
    }
    return buffer;
  }

  function renderFrame() {
    if (frame >= totalFrames) {
      return true;
    }
    Object.assign(props, {
      deltaTime: frame === 0 ? 0 : fpsInterval,
      playhead: frame / totalFrames,
      frame,
      exporting: true,
      time: frame * fpsInterval,
    });
    console.log("Rendering frame %d / %d", frame + 1, totalFrames);
    render(props);
    frame++;
    return false;
  }
}
