# client-mp4-test

A JS+WASM approach to fast client-side MP4 encoding (H264), that could potentially be used for long-running videos (thousands of frames). The WASM encoder is around 700KB, which is big but much smaller than ffmpeg-wasm.

See [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder) for more details and "how it works", which this repo is mostly based on top of.

The demo probably only works in Chrome at the moment.

Test Video:
Encoding 5 second MP4, 1920x1080 60FPS takes about ~21.85 seconds (~18 seconds with Chrome SIMD support). Open to suggestions on how to speed that up.

Most of the guts of this are from `h264-mp4-encoder`, thanks to Trevor Sundberg for the great work there. I've forked it to use WASM, include some faster functions, and a few other things [here](https://github.com/mattdesl/h264-mp4-encoder).

The built WASM files have been included in the `./h264` folder here, so you can drag and drop that into your projects. All the worker threading/pooling is pretty hacked together, and more of a proof of concept (see below).

## Concept

...todo...

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/client-mp4-test/blob/master/LICENSE.md) for details.
