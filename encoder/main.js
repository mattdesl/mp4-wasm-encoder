const renderer = new Worker('./encoder/renderer.js');
const encoder = new Worker('./encoder/encoder.js');

const settings = {
  duration: 5,
  fps: 60,
  format: 'rgb', // whether to grab RGB or RGBA
  convertYUV: true, // converts RGB to YUV frames
  dimensions: [1920, 1080],
};

const download = (data, filename) => {
  const url = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.click();
};

renderer.postMessage({
  event: 'start',
  settings
});
encoder.postMessage({
  event: 'start',
  settings
});

function onReady (worker) {
  return new Promise(resolve => {
    function handler ({ data }) {
      worker.removeEventListener('message', handler);
      if (data.event === 'ready') {
        resolve(data);
      }
    }
    worker.addEventListener('message', handler);
  })
}

(async () => {
  console.time('pixels')
  await Promise.all([onReady(renderer), onReady(encoder)])
  console.log('All ready')

  encoder.addEventListener('message', (evt) => {
    const { data } = evt;
    if (data.event === 'frame-encoded') {
      // console.log('Received encoder frame',evt)
      // tick();
      // renderer.postMessage({ event: 'flush' });
    } else if (data.event === 'download') {
      console.timeEnd('pixels')
      download(data.data);
    }
  });
  renderer.addEventListener('message', (evt) => {
    const { data } = evt;
    if (data.event === 'receive-next-frame') {
      // console.log('Asking for encoding..')
      // console.log('Active:', data.activeBuffers)
      encoder.postMessage({ event: 'encode-frame', data: data.data, frame: data.frame }, [ data.data.buffer ]);
    } else if (data.event === 'renderer-end') {
      encoder.postMessage({ event: 'finalize' });
    }
  })
  renderer.postMessage({ event: 'flush' });
  
  // function tick () {
  //   renderer.postMessage({
  //     event: 'get-next-frame',
  //   });
  // }
  
  // tick();
})();