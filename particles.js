/* ═══════════════════════════════════
   particles.js — Sparks, smoke, etc.
═══════════════════════════════════ */

'use strict';

const Particles = (() => {

  let scene = null;
  const pools = { sparks: [], smoke: [], exhaust: [] };
  const active = [];

  const SPARK_MAT = new THREE.PointsMaterial({
    color: 0xffaa00,
    size: 0.12,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const SMOKE_MAT = new THREE.PointsMaterial({
    color: 0x888888,
    size: 0.35,
    transparent: true,
    opacity: 0.5,
    blending: THREE.NormalBlending,
    depthWrite: false,
  });
  const EXHAUST_MAT = new THREE.PointsMaterial({
    color: 0x4444aa,
    size: 0.18,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  function init(threeScene) {
    scene = threeScene;
  }

  function _getParticleGeo(count) {
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }

  /* Emit a burst of sparks at position */
  function sparks(pos, count = 40) {
    const geo = _getParticleGeo(count);
    const pts = new THREE.Points(geo, SPARK_MAT.clone());
    pts.position.copy(pos);
    scene.add(pts);

    const vels = [];
    for (let i = 0; i < count; i++) {
      vels.push({
        x: (Math.random() - 0.5) * 8,
        y: Math.random() * 6 + 1,
        z: (Math.random() - 0.5) * 8,
      });
    }

    active.push({
      type: 'sparks',
      pts,
      vels,
      age: 0,
      maxAge: 0.7,
      count,
    });
  }

  /* Smoke cloud */
  function smoke(pos, count = 60) {
    const geo = _getParticleGeo(count);
    const pts = new THREE.Points(geo, SMOKE_MAT.clone());
    pts.position.copy(pos);
    scene.add(pts);

    const vels = [];
    for (let i = 0; i < count; i++) {
      vels.push({
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 3 + 0.5,
        z: (Math.random() - 0.5) * 2,
      });
    }

    active.push({
      type: 'smoke',
      pts,
      vels,
      age: 0,
      maxAge: 2.0,
      count,
    });
  }

  /* Exhaust trail (continuous, called every frame) */
  let exhaustTimer = 0;
  function updateExhaust(bikePos, bikeSpeed, dt) {
    exhaustTimer += dt;
    if (exhaustTimer < 0.05) return;
    exhaustTimer = 0;
    if (bikeSpeed < 5) return;

    const count = 8;
    const geo = _getParticleGeo(count);
    const pts = new THREE.Points(geo, EXHAUST_MAT.clone());
    pts.position.copy(bikePos).add(new THREE.Vector3(0, 0.1, 0.9));
    scene.add(pts);

    const vels = [];
    for (let i = 0; i < count; i++) {
      vels.push({
        x: (Math.random() - 0.5) * 0.5,
        y: Math.random() * 0.5,
        z: bikeSpeed * 0.08 + Math.random() * 0.3,
      });
    }

    active.push({
      type: 'exhaust',
      pts,
      vels,
      age: 0,
      maxAge: 0.4,
      count,
    });
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.age += dt;
      const t = p.age / p.maxAge;

      const positions = p.pts.geometry.attributes.position.array;
      for (let j = 0; j < p.count; j++) {
        positions[j*3]   += p.vels[j].x * dt;
        positions[j*3+1] += p.vels[j].y * dt;
        positions[j*3+2] += p.vels[j].z * dt;
        p.vels[j].y -= 9.8 * dt * (p.type === 'sparks' ? 1 : 0.1);
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      p.pts.material.opacity = Math.max(0, 1 - t);

      if (p.age >= p.maxAge) {
        scene.remove(p.pts);
        active.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const p of active) scene.remove(p.pts);
    active.length = 0;
    exhaustTimer = 0;
  }

  return { init, sparks, smoke, updateExhaust, update, reset };
})();
