/* ═══════════════════════════════════
   main.js — Game bootstrap & loop
═══════════════════════════════════ */

'use strict';

(function () {

  /* ═══════════ THREE.JS SETUP ═══════════ */
  const canvas   = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.outputEncoding    = THREE.sRGBEncoding;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 3, 8);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  /* ═══════════ LIGHTING ═══════════ */
  function setupLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x334466, 0.8);
    scene.add(ambient);

    // Sun
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.2);
    sun.position.set(50, 80, -100);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 500;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
    sun.shadow.camera.right = sun.shadow.camera.top   =  80;
    sun.shadow.bias = -0.002;
    scene.add(sun);

    // Horizon fill
    const fill = new THREE.HemisphereLight(0x6688cc, 0x443322, 0.5);
    scene.add(fill);

    // Track-side spots (every 120m)
    for (let z = 0; z < 800; z += 120) {
      for (const sx of [-10, 10]) {
        const spot = new THREE.SpotLight(0xffffff, 1.5, 80, Math.PI / 6, 0.4);
        spot.position.set(sx, 14, -z);
        spot.target.position.set(0, 0, -z);
        spot.castShadow = false;   // perf — too many shadows
        scene.add(spot);
        scene.add(spot.target);
      }
    }
  }

  /* ═══════════ SKY ═══════════ */
  function setupSky() {
    // Gradient sky dome
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    const skyTex = Utils.makeSkyGradient();
    // Map the vertical gradient onto the sphere
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // Fog
    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.0025);

    // Sun disc
    const discGeo = new THREE.CircleGeometry(18, 32);
    const discMat = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.85 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(-120, 60, -700);
    scene.add(disc);
  }

  /* ═══════════ INPUT ═══════════ */
  const keys = {};
  const input = { throttle: false, brake: false, left: false, right: false, nitro: false };

  window.addEventListener('keydown', e => { keys[e.code] = true;  });
  window.addEventListener('keyup',   e => { keys[e.code] = false; });

  function readInput() {
    input.throttle = keys['ArrowUp']    || keys['KeyW'];
    input.brake    = keys['ArrowDown']  || keys['KeyS'];
    // FIXED: Left arrow → Left, Right arrow → Right
    input.left     = keys['ArrowLeft']  || keys['KeyA'];
    input.right    = keys['ArrowRight'] || keys['KeyD'];
    input.nitro    = keys['Space'];
  }

  // Mobile controls
  function setupMobileControls() {
    const btns = {
      'mob-throttle': ['throttle'],
      'mob-brake':    ['brake'],
      'mob-left':     ['left'],
      'mob-right':    ['right'],
      'mob-nitro':    ['nitro'],
    };
    for (const [id, actions] of Object.entries(btns)) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      btn.addEventListener('touchstart', e => { e.preventDefault(); actions.forEach(a => { input[a] = true; }); }, { passive: false });
      btn.addEventListener('touchend',   e => { e.preventDefault(); actions.forEach(a => { input[a] = false; }); }, { passive: false });
    }
  }

  /* ═══════════ CAMERA SHAKE ═══════════ */
  let shakeIntensity = 0;
  let shakeDecay = 5;

  Utils.on('cameraShake', ({ intensity }) => {
    shakeIntensity = Math.max(shakeIntensity, intensity);
  });

  function applyCameraShake(dt) {
    if (shakeIntensity < 0.001) return;
    camera.position.x += (Math.random() - 0.5) * shakeIntensity * 0.4;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.2;
    shakeIntensity -= shakeDecay * dt * shakeIntensity;
  }

  /* ═══════════ GAME STATE ═══════════ */
  let gameState = 'loading';  // loading | menu | racing | gameover
  const TOTAL_LAPS = 3;

  /* ═══════════ LOADING SEQUENCE ═══════════ */
  async function loadingSequence() {
    const bar  = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');
    const steps = [
      [10,  'Initializing Physics Engine...'],
      [25,  'Loading Track Assets...'],
      [45,  'Compiling Shaders...'],
      [60,  'Building Race Circuit...'],
      [75,  'Spawning AI Rivals...'],
      [88,  'Calibrating Bike Physics...'],
      [96,  'Warming Up Engines...'],
      [100, 'Ready to Race!'],
    ];
    for (const [pct, msg] of steps) {
      bar.style.width  = pct + '%';
      text.textContent = msg;
      await new Promise(r => setTimeout(r, pct < 50 ? 180 : 220));
    }
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('loading-screen').style.opacity = '0';
    document.getElementById('loading-screen').style.transition = 'opacity 0.5s';
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('loading-screen').style.display = 'none';
  }

  /* ═══════════ SCENE INIT ═══════════ */
  function initScene() {
    setupLighting();
    setupSky();
    Physics.init();
    Track.build(scene);
    Particles.init(scene);
    AI.init(scene);
    Bike.init(scene, camera);
    HUD.init();
    HUD.setTotalLaps(TOTAL_LAPS);
    Garage.init();
  }

  /* ═══════════ RACE START ═══════════ */
  function startRace() {
    gameState = 'racing';
    Bike.reset();
    AI.spawnRivals(4);
    Particles.reset();
    HUD.hideEngineBlown();
    HUD.show();

    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('race-over-screen').classList.add('hidden');
    document.getElementById('garage-screen').classList.add('hidden');
  }

  /* ═══════════ RACE END ═══════════ */
  function endRace(finished) {
    gameState = 'gameover';
    HUD.hide();

    const s       = Bike.getState();
    const elapsed = performance.now() - s.raceStartTime;
    const distKM  = (s.distanceTravelled / 1000).toFixed(2);

    // Calculate earnings
    const baseEarning = finished ? 2000 : 800;
    const timeBonus   = Math.max(0, Math.floor(300000 / elapsed) * 10);
    const healthBonus = Math.floor(s.health * 5);
    const total       = baseEarning + timeBonus + healthBonus;
    Garage.addCash(total);

    // Show race-over screen
    const screen = document.getElementById('race-over-screen');
    document.getElementById('race-over-title').textContent = finished ? 'RACE COMPLETE' : 'DNF';
    document.getElementById('race-over-stats').innerHTML = `
      <div>Time: <span class="stat-val">${Utils.formatTime(elapsed)}</span></div>
      <div>Distance: <span class="stat-val">${distKM} km</span></div>
      <div>Max Speed: <span class="stat-val">${Math.round(s.speed * 3.6)} km/h</span></div>
      <div>Laps: <span class="stat-val">${s.lapsCompleted} / ${TOTAL_LAPS}</span></div>
    `;
    document.getElementById('race-credits-earned').textContent = total.toLocaleString();
    screen.classList.remove('hidden');
  }

  /* ═══════════ UI WIRING ═══════════ */
  function wireUI() {
    document.getElementById('btn-start-race').addEventListener('click', startRace);
    document.getElementById('btn-garage').addEventListener('click', () => {
      document.getElementById('main-menu').classList.add('hidden');
      Garage.show();
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      // Future: settings modal
    });

    document.getElementById('btn-goto-garage').addEventListener('click', () => {
      document.getElementById('race-over-screen').classList.add('hidden');
      Garage.show();
    });
    document.getElementById('btn-race-again').addEventListener('click', () => {
      document.getElementById('race-over-screen').classList.add('hidden');
      startRace();
    });

    document.getElementById('btn-blown-pit').addEventListener('click', () => {
      endRace(false);
    });

    Utils.on('garageToRace', startRace);
    Utils.on('engineBlown', () => {
      // Show blown overlay (HUD.js handles this via event)
    });
  }

  /* ═══════════ RACE LOOP LOGIC ═══════════ */
  function checkLapWin() {
    const s = Bike.getState();
    if (s.lapsCompleted >= TOTAL_LAPS && gameState === 'racing') {
      endRace(true);
    }
  }

  /* ═══════════ MAIN LOOP ═══════════ */
  let lastTime = 0;
  function loop(now) {
    requestAnimationFrame(loop);

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (gameState === 'racing') {
      readInput();

      Physics.step(dt);
      Bike.update(dt, input);
      AI.update(dt);

      const s = Bike.getState();
      Particles.updateExhaust(
        Bike.getMesh() ? Bike.getMesh().position : new THREE.Vector3(),
        s.speed, dt
      );
      Particles.update(dt);

      Bike.updateCamera(dt);
      applyCameraShake(dt);

      HUD.update(s);
      checkLapWin();
    }

    renderer.render(scene, camera);
  }

  /* ═══════════ BOOT ═══════════ */
  async function boot() {
    initScene();
    wireUI();
    setupMobileControls();

    await loadingSequence();

    gameState = 'menu';
    document.getElementById('main-menu').classList.remove('hidden');

    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  boot().catch(console.error);

  // Expose for events
  window._emitDamageParticles = function (pos) {
    Particles.sparks(pos, 50);
    Particles.smoke(pos, 40);
  };

  // Hook damage events to particles
  Utils.on('damage', () => {
    const m = Bike.getMesh();
    if (m) {
      Particles.sparks(m.position.clone(), 50);
      Particles.smoke(m.position.clone(), 30);
    }
  });

})();
