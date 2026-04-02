/* physics.js - Fixed */
'use strict';

const Physics = (() => {
  let world = null;
  
  function init() {
    if (world) return world; // Agar pehle se bana hai toh wahi dedo
    
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    
    // Materials setup
    const groundMat = new CANNON.Material('ground');
    const bikeMat   = new CANNON.Material('bike');
    const cm = new CANNON.ContactMaterial(groundMat, bikeMat, {
      friction: 0.6,
      restitution: 0.05
    });
    world.addContactMaterial(cm);
    
    world._groundMat = groundMat;
    world._bikeMat = bikeMat;
    
    return world;
  }

  function step(dt) {
    if (world) world.step(1/60, dt, 3);
  }

  function createBikeBody(pos) {
    if (!world) init(); 
    const body = new CANNON.Body({ mass: 220, material: world._bikeMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.3, 0.9)));
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);
    return body;
  }

  function createStaticBox(hw, hh, hd, pos) {
    if (!world) init();
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hw, hh, hd)));
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);
    return body;
  }

  return { init, step, createBikeBody, createStaticBox, getWorld: () => world };
})();
