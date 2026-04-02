/* ═══════════════════════════════════
   bike.js — Player bike mesh + controller
═══════════════════════════════════ */

'use strict';

const Bike = (() => {

  /* ── Tuning constants ── */
  const CFG = {
    maxSpeed:       90,    // m/s ≈ 324 km/h
    acceleration:   28,
    brakeForce:     55,
    steerSpeed:     1.8,   // rad/s max yaw rate
    steerReturn:    4.5,   // how fast steering centres
    leanFactor:     0.38,  // visual lean per steering input
    groundY:        0.52,  // ride height
    nitroMult:      1.6,
    nitroDuration:  3.0,   // seconds
    maxNitroPips:   3,
    maxHealth:      100,
    collisionDmg:   18,
    collisionImpulse: 12,  // bounce-back force
  };

  let mesh   = null;       // THREE.Group
  let body   = null;       // CANNON.Body
  let scene  = null;
  let camera = null;

  // State
  const state = {
    speed: 0,
    steer: 0,
    lean:  0,
    gear:  1,
    rpm:   0,
    health: CFG.maxHealth,
    nitroPips: CFG.maxNitroPips,
    nitroTime: 0,
    nitroActive: false,
    distanceTravelled: 0,
    lapsCompleted: 0,
    raceStartTime: 0,
    lastDmgTime: -5,
    isDead: false,
    // upgrades
    engineLevel: 0,
    tireLevel: 0,
  };

  /* ─ Build the 3-D bike mesh ─ */
  function _buildMesh() {
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a14,
      roughness: 0.2,
      metalness: 0.8,
    });
    const fairingMat = new THREE.MeshStandardMaterial({
      color: 0xcc1111,
      roughness: 0.3,
      metalness: 0.6,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.1,
      metalness: 0.95,
    });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.0 });
    const glassMat  = new THREE.MeshStandardMaterial({ color: 0x88aaff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
    const seatMat   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 });

    /* Chassis */
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 1.6), bodyMat);
    chassis.castShadow = true;
    g.add(chassis);

    /* Front fairing */
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.9), fairingMat);
    fairing.position.set(0, 0.16, 0.52);
    fairing.castShadow = true;
    g.add(fairing);

    /* Windscreen */
    const wscreen = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.06), glassMat);
    wscreen.position.set(0, 0.4, 0.44);
    g.add(wscreen);

    /* Tail section */
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.72), fairingMat);
    tail.position.set(0, 0.12, -0.64);
    tail.castShadow = true;
    g.add(tail);

    /* Seat */
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.56), seatMat);
    seat.position.set(0, 0.26, -0.22);
    g.add(seat);

    /* Exhaust pipes */
    for (const sx of [-0.12, 0.12]) {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), chromeMat);
      exhaust.rotation.z = Math.PI / 2;
      exhaust.position.set(sx, -0.09, -0.5);
      exhaust.castShadow = true;
      g.add(exhaust);
    }

    /* Fork / front suspension */
    for (const sx of [-0.14, 0.14]) {
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), chromeMat);
      fork.position.set(sx, -0.08, 0.72);
      fork.rotation.x = 0.22;
      g.add(fork);
    }

    /* Wheels */
    const wheelGeo = new THREE.TorusGeometry(0.32, 0.1, 12, 24);
    const hubGeo   = new THREE.CylinderGeometry(0.1, 0.1, 0.14, 16);

    const frontWheel = new THREE.Mesh(wheelGeo, rubberMat);
    frontWheel.rotation.y = Math.PI / 2;
    frontWheel.position.set(0, -0.18, 0.75);
    frontWheel.castShadow = true;
    g.add(frontWheel);

    const rearWheel = new THREE.Mesh(wheelGeo, rubberMat);
    rearWheel.rotation.y = Math.PI / 2;
    rearWheel.position.set(0, -0.18, -0.78);
    rearWheel.castShadow = true;
    g.add(rearWheel);

    for (const wz of [0.75, -0.78]) {
      const hub = new THREE.Mesh(hubGeo, chromeMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0, -0.18, wz);
      g.add(hub);
    }

    /* Rider silhouette */
    const riderMat = new THREE.MeshStandardMaterial({ color: 0x111120, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.36), riderMat);
    torso.position.set(0, 0.5, 0.1);
    torso.rotation.x = -0.45;
    torso.castShadow = true;
    g.add(torso);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), riderMat);
    helmet.position.set(0, 0.82, 0.16);
    helmet.castShadow = true;
    g.add(helmet);

    return { group: g };
  }

  /* ─ init ─ */
  function init(threeScene, threeCamera) {
    scene  = threeScene;
    camera = threeCamera;
    reset();
  }

  function reset() {
    // Remove old
    if (mesh) scene.remove(mesh);
    if (body) Physics.getWorld().remove(body);

    // Fresh state
    state.speed = 0;
    state.steer = 0;
    state.lean  = 0;
    state.gear  = 1;
    state.rpm   = 0;
    state.health = CFG.maxHealth;
    state.nitroPips = CFG.maxNitroPips;
    state.nitroTime = 0;
    state.nitroActive = false;
    state.distanceTravelled = 0;
    state.lapsCompleted = 0;
    state.raceStartTime = performance.now();
    state.lastDmgTime = -5;
    state.isDead = false;

    const { group } = _buildMesh();
    mesh = group;
    mesh.position.set(0, CFG.groundY, -2);
    mesh.castShadow = true;
    scene.add(mesh);

    body = Physics.createBikeBody({ x: 0, y: CFG.groundY + 0.3, z: -2 });
    // Store reference for collision detection
    body._isBike = true;

    // Collision event
    body.addEventListener('collide', _onCollide);
  }

  /* ─ Collision handler ─ */
  let _lastCollideTime = 0;
  function _onCollide(e) {
    const now = performance.now() / 1000;
    if (now - _lastCollideTime < 0.4) return;  // debounce
    _lastCollideTime = now;

    if (state.isDead) return;
    const impact = e.contact.getImpactVelocityAlongNormal();
    if (Math.abs(impact) < 3) return;  // ignore light grazes

    const dmg = Math.min(CFG.collisionDmg * (Math.abs(impact) / 10), 35);
    applyDamage(dmg);

    // Bounce-back
    const vel = body.velocity;
    body.velocity.set(-vel.x * 0.6, vel.y * 0.3, -vel.z * 0.5);
    state.speed *= 0.35;
  }

  function applyDamage(amount) {
    if (state.isDead) return;
    state.health = Math.max(0, state.health - amount);
    Utils.emit('damage', { health: state.health, amount });
    if (state.health <= 0) {
      state.isDead = true;
      state.speed = 0;
      Utils.emit('engineBlown');
    }
  }

  /* ─ Update (called every frame) ─ */
  function update(dt, input) {
    if (state.isDead) { _syncMeshToBody(); return; }

    const engineBoost = 1 + state.engineLevel * 0.15;
    const tireGrip    = 1 + state.tireLevel  * 0.12;

    // Nitro
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
    const maxSpd = CFG.maxSpeed * engineBoost * nitroMult;

    // Throttle / Brake
    if (input.throttle) {
      state.speed += CFG.acceleration * engineBoost * dt;
    } else if (input.brake) {
      state.speed -= CFG.brakeForce * dt;
    } else {
      // natural deceleration
      state.speed -= (state.speed > 0 ? 14 : 0) * dt;
    }
    state.speed = Utils.clamp(state.speed, 0, maxSpd);

    // ─ STEERING (FIXED: Left=Left, Right=Right) ─
    const steerTarget = input.left ? -1 : (input.right ? 1 : 0);

    // Rate at which we approach target (scaled by tire grip & speed)
    const speedFactor = Utils.clamp(state.speed / 30, 0.2, 1.0);
    const steerRate   = CFG.steerSpeed * speedFactor * tireGrip;

    if (steerTarget !== 0) {
      state.steer = Utils.lerp(state.steer, steerTarget, steerRate * dt * 2.2);
    } else {
      state.steer = Utils.lerp(state.steer, 0, CFG.steerReturn * dt);
    }
    state.steer = Utils.clamp(state.steer, -1, 1);

    // Apply yaw rotation to the Cannon body
    // POSITIVE steer → RIGHT turn → negative yaw change (standard right-hand coords)
    const yawRate = -state.steer * steerRate * speedFactor;
    body.angularVelocity.y = Utils.lerp(body.angularVelocity.y, yawRate, 10 * dt);

    // Apply forward thrust
    const fwd = new CANNON.Vec3(
      -Math.sin(body.quaternion.toEuler(new CANNON.Vec3()).y) * state.speed,
      0,
       Math.cos(body.quaternion.toEuler(new CANNON.Vec3()).y) * state.speed
    );
    // Actually easier — extract forward from quaternion
    const q = body.quaternion;
    const fx = -2*(q.x*q.z - q.w*q.y);
    const fz =  1 - 2*(q.x*q.x + q.y*q.y);
    body.velocity.x = fx * state.speed;
    body.velocity.z = fz * state.speed;
    body.velocity.y = Utils.clamp(body.velocity.y, -20, 5);

    // Keep bike locked to ground height
    body.position.y = CFG.groundY + 0.3;

    // Visual lean
    const targetLean = -state.steer * CFG.leanFactor;
    state.lean = Utils.lerp(state.lean, targetLean, 8 * dt);

    // Gear / RPM simulation
    _updateGearRPM(maxSpd);

    // Distance
    state.distanceTravelled += state.speed * dt;

    // Lap counter (track is 800m)
    const lapLength = Track.getTrackLength();
    if (state.distanceTravelled > lapLength * (state.lapsCompleted + 1)) {
      state.lapsCompleted++;
      Utils.emit('lapComplete', { lap: state.lapsCompleted });
    }

    _syncMeshToBody();
  }

  function _updateGearRPM(maxSpd) {
    const numGears = 6;
    const speedPct = state.speed / maxSpd;
    state.gear = Utils.clamp(Math.ceil(speedPct * numGears), 1, numGears);
    const gearBottom = (state.gear - 1) / numGears;
    const gearTop    = state.gear / numGears;
    const rpmPct     = (speedPct - gearBottom) / (gearTop - gearBottom);
    state.rpm = Utils.clamp(rpmPct, 0.2, 1.0);
  }

  function _syncMeshToBody() {
    if (!mesh || !body) return;
    mesh.position.copy(body.position);
    mesh.position.y = CFG.groundY;
    // Apply physics yaw + visual lean (Z roll)
    const euler = new THREE.Euler();
    const q = new THREE.Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
    euler.setFromQuaternion(q, 'YXZ');
    euler.x = 0;
    euler.z = state.lean;
    mesh.quaternion.setFromEuler(euler);

    // Spin wheels based on speed
    mesh.children.forEach(child => {
      if (child.geometry && child.geometry.type === 'TorusGeometry') {
        child.rotation.x += state.speed * 0.06;
      }
    });
  }

  /* ─ Camera follow ─ */
  function updateCamera(dt) {
    if (!mesh) return;
    const offset = new THREE.Vector3(0, 2.2, 6.5);
    offset.applyQuaternion(mesh.quaternion);
    const targetPos = mesh.position.clone().add(offset);
    camera.position.lerp(targetPos, 8 * dt);

    const lookAt = mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    camera.lookAt(lookAt);

    // Speed-based FOV
    const targetFOV = 55 + (state.speed / CFG.maxSpeed) * 25 + (state.nitroActive ? 12 : 0);
    camera.fov = Utils.lerp(camera.fov, targetFOV, 4 * dt);
    camera.updateProjectionMatrix();
  }

  /* ─ Upgrades ─ */
  function repairBike()    { state.health = CFG.maxHealth; Utils.emit('repaired'); }
  function upgradeEngine() { state.engineLevel = Math.min(state.engineLevel + 1, 3); }
  function upgradeTires()  { state.tireLevel   = Math.min(state.tireLevel  + 1, 3); }
  function addNitro()      { state.nitroPips   = Math.min(state.nitroPips  + 3, CFG.maxNitroPips + 3); }

  function getState()   { return state; }
  function getMesh()    { return mesh;  }
  function getCFG()     { return CFG;   }

  return { init, reset, update, updateCamera, applyDamage, repairBike, upgradeEngine, upgradeTires, addNitro, getState, getMesh, getCFG };
})();
