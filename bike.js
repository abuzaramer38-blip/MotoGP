/* ═══════════════════════════════════
   bike.js — Player bike mesh + controller
   v3: Enhanced mesh, smooth lean, speed-
   sensitive steering, top-speed shake
═══════════════════════════════════ */

'use strict';

const Bike = (() => {

  /* ── Tuning constants ── */
  const CFG = {
    maxSpeed:       90,    // m/s ≈ 324 km/h
    acceleration:   28,
    brakeForce:     55,
    // Steering: base rate scales DOWN at high speed (speed-sensitive)
    steerSpeedLow:  2.4,   // max yaw rate at low speed  (was 2.2)
    steerSpeedHigh: 0.85,  // max yaw rate at top speed  (was 0.9)
    steerReturn:    4.2,   // self-centring speed         (was 5.0)
    // Lean: spring-damper — higher stiffness = crisper, not sluggish
    leanMax:        0.38,  // max lean (radians) ~22°
    leanSmooth:     12.0,  // spring constant (was 6 — too slow)
    // leanDamp is computed as 2*sqrt(leanSmooth) ≈ 6.93 → critically damped
    groundY:        1.0,   // spawn/ride height
    nitroMult:      1.6,
    nitroDuration:  3.0,
    maxNitroPips:   3,
    // Top-speed camera shake
    shakeThreshold: 0.82,  // fraction of maxSpd before shake starts
    shakeMax:       0.18,  // peak shake magnitude
  };

  let mesh      = null;   // THREE.Group  (visual)
  let tailLight = null;   // THREE.PointLight (glow)
  let body      = null;   // CANNON.Body  (physics)
  let scene     = null;
  let camera    = null;

  // Internal camera-shake state (owned here, not in main.js)
  let _shakeAmt = 0;

  // State
  const state = {
    speed: 0,
    steer: 0,
    lean:  0,
    leanVel: 0,           // lean "velocity" for spring-damper feel
    gear:  1,
    rpm:   0,
    nitroPips: CFG.maxNitroPips,
    nitroTime: 0,
    nitroActive: false,
    distanceTravelled: 0,
    lapsCompleted: 0,
    raceStartTime: 0,
    engineLevel: 0,
    tireLevel: 0,
  };

  /* ════════════════════════════════════
     MESH BUILDER
  ════════════════════════════════════ */
  function _buildMesh() {
    const g = new THREE.Group();

    /* ── Materials ── */
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x080810,
      roughness: 0.15,
      metalness: 0.90,
    });
    const fairingMat = new THREE.MeshStandardMaterial({
      color: 0xcc1111,
      roughness: 0.18,
      metalness: 0.75,
    });
    const fairingAccentMat = new THREE.MeshStandardMaterial({
      color: 0xff3322,
      roughness: 0.10,
      metalness: 0.85,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.05,
      metalness: 0.98,
    });
    const darkChromeMat = new THREE.MeshStandardMaterial({
      color: 0x555566,
      roughness: 0.10,
      metalness: 0.92,
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.92,
      metalness: 0.00,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x99bbff,
      roughness: 0.02,
      metalness: 0.10,
      transparent: true,
      opacity: 0.45,
    });
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.95,
      metalness: 0.00,
    });
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      roughness: 0.10,
      metalness: 0.00,
      emissive: 0xff2200,
      emissiveIntensity: 2.5,
    });
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x888870,
      roughness: 0.25,
      metalness: 0.88,
    });

    /* ── Chassis / frame ── */
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.26, 1.62), bodyMat
    );
    chassis.castShadow = true;
    g.add(chassis);

    // Spine tube along the top
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.40, 8), darkChromeMat
    );
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.18, -0.1);
    spine.castShadow = true;
    g.add(spine);

    /* ── Front fairing (nose) ── */
    const fairing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.50, 0.88), fairingMat
    );
    fairing.position.set(0, 0.15, 0.54);
    fairing.castShadow = true;
    g.add(fairing);

    // Lower chin / air intake
    const chin = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.16, 0.42), fairingAccentMat
    );
    chin.position.set(0, -0.06, 0.68);
    chin.castShadow = true;
    g.add(chin);

    // Side winglets
    for (const sx of [-0.26, 0.26]) {
      const winglet = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.06, 0.28), fairingAccentMat
      );
      winglet.position.set(sx, 0.04, 0.62);
      winglet.castShadow = true;
      g.add(winglet);
    }

    /* ── Windshield (curved look via scaled box + glass) ── */
    const windshieldBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.04, 0.28), fairingMat
    );
    windshieldBase.position.set(0, 0.40, 0.38);
    windshieldBase.rotation.x = -0.30;
    g.add(windshieldBase);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.33, 0.32, 0.05), glassMat
    );
    windshield.position.set(0, 0.54, 0.32);
    windshield.rotation.x = -0.30;
    g.add(windshield);

    // Windshield top tint strip
    const tint = new THREE.Mesh(
      new THREE.BoxGeometry(0.33, 0.08, 0.04), new THREE.MeshStandardMaterial({
        color: 0x223366, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.7
      })
    );
    tint.position.set(0, 0.68, 0.27);
    tint.rotation.x = -0.30;
    g.add(tint);

    /* ── Tail / rear fairing ── */
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.20, 0.70), fairingMat
    );
    tail.position.set(0, 0.11, -0.65);
    tail.castShadow = true;
    g.add(tail);

    // Tail fin / number board
    const tailFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.18, 0.08), fairingAccentMat
    );
    tailFin.position.set(0, 0.20, -0.98);
    g.add(tailFin);

    /* ── Tail-light glow lens ── */
    const taillens = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.04), taillightMat
    );
    taillens.position.set(0, 0.14, -1.01);
    g.add(taillens);

    /* ── Seat ── */
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.07, 0.52), seatMat
    );
    seat.position.set(0, 0.25, -0.20);
    g.add(seat);

    /* ── Fuel tank hump ── */
    const tank = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.14, 0.46), fairingMat
    );
    tank.position.set(0, 0.24, 0.14);
    tank.castShadow = true;
    g.add(tank);

    /* ── Exhaust system ── */
    // Main collector pipe (left side)
    const collector = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.060, 0.80, 10), exhaustMat
    );
    collector.rotation.z = Math.PI / 2;
    collector.position.set(-0.22, -0.10, -0.26);
    collector.castShadow = true;
    g.add(collector);

    // Exit can (larger canister)
    const exhaustCan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.065, 0.38, 10), chromeMat
    );
    exhaustCan.rotation.z = Math.PI / 2;
    exhaustCan.position.set(-0.26, -0.10, -0.64);
    exhaustCan.castShadow = true;
    g.add(exhaustCan);

    // Exhaust tip (polished end)
    const exhaustTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.050, 0.072, 0.06, 10), chromeMat
    );
    exhaustTip.rotation.z = Math.PI / 2;
    exhaustTip.position.set(-0.34, -0.10, -0.64);
    g.add(exhaustTip);

    /* ── Front forks / suspension ── */
    for (const sx of [-0.13, 0.13]) {
      const fork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.042, 0.58, 8), chromeMat
      );
      fork.position.set(sx, -0.06, 0.72);
      fork.rotation.x = 0.20;
      fork.castShadow = true;
      g.add(fork);
    }

    // Triple clamp / top yoke
    const yoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.06, 0.12), darkChromeMat
    );
    yoke.position.set(0, 0.05, 0.72);
    g.add(yoke);

    /* ── Rear mono-shock ── */
    const shock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), chromeMat
    );
    shock.position.set(0, 0.02, -0.46);
    shock.rotation.x = 0.5;
    g.add(shock);

    /* ── Wheels ── */
    const wheelGeo = new THREE.TorusGeometry(0.32, 0.10, 14, 28);
    const spokeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.60, 5);
    const rimMat   = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.5, metalness: 0.6
    });

    function _makeWheel(zPos) {
      const wGroup = new THREE.Group();
      // Tyre
      const tyre = new THREE.Mesh(wheelGeo, rubberMat);
      tyre.castShadow = true;
      wGroup.add(tyre);
      // Rim disc
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20), rimMat
      );
      rim.rotation.x = Math.PI / 2;
      wGroup.add(rim);
      // Hub
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12), chromeMat
      );
      hub.rotation.x = Math.PI / 2;
      wGroup.add(hub);
      // Spokes (5)
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(spokeGeo, darkChromeMat);
        spoke.rotation.z = (i / 5) * Math.PI * 2;
        spoke.position.set(
          Math.sin((i / 5) * Math.PI * 2) * 0.14,
          Math.cos((i / 5) * Math.PI * 2) * 0.14,
          0
        );
        spoke.rotation.x = Math.PI / 2;
        wGroup.add(spoke);
      }
      wGroup.rotation.y = Math.PI / 2;
      wGroup.position.set(0, -0.18, zPos);
      return wGroup;
    }

    const frontWheelGrp = _makeWheel(0.76);
    frontWheelGrp.userData.isWheel = true;
    g.add(frontWheelGrp);

    const rearWheelGrp = _makeWheel(-0.80);
    rearWheelGrp.userData.isWheel = true;
    g.add(rearWheelGrp);

    /* ── Brake discs ── */
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x888888, roughness: 0.4, metalness: 0.9
    });
    for (const wz of [0.76, -0.80]) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.20, 0.018, 20), discMat
      );
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0.14, -0.18, wz);
      g.add(disc);
    }

    /* ── Rider ── */
    const riderMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d1a, roughness: 0.88, metalness: 0.05
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0xcc1111, roughness: 0.70, metalness: 0.05
    });

    // Torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.42, 0.34), riderMat
    );
    torso.position.set(0, 0.50, 0.08);
    torso.rotation.x = -0.48;
    torso.castShadow = true;
    g.add(torso);

    // Racing suit stripe on back
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.42, 0.04), leatherMat
    );
    stripe.position.set(0, 0.50, -0.10);
    stripe.rotation.x = -0.48;
    g.add(stripe);

    // Helmet
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 14, 10), riderMat
    );
    helmet.position.set(0, 0.83, 0.14);
    helmet.castShadow = true;
    g.add(helmet);

    // Helmet visor
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.195, 14, 10), glassMat
    );
    visor.position.set(0, 0.83, 0.14);
    g.add(visor);

    // Arms (tucks down over tank)
    for (const sx of [-0.16, 0.16]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.34, 7), riderMat
      );
      arm.position.set(sx, 0.34, 0.30);
      arm.rotation.x = -0.9;
      arm.castShadow = true;
      g.add(arm);
    }

    /* ── Tail-light point light (attached to group) ── */
    tailLight = new THREE.PointLight(0xff2200, 2.5, 3.5);
    tailLight.position.set(0, 0.14, -1.05);
    g.add(tailLight);

    return { group: g };
  }

  /* ════════════════════════════════════
     INIT / RESET
  ════════════════════════════════════ */
  function init(threeScene, threeCamera) {
    scene  = threeScene;
    camera = threeCamera;
    reset();
  }

  function reset() {
    if (mesh) { scene.remove(mesh); mesh = null; tailLight = null; }
    if (body) {
      const w = Physics.getWorld();
      if (w) w.remove(body);
      body = null;
    }

    state.speed = 0;
    state.steer = 0;
    state.lean  = 0;
    state.leanVel = 0;
    state.gear  = 1;
    state.rpm   = 0;
    state.nitroPips = CFG.maxNitroPips;
    state.nitroTime = 0;
    state.nitroActive = false;
    state.distanceTravelled = 0;
    state.lapsCompleted = 0;
    state.raceStartTime = performance.now();
    _shakeAmt = 0;

    const { group } = _buildMesh();
    mesh = group;
    mesh.position.set(0, CFG.groundY, -2);
    mesh.castShadow = true;
    scene.add(mesh);

    body = Physics.createBikeBody({ x: 0, y: CFG.groundY, z: -2 });
    if (!body) {
      console.error('Bike.reset: Physics.init() must run before Bike.reset()');
    }
  }

  /* ════════════════════════════════════
     UPDATE
  ════════════════════════════════════ */
  function update(dt, input) {
    if (!body || !mesh) return;

    const engineBoost = 1 + state.engineLevel * 0.15;
    const tireGrip    = 1 + state.tireLevel   * 0.12;

    /* ── Nitro ── */
    if (input.nitro && state.nitroPips > 0 && !state.nitroActive) {
      state.nitroActive = true;
      state.nitroTime   = CFG.nitroDuration;
      state.nitroPips  -= 1;
      Utils.emit('nitroStart');
    }
    if (state.nitroActive) {
      state.nitroTime -= dt;
      if (state.nitroTime <= 0) {
        state.nitroActive = false;
        Utils.emit('nitroEnd');
      }
    }

    const nitroMult = state.nitroActive ? CFG.nitroMult : 1.0;
    const maxSpd    = CFG.maxSpeed * engineBoost * nitroMult;

    /* ── Throttle / Brake ── */
    if (input.throttle) {
      state.speed += CFG.acceleration * engineBoost * dt;
    } else if (input.brake) {
      state.speed -= CFG.brakeForce * dt;
    } else {
      state.speed -= (state.speed > 0 ? 14 : 0) * dt;
    }
    state.speed = Utils.clamp(state.speed, 0, maxSpd);

    /* ── Speed-sensitive steering ──
       At low speed: full steerSpeedLow authority.
       At top speed: reduced to steerSpeedHigh so the bike feels planted.
       Linear interpolation between the two extremes. */
    const speedFrac  = Utils.clamp(state.speed / maxSpd, 0, 1);
    const steerAuthority = Utils.lerp(
      CFG.steerSpeedLow,
      CFG.steerSpeedHigh,
      speedFrac
    ) * tireGrip;

    const steerTarget = input.left ? -1 : (input.right ? 1 : 0);
    if (steerTarget !== 0) {
      state.steer = Utils.lerp(state.steer, steerTarget, steerAuthority * dt * 2.4);
    } else {
      state.steer = Utils.lerp(state.steer, 0, CFG.steerReturn * dt);
    }
    state.steer = Utils.clamp(state.steer, -1, 1);

    /* ── Yaw ── */
    const yawRate = -state.steer * steerAuthority * Utils.clamp(speedFrac, 0.15, 1.0);
    body.angularVelocity.y = Utils.lerp(body.angularVelocity.y, yawRate, 10 * dt);

    /* ── Forward velocity ── */
    const q  = body.quaternion;
    const fx =  2 * (q.x * q.z + q.w * q.y);
    const fz  = q.w * q.w - q.x * q.x - q.y * q.y + q.z * q.z;
    body.velocity.x =  fx * state.speed;
    body.velocity.z = -fz * state.speed;
    body.velocity.y = Utils.clamp(body.velocity.y, -20, 5);

    body.position.y = CFG.groundY;

    /* ── Smooth lean with spring-damper ──
       targetLean is proportional to steer AND speed (more lean at speed).
       leanVel gives a spring-damper feel so it overshoots slightly then settles. */
    const targetLean = -state.steer * CFG.leanMax * (0.4 + 0.6 * speedFrac);
    const leanSpring = CFG.leanSmooth;
    const leanDamp   = 2 * Math.sqrt(leanSpring); // critically damped
    const leanForce  = leanSpring * (targetLean - state.lean) - leanDamp * state.leanVel;
    state.leanVel += leanForce * dt;
    state.lean    += state.leanVel * dt;
    state.lean     = Utils.clamp(state.lean, -CFG.leanMax, CFG.leanMax);

    /* ── Gear / RPM ── */
    _updateGearRPM(maxSpd);

    /* ── Distance / lap ── */
    state.distanceTravelled += state.speed * dt;
    const lapLength = Track.getTrackLength();
    if (state.distanceTravelled > lapLength * (state.lapsCompleted + 1)) {
      state.lapsCompleted++;
      Utils.emit('lapComplete', { lap: state.lapsCompleted });
    }

    /* ── Top-speed camera shake ── */
    const shakeTarget = speedFrac > CFG.shakeThreshold
      ? CFG.shakeMax * ((speedFrac - CFG.shakeThreshold) / (1 - CFG.shakeThreshold))
      : 0;
    _shakeAmt = Utils.lerp(_shakeAmt, shakeTarget, 5 * dt);

    /* ── Tail-light pulse with RPM ── */
    if (tailLight) {
      tailLight.intensity = 1.8 + state.rpm * 1.8;
    }

    _syncMeshToBody();
  }

  function _updateGearRPM(maxSpd) {
    const numGears  = 6;
    const speedPct  = state.speed / maxSpd;
    state.gear      = Utils.clamp(Math.ceil(speedPct * numGears), 1, numGears);
    const gearBottom = (state.gear - 1) / numGears;
    const gearTop    =  state.gear      / numGears;
    const span       = gearTop - gearBottom;
    state.rpm = span > 0
      ? Utils.clamp((speedPct - gearBottom) / span, 0.15, 1.0)
      : 0.15;
  }

  function _syncMeshToBody() {
    if (!mesh || !body) return;

    // Position — pinned to ground
    mesh.position.set(body.position.x, CFG.groundY, body.position.z);

    // Orientation: extract yaw only from physics, add visual lean (Z roll)
    const q = new THREE.Quaternion(
      body.quaternion.x, body.quaternion.y,
      body.quaternion.z, body.quaternion.w
    );
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    euler.x = 0;
    euler.z = state.lean;
    mesh.quaternion.setFromEuler(euler);

    // Spin wheel groups
    mesh.children.forEach(child => {
      if (child.userData && child.userData.isWheel) {
        // wheel groups rotate around their local X (side-on spin)
        child.rotation.x += state.speed * 0.055 * (1 / 0.32); // ω = v/r
      }
    });
  }

  /* ════════════════════════════════════
     CAMERA
  ════════════════════════════════════ */
  function updateCamera(dt) {
    if (!mesh) return;

    // Chase offset in bike-local space
    const offset = new THREE.Vector3(0, 2.0, 6.0);
    offset.applyQuaternion(mesh.quaternion);
    const targetPos = mesh.position.clone().add(offset);

    // Add top-speed shake
    if (_shakeAmt > 0.001) {
      targetPos.x += (Math.random() - 0.5) * _shakeAmt;
      targetPos.y += (Math.random() - 0.5) * _shakeAmt * 0.5;
    }

    camera.position.lerp(targetPos, 7 * dt);

    const lookAt = mesh.position.clone().add(new THREE.Vector3(0, 0.7, 0));
    camera.lookAt(lookAt);

    // FOV widens with speed; extra push during nitro
    const targetFOV = 55
      + (state.speed / CFG.maxSpeed) * 28
      + (state.nitroActive ? 14 : 0);
    camera.fov = Utils.lerp(camera.fov, targetFOV, 4 * dt);
    camera.updateProjectionMatrix();
  }

  /* ── Upgrades ── */
  function upgradeEngine() { state.engineLevel = Math.min(state.engineLevel + 1, 3); }
  function upgradeTires()  { state.tireLevel   = Math.min(state.tireLevel   + 1, 3); }
  function addNitro()      { state.nitroPips   = Math.min(state.nitroPips   + 3, CFG.maxNitroPips + 3); }

  function getState() { return state; }
  function getMesh()  { return mesh;  }
  function getCFG()   { return CFG;   }

  return {
    init, reset, update, updateCamera,
    upgradeEngine, upgradeTires, addNitro,
    getState, getMesh, getCFG,
  };
})();
