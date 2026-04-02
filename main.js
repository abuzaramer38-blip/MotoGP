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
  renderer.shadowMap.enabled     = true;
  renderer.shadowMap.type        = THREE.PCFSoftShadowMap;
  renderer.outputEncoding        = THREE.sRGBEncoding;
  renderer.toneMapping           = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure   = 1.1;

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
    scene.add(new THREE.AmbientLight(0x334466, 0.8));

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

    scene.add(new THREE.HemisphereLight(0x6688cc, 0x443322, 0.5));

    for (let z = 0; z < 800; z += 120) {
      for (const sx of [-10, 10]) {
        const spot = new THREE.SpotLight(0xffffff, 1.5, 80, Math.PI / 6, 0.4);
        spot.position.set(sx, 14, -z);
        spot.target.position.set(0, 0, -z);
        spot.castShadow = false;
        scene.add(spot);
        scene.add(spot.target);
      }
    }
  }

  /* ═══════════ SKY ═══════════ */
  function setupSky() {
    const skyMat = new THREE.MeshBasicMaterial({ map: Utils.makeSkyGradient(), side: THREE.BackSide });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat));
    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.0025);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(18, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.85 })
    );
    disc.position.set(-120, 60, -700);
    scene.add(disc);
  }

  /* ═══════════ INPUT ═══════════════════════════════════════════════════════
   *
   * FIX — Mobile input was being overwritten every frame.
   *
   * Previously readInput() unconditionally assigned every field from `keys`,
   * wiping out any touch-state that setupMobileControls() had set.
   * The result was that mobile buttons appeared to do nothing — the very
   * next call to readInput() reset everything to false.
   *
   * Solution: keep a separate `mobileInput` object that touchstart/touchend
   * write to.  readInput() then ORs the two sources together so keyboard
   * and touch both work, independently, without clobbering each other.
   */
  const keys        = {};
  const mobileInput = { throttle: false, brake: false, left: false, right: false, nitro: false };
  const input       = { throttle: false, brake: false, left: false, right: false, nitro: false };

  window.addEventListener('keydown', e => { keys[e.code] = true;  });
  window.addEventListener('keyup',   e => { keys[e.code] = false; });

  function readInput() {
    /* OR keyboard with mobile so neither source overwrites the other */
    input.throttle = (keys['ArrowUp']    || keys['KeyW'])           || mobileInput.throttle;
    input.brake    = (keys['ArrowDown']  || keys['KeyS'])           || mobileInput.brake;
    input.left     = (keys['ArrowLeft']  || keys['KeyA'])           || mobileInput.left;
    input.right    = (keys['ArrowRight'] || keys['KeyD'])           || mobileInput.right;
    input.nitro    =  keys['Space']                                 || mobileInput.nitro;
  }

  function setupMobileControls() {
    const map = {
      'mob-throttle': 'throttle',
      'mob-brake':    'brake',
      'mob-left':     'left',
      'mob-right':    'right',
      'mob-nitro':    'nitro',
    };
    for (const [id, action] of Object.entries(map)) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      /* Write to mobileInput — NOT to input directly — so readInput()
         can merge it safely each frame without risk of overwrites.     */
      btn.addEventListener('touchstart', e => { e.preventDefault(); mobileInput[action] = true;  }, { passive: false });
      btn.addEventListener('touchend',   e => { e.preventDefault(); mobileInput[action] = false; }, { passive: false });
      /* Also support mouse for desktop testing of the on-screen buttons */
      btn.addEventListener('mousedown', () => { mobileInput[action] = true;  });
      btn.addEventListener('mouseup',   () => { mobileInput[action] = false; });
    }
  }

  /* ═══════════ CAMERA SHAKE ═══════════ */
  let shakeIntensity = 0;
  Utils.on('cameraShake', ({ intensity }) => {
    shakeIntensity = Math.max(shakeIntensity, intensity);
  });
  function applyCameraShake(dt) {
    if (shakeIntensity < 0.001) return;
    camera.position.x += (Math.random() - 0.5) * shakeIntensity * 0.4;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.2;
    shakeIntensity    -= 5 * dt * shakeIntensity;
  }

  /* ═══════════ GAME STATE ═══════════ */
  let gameState  = 'loading';
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
    const ls = document.getElementById('loading-screen');
    ls.style.transition = 'opacity 0.5s';
    ls.style.opacity    = '0';
    await new Promise(r => setTimeout(r, 500));
    ls.style.display    = 'none';
  }

  /* ═══════════ SCENE INIT ═══════════════════════════════════════════════════
   * Dependency order is critical:
   *   1. Physics.init()   — creates CANNON world + materials
   *   2. setupLighting()  — pure Three.js
   *   3. setupSky()       — pure Three.js
   *   4. Track.build()    — calls Physics.createGround() / createStaticBox()
   *   5. Particles.init() — passive
   *   6. AI.init()        — passive
   *   7. Bike.init()      — calls Physics.createBikeBody(); needs world ready
   *   8. HUD / Garage     — DOM only, no physics dependency
   */
  function initScene() {
    Physics.init();       // ← must be first
    setupLighting();
    setupSky();
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

    const baseEarning = finished ? 2000 : 800;
    const timeBonus   = Math.max(0, Math.floor(300000 / elapsed) * 10);
    const healthBonus = Math.floor(s.health * 5);
    const total       = baseEarning + timeBonus + healthBonus;
    Garage.addCash(total);

    document.getElementById('race-over-title').textContent = finished ? 'RACE COMPLETE' : 'DNF';
    document.getElementById('race-over-stats').innerHTML = `
      <div>Time: <span class="stat-val">${Utils.formatTime(elapsed)}</span></div>
      <div>Distance: <span class="stat-val">${distKM} km</span></div>
      <div>Max Speed: <span class="stat-val">${Math.round(s.speed * 3.6)} km/h</span></div>
      <div>Laps: <span class="stat-val">${s.lapsCompleted} / ${TOTAL_LAPS}</span></div>
    `;
    document.getElementById('race-credits-earned').textContent = total.toLocaleString();
    document.getElementById('race-over-screen').classList.remove('hidden');
  }

  /* ═══════════ UI WIRING ═════════════════════════════════════════════════════
   * All button IDs match index.html exactly.  Called once during boot after
   * initScene() so all subsystems (Garage etc.) are already initialised.
   */
  function wireUI() {
    const $ = id => document.getElementById(id);

    $('btn-start-race').addEventListener('click', startRace);

    $('btn-garage').addEventListener('click', () => {
      $('main-menu').classList.add('hidden');
      Garage.show();
    });

    $('btn-settings').addEventListener('click', () => {
      /* Reserved for future settings modal */
    });

    $('btn-goto-garage').addEventListener('click', () => {
      $('race-over-screen').classList.add('hidden');
      Garage.show();
    });

    $('btn-race-again').addEventListener('click', () => {
      $('race-over-screen').classList.add('hidden');
      startRace();
    });

    $('btn-blown-pit').addEventListener('click', () => {
      endRace(false);
    });

    Utils.on('garageToRace', startRace);
  }

  /* ═══════════ LAP WIN CHECK ═══════════ */
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

  /* Damage particle hook */
  Utils.on('damage', () => {
    const m = Bike.getMesh();
    if (m) {
      Particles.sparks(m.position.clone(), 50);
      Particles.smoke(m.position.clone(), 30);
    }
  });

})();
