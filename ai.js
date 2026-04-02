/* ═══════════════════════════════════
   ai.js — AI rival bikes
═══════════════════════════════════ */

'use strict';

const AI = (() => {

  const rivals = [];
  let scene = null;

  const COLORS = [0x1155cc, 0x22aa44, 0xddaa00, 0x883388, 0x00aacc];

  function init(threeScene) {
    scene = threeScene;
    rivals.length = 0;
  }

  function spawnRivals(count = 4) {
    _clearRivals();
    for (let i = 0; i < count; i++) {
      const color = COLORS[i % COLORS.length];
      const offset = -(i + 1) * 8;
      const laneX  = (i % 2 === 0 ? 1 : -1) * Utils.randomRange(1.5, 3.5);

      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
      const g   = new THREE.Group();

      // Simple rival bike — box body + wheels
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 1.5), mat);
      chassis.castShadow = true;
      g.add(chassis);

      const wMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const wGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
      for (const wz of [0.65, -0.65]) {
        const w = new THREE.Mesh(wGeo, wMat);
        w.rotation.y = Math.PI / 2;
        w.position.set(0, -0.18, wz);
        w.castShadow = true;
        g.add(w);
      }

      // Rider
      const rMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const rider = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.34), rMat);
      rider.position.set(0, 0.48, 0.1);
      rider.rotation.x = -0.4;
      rider.castShadow = true;
      g.add(rider);

      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat);
      helmet.position.set(0, 0.78, 0.15);
      helmet.castShadow = true;
      g.add(helmet);

      g.position.set(laneX, 0.52, offset);
      scene.add(g);

      rivals.push({
        mesh: g,
        speed: Utils.randomRange(28, 42),
        steer: 0,
        laneX,
        targetLaneX: laneX,
        laneChangeTimer: Utils.randomRange(3, 8),
        lean: 0,
      });
    }
  }

  function update(dt) {
    for (const r of rivals) {
      // Lane change logic
      r.laneChangeTimer -= dt;
      if (r.laneChangeTimer <= 0) {
        r.targetLaneX = Utils.randomRange(-3.5, 3.5);
        r.laneChangeTimer = Utils.randomRange(3, 10);
      }

      r.laneX = Utils.lerp(r.laneX, r.targetLaneX, 1.2 * dt);
      const dx = r.targetLaneX - r.laneX;
      r.steer = Utils.clamp(dx * 0.4, -0.5, 0.5);
      r.lean  = Utils.lerp(r.lean, -r.steer * 0.3, 6 * dt);

      r.mesh.position.x = r.laneX;
      r.mesh.position.z -= r.speed * dt;
      r.mesh.rotation.z  = r.lean;

      // Loop rival ahead of player after passing
      const bikeZ = Bike.getMesh() ? Bike.getMesh().position.z : 0;
      if (r.mesh.position.z > bikeZ + 20) {
        r.mesh.position.z = bikeZ - Utils.randomRange(120, 200);
      }

      // Spin wheels
      r.mesh.children.forEach(c => {
        if (c.geometry && c.geometry.type === 'TorusGeometry') c.rotation.x += r.speed * 0.06 * dt;
      });
    }
  }

  function _clearRivals() {
    for (const r of rivals) scene.remove(r.mesh);
    rivals.length = 0;
  }

  function reset() { _clearRivals(); }

  return { init, spawnRivals, update, reset };
})();
