const THREE = require("three");

export const settings = {
  context: 'webgl',
}

export default function sketch ({ context, width, height, pixelRatio }) {
  // Create a renderer
  const renderer = new THREE.WebGLRenderer({
    canvas: context.canvas
  });

  // WebGL background color
  renderer.setClearColor("#000", 1);

  // Setup a camera
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(0, 0, -5);
  camera.lookAt(new THREE.Vector3());

  // Setup your scene
  const scene = new THREE.Scene();

  // Setup a geometry
  const geometry = new THREE.TorusKnotGeometry(1, 0.5, 124, 64);

  // Setup a material
  const material = new THREE.MeshStandardMaterial({
    color: "white",
  });

  const light = new THREE.PointLight('tomato', 1);
  light.position.set(3, 0, 3)
  scene.add(light)

  // Setup a mesh with geometry + material
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  return ({ playhead }) => {
    mesh.rotation.y = Math.sin(playhead * Math.PI * 2) * 0.1;

    const angle = playhead * Math.PI * 2;
    const d = 4;
    light.position.set(
      0,
      Math.sin(angle) * d,
      Math.cos(angle) * d
    )
    renderer.render(scene, camera);
  };
};
