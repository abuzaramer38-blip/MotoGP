/* ═══════════════════════════════════
   physics.js — Cannon.js world setup
   & sync utilities
═══════════════════════════════════ */

'use strict';

const Physics = (() => {

  let world = null;
  const bodies      = [];   // { body, mesh, offset }
  const fixedStep   = 1 / 60;
  const maxSubSteps = 3;

  /* ─────────────────────────────────────
     init — must be called FIRST
  ───────────────────────────────────── */
  function init() {
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase        = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    world.defaultContactMaterial.friction    = 0.4;
    world.defaultContactMaterial.restitution = 0.1;

    const groundMat  = new CANNON.Material('ground');
    const bikeMat    = new CANNON.Material('bike');
    const barrierMat = new CANNON.Material('barrier');

    /* Ground ↔ Bike: very low restitution so it doesn't bounce-damage */
    world.addContactMaterial(new CANNON.ContactMaterial(groundMat, bikeMat, {
      friction:                   0.6,
      restitution:                0.02,
      contactEquationStiffness:   1e8,
      contactEquationRelaxation:  3,
    }));

    /* Barrier ↔ Bike: stiffer, slight bounce */
    world.addContactMaterial(new CANNON.ContactMaterial(barrierMat, bikeMat, {
      friction:                  0.3,
      restitution:               0.2,
      contactEquationStiffness:  1e9,
    }));

    world._groundMat  = groundMat;
    world._bikeMat    = bikeMat;
    world._barrierMat = barrierMat;

    return world;
  }

  function register(body, mesh, offset = { x: 0, y: 0, z: 0 }) {
    bodies.push({ body, mesh, offset });
    world.addBody(body);
  }

  function unregister(body) {
    const idx = bodies.findIndex(b => b.body === body);
    if (idx !== -1) bodies.splice(idx, 1);
    world.remove(body);
  }

  function step(dt) {
    if (!world) return;
    world.step(fixedStep, dt, maxSubSteps);
    for (const { body, mesh, offset } of bodies) {
      if (!mesh) continue;
      mesh.position.set(
        body.position.x + offset.x,
        body.position.y + offset.y,
        body.position.z + offset.z
      );
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
    }
  }

  /* ── Static ground plane ──────────────────────────────────────────────────
   * TAGGED with _isGround = true so that bike.js _onCollide() can identify
   * and skip this body — fixes the "health drains while standing still" bug.
   * Without this tag every resting contact frame fires a damage event.
   */
  function createGround() {
    const shape = new CANNON.Plane();
    const body  = new CANNON.Body({ mass: 0, material: world._groundMat });
    body.addShape(shape);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    body._isGround = true;          // ← collision filter tag
    world.addBody(body);
    return body;
  }

  /* ── Static AABB box (barriers, cones, tyre stacks) ─────────────────────
   * TAGGED with _isBarrier = true for the same filtering reason.
   */
  function createStaticBox(hw, hh, hd, pos, mat) {
    const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd));
    const body  = new CANNON.Body({ mass: 0, material: mat || world._barrierMat });
    body.addShape(shape);
    body.position.set(pos.x, pos.y, pos.z);
    body._isBarrier = true;         // ← collision filter tag
    world.addBody(body);
    return body;
  }

  /* ── Player bike rigid body ───────────────────────────────────────────────
   * angularFactor assigned as a NEW Vec3 (not .set on undefined) — that was
   * the original crash fix from the previous session.
   */
  function createBikeBody(pos) {
    const body = new CANNON.Body({ mass: 220, material: world._bikeMat });

    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.3,  0.9)));
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(0.15, 0.2, 0.4)),
      new CANNON.Vec3(0, -0.05, 0.85)
    );
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(0.15, 0.2, 0.35)),
      new CANNON.Vec3(0, -0.05, -0.85)
    );

    body.position.set(pos.x, pos.y, pos.z);
    body.linearDamping  = 0.4;
    body.angularDamping = 0.98;
    body.allowSleep     = false;

    body.angularFactor = new CANNON.Vec3(0.02, 1, 0.02);
    body._isBike       = true;

    world.addBody(body);
    return body;
  }

  function getWorld() { return world; }

  return {
    init,
    register,
    unregister,
    step,
    createGround,
    createStaticBox,
    createBikeBody,
    getWorld,
  };
})();
