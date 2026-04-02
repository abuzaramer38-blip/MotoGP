/* ═══════════════════════════════════
   bike.js — Player bike mesh + controller
═══════════════════════════════════ */

'use strict';

const Bike = (() => {

  /* ── Tuning ── */
  const CFG = {
    maxSpeed:         90,
    acceleration:     28,
    brakeForce:       55,
    steerSpeed:       1.8,
    steerReturn:      4.5,
    leanFactor:       0.38,
    groundY:          0.52,
    nitroMult:        1.6,
    nitroDuration:    3.0,
    maxNitroPips:     3,
    maxHealth:        100,
    collisionDmg:     18,
    /* Minimum impact velocity that counts as a damaging hit.
       Raised from 3 → 6 to stop resting contacts from dealing damage. */
    minImpactForDmg:  6,
    /* Minimum bike speed (m/s) needed for a collision to hurt.
       Prevents ghost damage while stationary. */
    minSpeedForDmg:   2,
  };

  let mesh   = null;
  let body   = null;
  let scene  = null;
  let camera = null;

  const state = {
    speed: 0,  steer: 0,  lean: 0,
    gear: 1,   rpm: 0,
    health:            CFG.maxHealth,
    nitroPips:         CFG.maxNitroPips,
    nitroTime:         0,
    nitroActive:       false,
    distanceTravelled: 0,
    lapsCompleted:     0,
    raceStartTime:     0,
    isDead:            false,
    engineLevel:       0,
    tireLevel:         0,
  };

  /* ─ Build mesh ─ */
  function _buildMesh() {
    const g = new THREE.Group();

    const bodyMat    = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.2, metalness: 0.8 });
    const fairingMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.3, metalness: 0.6 });
    const chromeMat  = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.95 });
    const rubberMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const glassMat   = new THREE.MeshStandardMaterial({ color: 0x88aaff, roughness: 0.05, transparent: true, opacity: 0.5 });
    const seatMat    = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 });
    const riderMat   = new THREE.MeshStandardMaterial({ color: 0x111120, roughness: 0.9 });

    const add = (geo, mat, px=0, py=0, pz=0, rx=0, ry=0, rz=0, shadow=true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      if (rx || ry || rz) m.rotation.set(rx, ry, rz);
      if (shadow) m.castShadow = true;
      g.add(m);
      return m;
    };

    add(new THREE.BoxGeometry(0.36, 0.28, 1.6), bodyMat);
    add(new THREE.BoxGeometry(0.44, 0.52, 0.9), fairingMat, 0, 0.16, 0.52);
    add(new THREE.BoxGeometry(0.35, 0.28, 0.06), glassMat, 0, 0.4, 0.44, 0,0,0, false);
    add(new THREE.BoxGeometry(0.28, 0.22, 0.72), fairingMat, 0, 0.12, -0.64);
    add(new THREE.BoxGeometry(0.24, 0.08, 0.56), seatMat, 0, 0.26, -0.22, 0,0,0, false);

    for (const sx of [-0.12, 0.12]) {
      add(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8), chromeMat, sx, -0.09, -0.5, 0, 0, Math.PI/2);
    }
    for (const sx of [-0.14, 0.14]) {
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), chromeMat, sx, -0.08, 0.72, 0.22);
    }

    const wheelGeo = new THREE.TorusGeometry(0.32, 0.1, 12, 24);
    add(wheelGeo, rubberMat, 0, -0.18,  0.75, 0, Math.PI/2, 0);
    add(wheelGeo, rubberMat, 0, -0.18, -0.78, 0, Math.PI/2, 0);

    const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.14, 16);
    for (const wz of [0.75, -0.78]) {
      add(hubGeo, chromeMat, 0, -0.18, wz, Math.PI/2);
    }

    add(new THREE.BoxGeometry(0.28, 0.44, 0.36), riderMat, 0, 0.5, 0.1, -0.45);
    add(new THREE.SphereGeometry(0.18, 12, 8), riderMat, 0, 0.82, 0.16);

    return g;
  }

  /* ─ init ─ */
  function init(threeScene, threeCamera) {
    scene  = threeScene;
    camera = threeCamera;
    reset();
  }

  function reset() {
    if (mesh) scene.remove(mesh);
    if (body) {
      body.removeEventListener('collide', _onCollide);
      Physics.getWorld().remove(body);
    }

    Object.assign(state, {
      speed: 0, steer: 0, lean: 0, gear: 1, rpm: 0,
      health:            CFG.maxHealth,
      nitroPips:         CFG.maxNitroPips,
      nitroTime:         0,
      nitroActive:       false,
      distanceTravelled: 0,
      lapsCompleted:     0,
      raceStartTime:     performance.now(),
      isDead:            false,
    });

    mesh = _buildMesh();
    mesh.position.set(0, CFG.groundY, -2);
    mesh.castShadow = true;
    scene.add(mesh);

    /* FIX: spawn y raised to CFG.groundY + 0.6 (was + 0.3).
     * The compound body's half-height is ~0.3, so + 0.3 placed its
     * bottom face flush with the ground plane, causing an immediate
     * resting-contact collision event at frame 0 that drained health.
     * + 0.6 gives a small air-gap so the bike settles naturally.       */
    body = Physics.createBikeBody({ x: 0, y: CFG.groundY + 0.6, z: -2 });
    body._isBike = true;
    body.addEventListener('collide', _onCollide);

    _lastCollideTime = 0;
  }

  /* ─ Collision handler ──────────────────────────────────────────────────────
   *
   * FIX — Ghost damage while standing still:
   *
   * Root cause: the ground plane is a static body whose collision event fires
   * every physics step while the bike rests on it.  Previously there was no
   * distinction between "hit a barrier" and "touching the road", so every
   * resting contact accumulated damage.
   *
   * Fixes applied:
   *  1. Skip any contact with a body tagged _isGround (the road surface).
   *  2. Require state.speed > CFG.minSpeedForDmg — no damage while parked.
   *  3. Raised impact threshold: CFG.minImpactForDmg (6) instead of 3.
   *  4. Debounce window widened to 0.6 s.
   */
  let _lastCollideTime = 0;
  function _onCollide(e) {
    const now = performance.now() / 1000;
    if (now - _lastCollideTime < 0.6) return;

    if (state.isDead) return;

    /* ── Filter 1: skip ground contacts ── */
    const other = e.body;
    if (!other || other._isGround) return;

    /* ── Filter 2: bike must be moving ── */
    if (state.speed < CFG.minSpeedForDmg) return;

    /* ── Filter 3: impact velocity threshold ── */
    const impact = e.contact.getImpactVelocityAlongNormal();
    if (Math.abs(impact) < CFG.minImpactForDmg) return;

    _lastCollideTime = now;

    const dmg = Math.min(CFG.collisionDmg * (Math.abs(impact) / 12), 35);
    applyDamage(dmg);

    /* Bounce back */
    body.velocity.set(
      -body.velocity.x * 0.6,
       body.velocity.y * 0.3,
      -body.velocity.z * 0.5
    );
    state.speed *= 0.35;
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

  /* ─ Update ─ */
  function update(dt, input) {
    if (state.isDead) { _syncMeshToBody(); return; }

    const engineBoost = 1 + state.engineLevel * 0.15;
    const tireGrip    = 1 + state.tireLevel   * 0.12;

    /* Nitro */
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

    /* Throttle / Brake */
    if (input.throttle) {
      state.speed += CFG.acceleration * engineBoost * dt;
    } else if (input.brake) {
      state.speed -= CFG.brakeForce * dt;
    } else {
      state.speed -= (state.speed > 0 ? 14 : 0) * dt;
    }
    state.speed = Utils.clamp(state.speed, 0, maxSpd);

    /* Steering */
    const steerTarget = input.left ? -1 : (input.right ? 1 : 0);
    const speedFactor = Utils.clamp(state.speed / 30, 0.2, 1.0);
    const steerRate   = CFG.steerSpeed * speedFactor * tireGrip;

    state.steer = steerTarget !== 0
      ? Utils.lerp(state.steer, steerTarget, steerRate * dt * 2.2)
      : Utils.lerp(state.steer, 0, CFG.steerReturn * dt);
    state.steer = Utils.clamp(state.steer, -1, 1);

    const yawRate = -state.steer * steerRate * speedFactor;
    body.angularVelocity.y = Utils.lerp(body.angularVelocity.y, yawRate, 10 * dt);

    /* Forward velocity — derived from quaternion directly.
     * (The old dead-code "fwd" variable called toEuler().y which
     *  returns undefined in Cannon 0.6.2 and would have crashed.) */
    const q  = body.quaternion;
    const fx = -2 * (q.x * q.z - q.w * q.y);
    const fz =  1  - 2 * (q.x * q.x + q.y * q.y);
    body.velocity.x = fx * state.speed;
    body.velocity.z = fz * state.speed;
    body.velocity.y = Utils.clamp(body.velocity.y, -20, 5);

    /* Lock ride height */
    body.position.y = CFG.groundY + 0.3;

    /* Visual lean */
    state.lean = Utils.lerp(state.lean, -state.steer * CFG.leanFactor, 8 * dt);

    _updateGearRPM(maxSpd);
    state.distanceTravelled += state.speed * dt;

    const lapLen = Track.getTrackLength();
    if (state.distanceTravelled > lapLen * (state.lapsCompleted + 1)) {
      state.lapsCompleted++;
      Utils.emit('lapComplete', { lap: state.lapsCompleted });
    }

    _syncMeshToBody();
  }

  function _updateGearRPM(maxSpd) {
    const n         = 6;
    const pct       = state.speed / maxSpd;
    state.gear      = Utils.clamp(Math.ceil(pct * n), 1, n);
    const bot       = (state.gear - 1) / n;
    const top       =  state.gear      / n;
    state.rpm       = Utils.clamp((pct - bot) / (top - bot), 0.2, 1.0);
  }

  function _syncMeshToBody() {
    if (!mesh || !body) return;
    mesh.position.copy(body.position);
    mesh.position.y = CFG.groundY;

    const euler = new THREE.Euler();
    const q = new THREE.Quaternion(
      body.quaternion.x, body.quaternion.y,
      body.quaternion.z, body.quaternion.w
    );
    euler.setFromQuaternion(q, 'YXZ');
    euler.x = 0;
    euler.z = state.lean;
    mesh.quaternion.setFromEuler(euler);

    mesh.children.forEach(child => {
      if (child.geometry && child.geometry.type === 'TorusGeometry') {
        child.rotation.x += state.speed * 0.06;
      }
    });
  }

  /* ─ Camera ─ */
  function updateCamera(dt) {
    if (!mesh) return;
    const offset = new THREE.Vector3(0, 2.2, 6.5);
    offset.applyQuaternion(mesh.quaternion);
    camera.position.lerp(mesh.position.clone().add(offset), 8 * dt);
    camera.lookAt(mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)));

    const targetFOV = 55 + (state.speed / CFG.maxSpeed) * 25 + (state.nitroActive ? 12 : 0);
    camera.fov = Utils.lerp(camera.fov, targetFOV, 4 * dt);
    camera.updateProjectionMatrix();
  }

  /* ─ Upgrades ─ */
  function repairBike()    { state.health     = CFG.maxHealth;               Utils.emit('repaired'); }
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
