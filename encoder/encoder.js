async function setupHandler ({ data }) {
  self.removeEventListener('message', setupHandler)
  if (data.event === 'start') {
    const settings = { ...data.settings };
    console.log('Starting encoder...');
    await start(settings);
    self.postMessage({ event: 'ready' })
  }
}

self.addEventListener('message', setupHandler)

async function start (settings) {
  const Module = await import('../h264/h264-mp4-encoder.js')
  const hme = await Module.default();

  const encoder = new hme.H264MP4Encoder();
  encoder.FS = hme.FS;

  const [width, height] = settings.dimensions;
  const { fps, duration, format = 'rgba', convertYUV = false } = settings;
  const channels = format === 'rgba' ? 4 : 3;
  const totalFrames = Math.round(duration * fps);

  // Must be a multiple of 2.
  encoder.width = width;
  encoder.height = height;
  encoder.quantizationParameter = 10;
  encoder.speed = 0;
  encoder.frameRate = fps;
  encoder.groupOfPictures = fps;
  encoder.debug = false;
  encoder.initialize();

  const yuvPointer = true;
  let _yuv_buffer;
  if (convertYUV && yuvPointer) _yuv_buffer = encoder.create_yuv_buffer(width, height);
  
  self.addEventListener('message', async ({ data }) => {
    if (data.event === 'encode-frame') {
      console.log('Encoding frame', data.frame + 1);
      const pixels = data.data;
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
      self.postMessage({ event: 'frame-encoded' });
    } else if (data.event === 'finalize') {
      encoder.finalize();
      const uint8Array = encoder.FS.readFile(encoder.outputFilename);
      const buf = uint8Array.buffer;
      self.postMessage({ event: 'download', data: buf }, [buf]);
      if (convertYUV && yuvPointer) encoder.free_yuv_buffer(_yuv_buffer);
      encoder.delete();
    }
  })
}