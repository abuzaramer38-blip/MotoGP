/* physics.js - Fixed */
'use strict';

const Physics = (() => {
  let world = null;
  const bodies = [];
  
  function init() {
    world = new CANNON.World();
    if (world) {
      world.gravity.set(0, -20, 0);
      world.broadphase = new CANNON.SAPBroadphase(world);
      world.solver.iterations = 20;
      world.defaultContactMaterial.friction = 0.4;
      world.defaultContactMaterial.restitution = 0.1;
      
      const groundMat = new CANNON.Material('ground');
      const bikeMat   = new CANNON.Material('bike');
      const cm = new CANNON.ContactMaterial(groundMat, bikeMat, {
        friction: 0.6,
        restitution: 0.05
      });
      world.addContactMaterial(cm);
      world._groundMat = groundMat;
      world._bikeMat = bikeMat;
    }
    return world;
  }

  function step(dt) {
    if (world) world.step(1/60, dt, 3);
  }

  function createBikeBody(pos) {
    if (!world) init(); // Safety check
    const body = new CANNON.Body({ mass: 220, material: world._bikeMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.3, 0.9)));
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);
    return body;
  }

  return { init, step, createBikeBody, getWorld: () => world };
})();
