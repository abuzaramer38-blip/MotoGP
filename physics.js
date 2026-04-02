/* ═══════════════════════════════════
   physics.js — Cannon.js world setup
   & sync utilities
═══════════════════════════════════ */

'use strict';

const Physics = (() => {

  let world = null;
  const bodies    = [];   // { body, mesh, offset }
  const fixedStep = 1 / 60;
  const maxSubSteps = 3;

  /* ─ Init ─ */
  function init() {
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    world.defaultContactMaterial.friction    = 0.4;
    world.defaultContactMaterial.restitution = 0.1;

    // Materials
    const groundMat  = new CANNON.Material('ground');
    const bikeMat    = new CANNON.Material('bike');
    const barrierMat = new CANNON.Material('barrier');

    // Ground ↔ Bike contact
    const cm = new CANNON.ContactMaterial(groundMat, bikeMat, {
      friction: 0.6,
      restitution: 0.05,
      contactEquationStiffness:  1e8,
      contactEquationRelaxation: 3,
    });
    world.addContactMaterial(cm);

    // Barrier ↔ Bike contact
    const bcm = new CANNON.ContactMaterial(barrierMat, bikeMat, {
      friction: 0.3,
      restitution: 0.2,
      contactEquationStiffness: 1e9,
    });
    world.addContactMaterial(bcm);

    // Stash materials on world for convenience
    world._groundMat  = groundMat;
    world._bikeMat    = bikeMat;
    world._barrierMat = barrierMat;

    return world;
  }

  /* Register a body+mesh pair for auto-sync */
  function register(body, mesh, offset = { x: 0, y: 0, z: 0 }) {
    bodies.push({ body, mesh, offset });
    world.addBody(body);
  }

  /* Remove a body+mesh pair */
  function unregister(body) {
    const idx = bodies.findIndex(b => b.body === body);
    if (idx !== -1) bodies.splice(idx, 1);
    world.remove(body);
  }

  /* Step + sync — call once per frame with delta in seconds */
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

  /* Static ground plane */
  function createGround() {
    const shape = new CANNON.Plane();
    const body  = new CANNON.Body({ mass: 0, material: world._groundMat });
    body.addShape(shape);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(body);
    return body;
  }

  /* Static AABB box — barriers & edge obstacles */
  function createStaticBox(hw, hh, hd, pos, mat) {
    const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd));
    const body  = new CANNON.Body({ mass: 0, material: mat || world._barrierMat });
    body.addShape(shape);
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);
    return body;
  }

  /* Player bike rigid body
   *
   * FIX (was crashing at old line 124):
   *   Cannon.js 0.6.2 does NOT pre-initialise Body.angularFactor as a Vec3,
   *   so calling body.angularFactor.set(...) throws
   *     "Cannot read properties of undefined (reading 'set')"
   *   Solution: assign a brand-new CANNON.Vec3 instead of mutating in-place.
   */
  function createBikeBody(pos) {
    const body = new CANNON.Body({ mass: 220, material: world._bikeMat });

    // Compound chassis: main box + front stub + rear stub
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
    body.angularDamping = 0.98;   // heavy damping prevents tumbling
    body.allowSleep     = false;

    // ── KEY FIX ──────────────────────────────────────────────────────────────
    // Assign a new Vec3 rather than calling .set() on the (undefined) property.
    // This restricts X/Z angular freedom so the bike doesn't cartwheel.
    body.angularFactor = new CANNON.Vec3(0.02, 1, 0.02);
    // ─────────────────────────────────────────────────────────────────────────

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
