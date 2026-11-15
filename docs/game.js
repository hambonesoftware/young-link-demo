import {
  ACESFilmicToneMapping, AnimationMixer, BackSide, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, Fog, GLTFLoader, Group, HemisphereLight, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, Object3D, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial, SkinnedMesh, SphereGeometry,
  SRGBColorSpace, Vector3, WebGLRenderer
} from './assets/engine.js';

const stage = document.querySelector('#world');
const status = document.querySelector('#status');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const turn = (value, target, rate, dt) => {
  const delta = target - value;
  return value + Math.atan2(Math.sin(delta), Math.cos(delta)) * (1 - Math.exp(-rate * dt));
};

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(705);
  ctx.fillStyle = '#84796c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 23000; i++) {
    const tone = Math.round(90 + random() * 110);
    ctx.fillStyle = `rgb(${tone},${tone - 7},${tone - 13})`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2.4, 1 + random());
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 35);
  return texture;
}

function roadside(scene) {
  const random = seededRandom(2026);
  const material = (color, more) => new MeshStandardMaterial({color, roughness: .89, ...more});
  const box = new BoxGeometry(1, 1, 1);
  const place = (geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, cast = false) => {
    const object = new Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.receiveShadow = true;
    object.castShadow = cast;
    scene.add(object);
    return object;
  };
  const soil = material('#7f7750');
  place(box, soil, 0, -.205, 0, 176, .4, 176);
  const road = place(new PlaneGeometry(9.8, 110), material('#c3b29b', {map: groundTexture()}),
    0, .003, -13);
  road.rotation.x = -Math.PI / 2;
  const markings = material('#caad6a');
  for (let i = -5; i <= 18; i++) place(box, markings, 0, .006, -3.6 * i, .088, .009, 1.85);
  const shoulder = material('#a38d64');
  for (const sign of [-1, 1]) place(box, shoulder, sign * 5.25, -.05, -13, .68, .106, 110);

  const hills = new SphereGeometry(1, 24, 12);
  const hillMats = ['#777a4d', '#8b8658', '#58644f', '#8a876c'].map(c => material(c));
  for (let i = 0; i < 39; i++) {
    const angle = i / 39 * Math.PI * 2;
    const radius = 48 + random() * 27;
    place(hills, hillMats[i % hillMats.length], Math.cos(angle) * radius, -2.2, Math.sin(angle) * radius,
      6 + random() * 16, 3 + random() * 6, 5 + random() * 10);
  }

  const blade = new ConeGeometry(.095, .42, 3);
  const tufts = new InstancedMesh(blade, material('#ffffff'), 3100);
  const dummy = new Object3D();
  const tint = new Color();
  const palette = ['#887948', '#a79354', '#5d6a4a', '#ac9c60', '#777d4d'];
  for (let i = 0; i < tufts.count; i++) {
    const side = i % 2 ? 1 : -1;
    const scale = .32 + random() * 1.15;
    dummy.position.set(side * (5.48 + random() ** 1.4 * 15), .15 * scale, -52 + random() * 79);
    dummy.rotation.set((random() - .5) * .56, random() * 6.28, (random() - .5) * .64);
    dummy.scale.set(.32 + random() * .47, scale, .55);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    tufts.setColorAt(i, tint.set(palette[i % palette.length]));
  }
  tufts.receiveShadow = true;
  scene.add(tufts);

  const steel = material('#67716a', {metalness: .28});
  const tank = material('#b3ad91', {metalness: .22});
  const pipe = new CylinderGeometry(1, 1, 1, 8);
  const from = new Vector3(), to = new Vector3(), axis = new Vector3(0, 1, 0);
  function strut(a, b, width) {
    from.fromArray(a);
    to.fromArray(b);
    const center = from.clone().lerp(to, .5);
    const vector = to.sub(from);
    const mesh = place(pipe, steel, center.x, center.y, center.z, width, vector.length(), width, true);
    mesh.quaternion.setFromUnitVectors(axis, vector.normalize());
  }
  const tx = -10, tz = -20;
  const towerPoint = (angle, radius, height) => [tx + Math.cos(angle) * radius, height, tz + Math.sin(angle) * radius];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, b = a + Math.PI / 2;
    strut(towerPoint(a, 1.35, 0), towerPoint(a, .74, 6.2), .105);
    strut(towerPoint(a, 1.13, 1.4), towerPoint(b, .79, 5.3), .042);
    strut(towerPoint(b, 1.13, 1.4), towerPoint(a, .79, 5.3), .042);
  }
  place(new CylinderGeometry(1.42, 1.1, 1.8, 32), tank, tx, 6.47, tz, 1, 1, 1, true);
  place(new ConeGeometry(1.53, .52, 32), steel, tx, 7.59, tz, 1, 1, 1, true);

  const wood = material('#615744');
  const wire = material('#5c5142');
  const poles = [];
  for (let i = 0; i < 5; i++) {
    const z = -10 - i * 10.5;
    poles.push(z);
    place(pipe, wood, 7.8, 2, z, .1, 4, .1, true);
    place(box, wood, 7.8, 3.67, z, 1.36, .10, .10);
  }
  for (let i = 1; i < poles.length; i++) {
    const z = (poles[i - 1] + poles[i]) * .5;
    for (const x of [7.28, 8.34]) place(box, wire, x, 3.63, z, .018, .018, 10.5);
  }
}

function sunset(scene) {
  const horizon = new Color('#ebbd8d');
  scene.background = horizon;
  scene.fog = new Fog(horizon, 21, 81);
  const sky = new Mesh(new SphereGeometry(110, 32, 20), new ShaderMaterial({
    uniforms: {
      warm: {value: horizon}, blue: {value: new Color('#7caaa8')},
      glow: {value: new Color('#ffb154')},
      sun: {value: new Vector3(-.61, .10, -.79).normalize()}
    },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 direction;
      uniform vec3 warm, blue, glow, sun;
      void main() {
        vec3 ray = normalize(direction);
        float height = smoothstep(-.08, .65, ray.y);
        float facing = max(dot(ray, sun), 0.0);
        vec3 color = mix(warm, blue, height);
        color += glow * (.22 * pow(facing, 8.0) + .20 * pow(facing, 55.0));
        color += vec3(3.0, 1.8, .9) * smoothstep(.9995, .99985, facing);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: 1,
    depthWrite: false
  }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.add(new HemisphereLight('#fff0da', '#a38e66', 2.25));
  const fill = new DirectionalLight('#f8e8db', 1.3);
  fill.position.set(3, 5, 6);
  scene.add(fill);
  const sun = new DirectionalLight('#ffd399', 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.normalBias = .017;
  sun.shadow.bias = -.00018;
  Object.assign(sun.shadow.camera, {left: -10, right: 10, top: 10, bottom: -10, near: .4, far: 44});
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  return sun;
}

const moveCodes = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight']);

function shadeCharacter(model) {
  const meshes = [];
  model.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const base = mesh.material;
    const {toon_shadow, toon_highlight, toon_highlight_strength, toon_outline} = base.userData;
    if (!toon_shadow) {
      mesh.receiveShadow = true;
      continue;
    }
    const material = new MeshToonMaterial({
      color: base.color, side: base.side, vertexColors: base.vertexColors, toneMapped: false
    });
    material.onBeforeCompile = shader => {
      shader.uniforms.characterShadow = {value: new Color(toon_shadow)};
      shader.uniforms.characterHighlight = {value: new Color(toon_highlight)};
      shader.uniforms.characterHighlightStrength = {value: toon_highlight_strength};
      shader.fragmentShader = `
        uniform vec3 characterShadow;
        uniform vec3 characterHighlight;
        uniform float characterHighlightStrength;
      ` + shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        float key = dot(worldNormal, normalize(vec3(-.33, .51, .82)));
        outgoingLight = mix(characterShadow, diffuseColor.rgb, smoothstep(.14, .24, key));
        outgoingLight = mix(outgoingLight, characterHighlight,
          characterHighlightStrength * smoothstep(.624, .702, key));
        #include <opaque_fragment>
      `);
    };
    mesh.material = material;

    if (toon_outline > 0) {
      const ink = new MeshBasicMaterial({color: '#4a2b1c', side: BackSide, toneMapped: false});
      ink.onBeforeCompile = shader => {
        shader.uniforms.inkWidth = {value: toon_outline};
        shader.vertexShader = 'uniform float inkWidth;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n transformed += normal * inkWidth;'
        );
      };
      const outline = new SkinnedMesh(mesh.geometry, ink);
      outline.bind(mesh.skeleton, mesh.bindMatrix);
      outline.bindMode = mesh.bindMode;
      outline.frustumCulled = false;
      mesh.add(outline);
    }
  }
}

async function play() {
  const renderer = new WebGLRenderer({antialias: true});
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;
  renderer.domElement.setAttribute('aria-label', '3D game world. Use the arrow keys or WASD to move Max.');
  stage.append(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(37, 1, .1, 180);
  const sun = sunset(scene);
  roadside(scene);

  const model = await new GLTFLoader().loadAsync(new URL('./assets/max.glb', import.meta.url).href);
  const actor = new Group();
  shadeCharacter(model.scene);
  actor.add(model.scene);
  scene.add(actor);

  const mixer = new AnimationMixer(model.scene);
  const actions = Object.fromEntries(['Idle', 'Walk', 'Run'].map(name => {
    const clip = model.animations.find(animation => animation.name === name);
    if (!clip) throw new Error(`The ${name} animation is missing.`);
    return [name, mixer.clipAction(clip)];
  }));
  const speeds = {Walk: 1.92, Run: 5.7};
  const clipSpeeds = Object.fromEntries(model.parser.json.animations.map(animation =>
    [animation.name, animation.extras?.['Nominal ground speed']]));
  let animation = 'Idle';

  function updateAnimation(next, speed, dt) {
    if (next !== animation) {
      const previous = actions[animation];
      const current = actions[next];
      const synchronized = next !== 'Idle' && animation !== 'Idle';
      current.time = synchronized ? previous.time / previous.getClip().duration * current.getClip().duration : 0;
      animation = next;
    }
    for (const [name, action] of Object.entries(actions)) {
      const weight = damp(action.getEffectiveWeight(), Number(name === animation), 17, dt);
      action.setEffectiveWeight(weight);
      if (name !== 'Idle') action.setEffectiveTimeScale(clamp(speed / (clipSpeeds[name] || speeds[name]), .35, 1.22));
    }
    mixer.update(dt);
  }

  const held = new Set();
  const touches = new Map();
  const touchButtons = [...document.querySelectorAll('[data-move]')];
  function clearInput() {
    held.clear();
    touches.clear();
    for (const button of touchButtons) button.classList.remove('is-held');
  }
  window.addEventListener('keydown', event => {
    if (!moveCodes.has(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    held.add(event.code);
  });
  window.addEventListener('keyup', event => held.delete(event.code));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);
  const pressed = (...keys) => keys.some(key => held.has(key) || [...touches.values()].includes(key));
  for (const button of touchButtons) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, button.dataset.move);
      button.classList.add('is-held');
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, event => {
        touches.delete(event.pointerId);
        button.classList.toggle('is-held', [...touches.values()].includes(button.dataset.move));
      });
    }
  }

  let yaw = .43, pitch = .21, drag = null;
  let facing = .26, lastTime = null;
  const moving = new Vector3(), desired = new Vector3(), target = new Vector3();
  const desiredCamera = new Vector3();
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    canvas.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    yaw -= (event.clientX - drag.x) * .008;
    pitch = clamp(pitch + (event.clientY - drag.y) * .005, .025, .79);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, event => { if (event.pointerId === drag?.id) drag = null; });
  }

  function updateCamera(dt) {
    const distance = camera.aspect < .76 ? 8.7 : 7.7;
    target.set(actor.position.x, 1.68, actor.position.z);
    desiredCamera.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-11 * dt));
    camera.lookAt(target);
  }
  function reset() {
    clearInput();
    actor.position.set(-1.65, 0, 1.3);
    moving.set(0, 0, 0);
    animation = 'Idle';
    for (const [name, action] of Object.entries(actions)) {
      action.reset().setEffectiveWeight(Number(name === 'Idle')).play();
    }
    mixer.update(0);
    yaw = .46;
    pitch = .19;
    facing = .13;
    actor.rotation.y = facing;
    updateCamera(100);
  }
  document.querySelector('#reset').addEventListener('click', reset);
  function resize() {
    camera.aspect = stage.clientWidth / Math.max(stage.clientHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  reset();
  status.hidden = true;
  document.querySelector('#controls').hidden = false;
  document.querySelector('#dpad').hidden = false;

  renderer.setAnimationLoop(time => {
    const dt = lastTime === null ? 1 / 60 : Math.min(.05, (time - lastTime) / 1000);
    lastTime = time;
    const right = Number(pressed('ArrowRight', 'KeyD')) - Number(pressed('ArrowLeft', 'KeyA'));
    const forward = Number(pressed('ArrowUp', 'KeyW')) - Number(pressed('ArrowDown', 'KeyS'));
    const sprint = pressed('ShiftLeft', 'ShiftRight');
    const speed = sprint ? speeds.Run : speeds.Walk;
    desired.set(right * Math.cos(yaw) - forward * Math.sin(yaw), 0,
      -right * Math.sin(yaw) - forward * Math.cos(yaw));
    if (right || forward) {
      desired.normalize().multiplyScalar(speed);
      facing = turn(facing, Math.atan2(desired.x, desired.z), 13, dt);
    }
    moving.lerp(desired, 1 - Math.exp(-12 * dt));
    const oldX = actor.position.x;
    const oldZ = actor.position.z;
    actor.position.x = clamp(actor.position.x + moving.x * dt, -13, 13);
    actor.position.z = clamp(actor.position.z + moving.z * dt, -43, 24);
    actor.rotation.y = facing;

    const groundSpeed = Math.hypot(actor.position.x - oldX, actor.position.z - oldZ) / (dt || 1);
    const running = right || forward ? sprint : animation === 'Run';
    updateAnimation(groundSpeed < .12 ? 'Idle' : running ? 'Run' : 'Walk', groundSpeed, dt);
    sun.target.position.set(actor.position.x, 0, actor.position.z);
    sun.position.copy(sun.target.position).add(new Vector3(-8, 7, -11));
    updateCamera(dt);
    renderer.render(scene, camera);
  });
}

play().catch(error => {
  console.error(error);
  status.textContent = 'The 3D scene couldn’t load. Try refreshing in a browser with WebGL 2.';
});
