/* ═══════════════════════════════════
   physics.js — Cannon.js world setup
   & sync utilities
═══════════════════════════════════ */

'use strict';

const Physics = (() => {

  let world = null;
  const bodies   = [];   // { body, mesh, offset }
  const fixedStep = 1 / 60;
  const maxSubSteps = 3;
  let accumulator = 0;

  function init() {
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);           // strong gravity for feel
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    world.defaultContactMaterial.friction = 0.4;
    world.defaultContactMaterial.restitution = 0.1;

    // Ground contact material
    const groundMat = new CANNON.Material('ground');
    const bikeMat   = new CANNON.Material('bike');
    const cm = new CANNON.ContactMaterial(groundMat, bikeMat, {
      friction: 0.6,
      restitution: 0.05,
      contactEquationStiffness: 1e8,
      contactEquationRelaxation: 3,
    });
    world.addContactMaterial(cm);
    world._groundMat = groundMat;
    world._bikeMat   = bikeMat;

    const barrierMat = new CANNON.Material('barrier');
    const bcm = new CANNON.ContactMaterial(barrierMat, bikeMat, {
      friction: 0.3,
      restitution: 0.2,
      contactEquationStiffness: 1e9,
    });
    world.addContactMaterial(bcm);
    world._barrierMat = barrierMat;

    return world;
  }

  /* Register a body+mesh pair for sync */
  function register(body, mesh, offset = { x:0,y:0,z:0 }) {
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
    // Sync all registered pairs
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

  /* Create a static ground plane */
  function createGround() {
    const shape = new CANNON.Plane();
    const body  = new CANNON.Body({ mass: 0, material: world._groundMat });
    body.addShape(shape);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
    world.addBody(body);
    return body;
  }

  /* Create a static box — used for barriers & obstacles */
  function createStaticBox(hw, hh, hd, pos, mat) {
    const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd));
    const body  = new CANNON.Body({ mass: 0, material: mat || world._barrierMat });
    body.addShape(shape);
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);
    return body;
  }

  /* Create the bike rigid body */
  function createBikeBody(pos) {
    const body = new CANNON.Body({ mass: 180, material: world._bikeMat });

    // Single box collider sized to the visible chassis — simple and reliable
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.35, 0.95)));

    body.position.set(pos.x, pos.y, pos.z);

    // High damping keeps it planted
    body.linearDamping  = 0.6;
    body.angularDamping = 0.9999;  // near-total rotational damping

    // CRITICAL: lock X and Z rotation axes completely — bike can NEVER flip or tip
    body.angularFactor.set(0, 1, 0);  // only Y (yaw) is allowed to rotate

    body.allowSleep = false;
    world.addBody(body);
    return body;
  }

  function getWorld() { return world; }

  return { init, register, unregister, step, createGround, createStaticBox, createBikeBody, getWorld };
})();
