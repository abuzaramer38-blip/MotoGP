/* ═══════════════════════════════════
   bike.js — Player bike mesh + controller
═══════════════════════════════════ */

'use strict';

const Bike = (() => {

  /* ── Tuning constants ── */
  const CFG = {
    maxSpeed:         90,   // m/s ≈ 324 km/h
    acceleration:     28,
    brakeForce:       55,
    steerSpeed:       1.8,  // rad/s max yaw rate
    steerReturn:      4.5,  // how fast steering centres
    leanFactor:       0.38, // visual lean per steering input
    //
    // FIX #3 — spawn height.
    // Was 0.52, which placed the physics body partially inside the track mesh,
    // causing immediate ground-contact impulses on spawn. Changed to 1.0 so
    // the body drops cleanly onto the surface before gameplay begins.
    groundY:          1.0,
    //
    nitroMult:        1.6,
    nitroDuration:    3.0,  // seconds
    maxNitroPips:     3,
    maxHealth:        100,
    collisionDmg:     18,
    collisionImpulse: 12,
    //
    // FIX #1 — damage threshold.
    // Was 3 m/s.  The physics body is pinned to groundY every frame, so Cannon
    // registers a continuous ground contact at ~2–4 m/s impact velocity.
    // Raising to 5 m/s filters out all ground-contact noise while still
    // registering real wall/barrier impacts at racing speed.
    impactThreshold:  5,
  };

  let mesh   = null;   // THREE.Group
  let body   = null;   // CANNON.Body
  let scene  = null;
  let camera = null;

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
    engineLevel: 0,
    tireLevel: 0,
  };

  /* ─ Build the 3-D bike mesh ─ */
  function _buildMesh() {
    const g = new THREE.Group();

    const bodyMat    = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.2, metalness: 0.8 });
    const fairingMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.3, metalness: 0.6 });
    const chromeMat  = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.95 });
    const rubberMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.0 });
    const glassMat   = new THREE.MeshStandardMaterial({ color: 0x88aaff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
    const seatMat    = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 1.6), bodyMat);
    chassis.castShadow = true;
    g.add(chassis);

    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.9), fairingMat);
    fairing.position.set(0, 0.16, 0.52);
    fairing.castShadow = true;
    g.add(fairing);

    const wscreen = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.06), glassMat);
    wscreen.position.set(0, 0.4, 0.44);
    g.add(wscreen);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.72), fairingMat);
    tail.position.set(0, 0.12, -0.64);
    tail.castShadow = true;
    g.add(tail);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.56), seatMat);
    seat.position.set(0, 0.26, -0.22);
    g.add(seat);

    for (const sx of [-0.12, 0.12]) {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), chromeMat);
      exhaust.rotation.z = Math.PI / 2;
      exhaust.position.set(sx, -0.09, -0.5);
      exhaust.castShadow = true;
      g.add(exhaust);
    }

    for (const sx of [-0.14, 0.14]) {
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), chromeMat);
      fork.position.set(sx, -0.08, 0.72);
      fork.rotation.x = 0.22;
      g.add(fork);
    }

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
    if (mesh) scene.remove(mesh);
    if (body) Physics.getWorld().remove(body);

    state.speed            = 0;
    state.steer            = 0;
    state.lean             = 0;
    state.gear             = 1;
    state.rpm              = 0;
    state.health           = CFG.maxHealth;
    state.nitroPips        = CFG.maxNitroPips;
    state.nitroTime        = 0;
    state.nitroActive      = false;
    state.distanceTravelled = 0;
    state.lapsCompleted    = 0;
    state.raceStartTime    = performance.now();
    state.lastDmgTime      = -5;
    state.isDead           = false;
    _lastCollideTime       = 0;   // reset debounce timer on race restart

    const { group } = _buildMesh();
    mesh = group;
    mesh.position.set(0, CFG.groundY, -2);
    mesh.castShadow = true;
    scene.add(mesh);

    // FIX #3 — body spawns 1 unit above groundY so it falls onto the surface
    // instead of being embedded in it, eliminating phantom spawn-collisions.
    body = Physics.createBikeBody({ x: 0, y: CFG.groundY + 1.0, z: -2 });
    body._isBike = true;
    body.addEventListener('collide', _onCollide);
  }

  /* ─ Collision handler ─ */
  let _lastCollideTime = 0;

  function _onCollide(e) {
    const now = performance.now() / 1000;
    if (now - _lastCollideTime < 0.4) return;  // debounce
    if (state.isDead) return;

    const impact = e.contact.getImpactVelocityAlongNormal();

    // FIX #1a — threshold raised from 3 → 5 m/s to ignore ground friction.
    if (Math.abs(impact) < CFG.impactThreshold) return;

    // FIX #1b — ignore contacts with a predominantly vertical normal.
    // The contact normal `ni` points from body B toward body A. A ground
    // contact has |ny| close to 1.0; a wall/barrier contact has |ny| near 0.
    // Rejecting |ny| > 0.7 makes the ground surface completely damage-immune.
    const ny = e.contact.ni.y;
    if (Math.abs(ny) > 0.7) return;

    _lastCollideTime = now;

    const dmg = Math.min(CFG.collisionDmg * (Math.abs(impact) / 10), 35);
    applyDamage(dmg);

    // Bounce-back (horizontal plane only)
    body.velocity.set(
      -body.velocity.x * 0.6,
       body.velocity.y * 0.3,
      -body.velocity.z * 0.5
    );
    state.speed *= 0.35;

    Utils.emit('cameraShake', { intensity: 0.6 });
  }

  function applyDamage(amount) {
    if (state.isDead) return;
    state.health = Math.max(0, state.health - amount);
    Utils.emit('damage', { health: state.health, amount });
    if (state.health <= 0) {
      state.isDead = true;
      state.speed  = 0;
      Utils.emit('engineBlown');
    }
  }

  /* ─ Update (called every frame) ─ */
  function update(dt, input) {
    if (state.isDead) { _syncMeshToBody(); return; }

    const engineBoost = 1 + state.engineLevel * 0.15;
    const tireGrip    = 1 + state.tireLevel   * 0.12;

    // ── Nitro ──
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

    // ── Throttle / Brake ──
    // FIX #2a — brake logic is structurally correct but was masked by the
    // inverted velocity in FIX #2b. Both paths are now explicit and symmetric.
    if (input.throttle) {
      state.speed += CFG.acceleration * engineBoost * dt;
    } else if (input.brake) {
      state.speed -= CFG.brakeForce * dt;
    } else {
      // Engine braking / passive drag
      state.speed -= 14 * dt;
    }
    // No reverse — clamp to [0, maxSpd]
    state.speed = Utils.clamp(state.speed, 0, maxSpd);

    // ── Steering ──
    // Left input → steerTarget −1 → leftward turn ✓
    // Right input → steerTarget +1 → rightward turn ✓
    const steerTarget = input.left ? -1 : (input.right ? 1 : 0);
    const speedFactor = Utils.clamp(state.speed / 30, 0.2, 1.0);
    const steerRate   = CFG.steerSpeed * speedFactor * tireGrip;

    if (steerTarget !== 0) {
      state.steer = Utils.lerp(state.steer, steerTarget, steerRate * dt * 2.2);
    } else {
      state.steer = Utils.lerp(state.steer, 0, CFG.steerReturn * dt);
    }
    state.steer = Utils.clamp(state.steer, -1, 1);

    // Yaw: right steer → negative angular velocity → body rotates right (Y-up RH coords) ✓
    const yawRate = -state.steer * steerRate * speedFactor;
    body.angularVelocity.y = Utils.lerp(body.angularVelocity.y, yawRate, 10 * dt);

    // ── Forward velocity  (FIX #2b — was driving backwards) ──
    //
    // The previous code used:
    //   fx = -2*(q.x*q.z - q.w*q.y)   →  rotates local +X, not local -Z
    //   fz =  1 - 2*(q.x² + q.y²)     →  rotates local +Z  (forward = +Z = WRONG)
    //
    // In Three.js / Cannon the default "forward" for a mesh facing down -Z is
    // the -Z axis.  Rotating the unit vector (0, 0, -1) by quaternion q gives:
    //
    //   world_forward_x =  2*(q.w*q.y + q.x*q.z)
    //   world_forward_z = -(1 - 2*(q.x² + q.y²))
    //
    // Equivalently (and more legibly), extract the yaw angle and use sin/cos.
    // Since we zero out pitch/roll in _syncMeshToBody the body is yaw-only,
    // so both approaches are numerically identical.  atan2 form chosen for
    // clarity — it is trivially verifiable by inspection:
    //
    //   yaw = 0    → sin(0)=0,  cos(0)=1  → fz=-1  → moves in -Z ✓
    //   yaw = π/2  → sin=1, cos=0         → fx=-1  → moves in -X (right turn) ✓
    //
    const q   = body.quaternion;
    const yaw = Math.atan2(
      2 * (q.w * q.y - q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z)
    );
    // Local -Z world direction
    const fx = -Math.sin(yaw);  // was: -2*(q.x*q.z - q.w*q.y) — wrong
    const fz = -Math.cos(yaw);  // was:  1 - 2*(q.x²+q.y²)      — wrong sign

    body.velocity.x = fx * state.speed;
    body.velocity.z = fz * state.speed;
    body.velocity.y = Utils.clamp(body.velocity.y, -20, 5);

    // Pin to ground — prevents sinking or bouncing
    body.position.y = CFG.groundY;

    // ── Visual lean ──
    const targetLean = -state.steer * CFG.leanFactor;
    state.lean = Utils.lerp(state.lean, targetLean, 8 * dt);

    _updateGearRPM(maxSpd);
    state.distanceTravelled += state.speed * dt;

    const lapLength = Track.getTrackLength();
    if (state.distanceTravelled > lapLength * (state.lapsCompleted + 1)) {
      state.lapsCompleted++;
      Utils.emit('lapComplete', { lap: state.lapsCompleted });
    }

    _syncMeshToBody();
  }

  function _updateGearRPM(maxSpd) {
    const numGears   = 6;
    const speedPct   = state.speed / maxSpd;
    state.gear       = Utils.clamp(Math.ceil(speedPct * numGears), 1, numGears);
    const gearBottom = (state.gear - 1) / numGears;
    const gearTop    =  state.gear      / numGears;
    const rpmPct     = (speedPct - gearBottom) / (gearTop - gearBottom);
    state.rpm        = Utils.clamp(rpmPct, 0.2, 1.0);
  }

  function _syncMeshToBody() {
    if (!mesh || !body) return;

    // Snap XZ to physics, hold Y at visual ride height
    mesh.position.x = body.position.x;
    mesh.position.y = CFG.groundY;
    mesh.position.z = body.position.z;

    // Yaw from physics body; zero pitch; apply visual lean on Z
    const q = new THREE.Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    euler.x = 0;
    euler.z = state.lean;
    mesh.quaternion.setFromEuler(euler);

    // Wheel spin
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
    camera.lookAt(mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)));

    const targetFOV = 55
      + (state.speed / CFG.maxSpeed) * 25
      + (state.nitroActive ? 12 : 0);
    camera.fov = Utils.lerp(camera.fov, targetFOV, 4 * dt);
    camera.updateProjectionMatrix();
  }

  /* ─ Upgrades ─ */
  function repairBike()    { state.health      = CFG.maxHealth;                        Utils.emit('repaired'); }
  function upgradeEngine() { state.engineLevel = Math.min(state.engineLevel + 1, 3); }
  function upgradeTires()  { state.tireLevel   = Math.min(state.tireLevel   + 1, 3); }
  function addNitro()      { state.nitroPips   = Math.min(state.nitroPips   + 3, CFG.maxNitroPips + 3); }

  function getState() { return state; }
  function getMesh()  { return mesh;  }
  function getCFG()   { return CFG;   }

  return {
    init, reset, update, updateCamera,
    applyDamage, repairBike, upgradeEngine, upgradeTires, addNitro,
    getState, getMesh, getCFG,
  };
})();
