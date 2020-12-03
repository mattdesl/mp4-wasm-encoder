# client-mp4-test

Fast client-side MP4 encoding demo based on [Trevor Sundberg's](https://github.com/TrevorSundberg/h264-mp4-encoder) npm library. Currently only works in Chrome due to OffscreenCanvas.

- Creates a H264-encoded MP4 video in the browser
- Can be used for long videos (thousands of frames)
- WASM dependency is ~700KB before gzip (big, but way smaller than including ffmpeg.wasm)
- Uses WASM SIMD if enabled (Chrome only; first enable "simd" in about:flags)
- Uses OffscreenCanvas to speed up rendering in a web worker (Chrome only)

A 5 second 1920x1080 60FPS MP4 takes about 10 seconds to encode with Chrome and SIMD enabled.

## How it's Fast (for a browser)

This is mostly based on Trevor Sundberg's work with [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder) (thanks!). Here, I've mostly just been exploring how to improve performance:

- Use workers and OffscreenCanvas for rendering
  - Save frames with `transferToImageBitmap()` then into a RGB buffer with WebGL
  - Convert RGB to YUV in the worker and then post that to the main encoder thread
- Uses a true WASM file, and WASM SIMD where available
- Sets Emscripten memory directly to avoid passing any array buffers to C/C++
- A few additional tweaks and new flags added to my C/C++ fork

## How it could be faster?

It's still pretty slow compared to native, some ways it could be faster/cleaner:

- Use a second worker (thread) to handle encoding, this might not speed things up much but at least will take a load off main UI thread
- Ensure that WASM version of `minih264` library is indeed taking advantage of SIMD
- Open to other ideas! Please create an issue if you think you see any ways to make it faster.

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/client-mp4-test/blob/master/LICENSE.md) for details.
