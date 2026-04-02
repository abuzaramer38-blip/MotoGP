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
  renderer.shadowMap.enabled      = true;
  renderer.shadowMap.type         = THREE.PCFSoftShadowMap;
  renderer.outputEncoding         = THREE.sRGBEncoding;
  renderer.toneMapping            = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure    = 1.1;

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
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 500;
    sun.shadow.camera.left   = sun.shadow.camera.bottom = -80;
    sun.shadow.camera.right  = sun.shadow.camera.top   =  80;
    sun.shadow.bias          = -0.002;
    scene.add(sun);

    scene.add(new THREE.HemisphereLight(0x6688cc, 0x443322, 0.5));

    // Trackside spotlights every 120 m
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
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: Utils.makeSkyGradient(), side: THREE.BackSide });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.0025);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(18, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.85 })
    );
    disc.position.set(-120, 60, -700);
    scene.add(disc);
  }

  /* ═══════════ INPUT ═══════════ */
  const keys  = {};
  const input = { throttle: false, brake: false, left: false, right: false, nitro: false };

  window.addEventListener('keydown', e => { keys[e.code] = true;  });
  window.addEventListener('keyup',   e => { keys[e.code] = false; });

  function readInput() {
    input.throttle = keys['ArrowUp']    || keys['KeyW'];
    input.brake    = keys['ArrowDown']  || keys['KeyS'];
    input.left     = keys['ArrowLeft']  || keys['KeyA'];
    input.right    = keys['ArrowRight'] || keys['KeyD'];
    input.nitro    = keys['Space'];
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
      btn.addEventListener('touchstart', e => { e.preventDefault(); input[action] = true;  }, { passive: false });
      btn.addEventListener('touchend',   e => { e.preventDefault(); input[action] = false; }, { passive: false });
    }
  }

  /* ═══════════ CAMERA SHAKE ═══════════ */
  let shakeIntensity = 0;

  Utils.on('cameraShake', ({ intensity }) => {
    shakeIntensity = Math.max(shakeIntensity, intensity);
  });

  function applyCameraShake(dt) {
    if (shakeIntensity < 0.001) return;
    camera.position.x   += (Math.random() - 0.5) * shakeIntensity * 0.4;
    camera.position.y   += (Math.random() - 0.5) * shakeIntensity * 0.2;
    shakeIntensity -= 5 * dt * shakeIntensity;
  }

  /* ═══════════ GAME STATE ═══════════ */
  let gameState = 'loading';
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

  /* ═══════════ SCENE INIT ═══════════
   *
   * ORDER MATTERS:
   *   1. Physics.init()  — creates the CANNON world & materials
   *   2. setupLighting() — pure Three.js, no dependencies
   *   3. setupSky()      — pure Three.js
   *   4. Track.build()   — calls Physics.createGround() / createStaticBox()
   *   5. Particles.init()
   *   6. AI.init()
   *   7. Bike.init()     — calls Physics.createBikeBody(); must come AFTER Physics.init()
   *   8. HUD / Garage
   */
  function initScene() {
    // ── 1. Physics MUST be first ──────────────────────────────────────────────
    Physics.init();

    // ── 2-3. Three.js environment ─────────────────────────────────────────────
    setupLighting();
    setupSky();

    // ── 4. Track (needs Physics world for barrier bodies) ─────────────────────
    Track.build(scene);

    // ── 5-6. Passive subsystems ───────────────────────────────────────────────
    Particles.init(scene);
    AI.init(scene);

    // ── 7. Bike — creates CANNON body; Physics must already be initialised ────
    Bike.init(scene, camera);

    // ── 8. UI subsystems ─────────────────────────────────────────────────────
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

  /* ═══════════ UI WIRING ═══════════ */
  function wireUI() {
    document.getElementById('btn-start-race').addEventListener('click', startRace);

    document.getElementById('btn-garage').addEventListener('click', () => {
      document.getElementById('main-menu').classList.add('hidden');
      Garage.show();
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
      // Reserved for future settings modal
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
    Utils.on('engineBlown', () => { /* HUD.js handles the overlay via its own listener */ });
  }

  /* ═══════════ RACE WIN CHECK ═══════════ */
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
        s.speed,
        dt
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
    initScene();   // Physics.init() is the very first call inside here
    wireUI();
    setupMobileControls();

    await loadingSequence();

    gameState = 'menu';
    document.getElementById('main-menu').classList.remove('hidden');

    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  boot().catch(console.error);

  /* ── Particle helpers exposed for external events ── */
  Utils.on('damage', () => {
    const m = Bike.getMesh();
    if (m) {
      Particles.sparks(m.position.clone(), 50);
      Particles.smoke(m.position.clone(), 30);
    }
  });

})();
