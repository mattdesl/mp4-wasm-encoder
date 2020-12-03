import sketch, { settings } from './sketch.js';

const canvasSketch = require("canvas-sketch");

canvasSketch(sketch, {
  animate: true,
  duration: 5,
  dimensions: [ 1280, 720 ],
  ...settings,
});