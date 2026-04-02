/* ═══════════════════════════════════
   track.js — Procedural track builder
   Straight track with curves
═══════════════════════════════════ */

'use strict';

const Track = (() => {

  const TRACK_WIDTH   = 16;    // metres
  const TRACK_LENGTH  = 800;   // metres per segment (looping)
  const LANE_CLEAR    = 5.5;   // half-width of bike lane (MUST remain clear)

  let trackGroup = null;
  let barrierBodies = [];

  /* Build the entire track scene */
  function build(scene) {
    trackGroup = new THREE.Group();
    scene.add(trackGroup);
    barrierBodies = [];

    _buildRoad();
    _buildRumbleStrips();
    _buildBarriers();
    _buildGrandstands();
    _buildStartFinishLine();
    _buildObstaclesOnEdges();
    _buildDecorations();

    return trackGroup;
  }

  /* ─ Road surface ─ */
  function _buildRoad() {
    const asphaltTex = Utils.makeAsphaltTexture(512);
    const mat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.3,
    });
    const geo = new THREE.PlaneGeometry(TRACK_WIDTH, TRACK_LENGTH, 4, 60);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -TRACK_LENGTH / 2;
    mesh.receiveShadow = true;
    trackGroup.add(mesh);

    // Track markings — white dashed centre line
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true });
    for (let z = 0; z < TRACK_LENGTH; z += 20) {
      const lGeo = new THREE.PlaneGeometry(0.15, 8);
      const line = new THREE.Mesh(lGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.01, -(z + 4));
      trackGroup.add(line);
    }

    // Physics ground
    Physics.createGround();
  }

  /* ─ Rumble strips ─ */
  function _buildRumbleStrips() {
    const rumbleTex = Utils.makeRumbleTexture();
    const mat = new THREE.MeshStandardMaterial({ map: rumbleTex, roughness: 0.9, metalness: 0.0 });

    const sides = [TRACK_WIDTH / 2 - 0.6, -(TRACK_WIDTH / 2 - 0.6)];
    for (const xPos of sides) {
      const geo = new THREE.PlaneGeometry(1.2, TRACK_LENGTH, 1, 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(xPos, 0.005, -TRACK_LENGTH / 2);
      mesh.receiveShadow = true;
      trackGroup.add(mesh);
    }
  }

  /* ─ Armco barriers ─ */
  function _buildBarriers() {
    const barrierTex = Utils.makeBarrierTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: barrierTex,
      roughness: 0.4,
      metalness: 0.7,
      envMapIntensity: 0.8,
    });

    const hw = 0.12, hh = 0.5, segLen = 10;
    const sides = [
      { x:  TRACK_WIDTH / 2 + 0.12, flip: false },
      { x: -TRACK_WIDTH / 2 - 0.12, flip: true  },
    ];

    for (const { x, flip } of sides) {
      for (let z = 0; z < TRACK_LENGTH; z += segLen) {
        const geo = new THREE.BoxGeometry(hw * 2, hh * 2, segLen - 0.05);
        const mesh = new THREE.Mesh(geo, mat);
        const pz = -(z + segLen / 2);
        mesh.position.set(x, hh, pz);
        mesh.castShadow  = true;
        mesh.receiveShadow = true;
        trackGroup.add(mesh);

        // Physics body
        const body = Physics.createStaticBox(hw, hh, (segLen - 0.05) / 2, { x, y: hh, z: pz });
        barrierBodies.push(body);
      }
    }
  }

  /* ─ Grand stands ─ */
  function _buildGrandstands() {
    const standTex = Utils.makeGrandstandTexture();
    const mat = new THREE.MeshStandardMaterial({ map: standTex, roughness: 0.9, metalness: 0.0 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9, metalness: 0.2 });

    const positions = [
      { x: TRACK_WIDTH / 2 + 12, z: -200, len: 120 },
      { x: -(TRACK_WIDTH / 2 + 12), z: -350, len: 100 },
      { x: TRACK_WIDTH / 2 + 12, z: -550, len: 140 },
    ];

    for (const { x, z, len } of positions) {
      // Stand body
      const geo = new THREE.BoxGeometry(16, 14, len);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 7, z);
      mesh.castShadow = true;
      trackGroup.add(mesh);

      // Roof overhang
      const roofGeo = new THREE.BoxGeometry(18, 0.6, len);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(x, 14.3, z);
      roof.castShadow = true;
      trackGroup.add(roof);
    }
  }

  /* ─ Start / finish line ─ */
  function _buildStartFinishLine() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const sqSize = 32;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : '#000000';
        ctx.fillRect(i * sqSize, j * sqSize, sqSize, sqSize);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const geo = new THREE.PlaneGeometry(TRACK_WIDTH, 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.015, -5);
    trackGroup.add(mesh);

    // "START / FINISH" text arch (simple box gantry)
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x222230, metalness: 0.8, roughness: 0.3 });
    const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 10, 8);
    for (const px of [-(TRACK_WIDTH/2 + 1), TRACK_WIDTH/2 + 1]) {
      const post = new THREE.Mesh(postGeo, gantryMat);
      post.position.set(px, 5, -5);
      post.castShadow = true;
      trackGroup.add(post);
    }
    const beamGeo = new THREE.BoxGeometry(TRACK_WIDTH + 3, 0.4, 0.4);
    const beam = new THREE.Mesh(beamGeo, gantryMat);
    beam.position.set(0, 10.2, -5);
    beam.castShadow = true;
    trackGroup.add(beam);
  }

  /* ─ Edge obstacles — ONLY on extreme left/right edges ─ */
  function _buildObstaclesOnEdges() {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.05 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.7, metalness: 0.1 });

    // SAFE ZONE: |x| < LANE_CLEAR  →  strictly keep clear
    // Place ONLY at |x| > LANE_CLEAR + 0.5 to TRACK_WIDTH/2 - 0.3
    const edgeXMin = LANE_CLEAR + 0.5;
    const edgeXMax = TRACK_WIDTH / 2 - 0.8;

    const zPositions = [];
    for (let z = 60; z < TRACK_LENGTH - 30; z += 40) {
      zPositions.push(z);
    }

    for (const z of zPositions) {
      // Randomly pick left or right edge
      for (const sign of [-1, 1]) {
        if (Math.random() < 0.5) continue;
        const ex = sign * Utils.randomRange(edgeXMin, edgeXMax);
        const pz = -(z + Utils.randomRange(-8, 8));

        if (Math.random() < 0.5) {
          // Tire stack
          const r1 = 0.5, r2 = 0.5;
          const geo = new THREE.TorusGeometry(r1, 0.22, 8, 16);
          const mesh = new THREE.Mesh(geo, tireMat);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(ex, r1, pz);
          mesh.castShadow = true;
          trackGroup.add(mesh);

          // Box collider for the tire
          const body = Physics.createStaticBox(r1 + 0.2, r1 + 0.2, r2 + 0.2, { x: ex, y: r1, z: pz });
          barrierBodies.push(body);
        } else {
          // Traffic cone
          const geo = new THREE.ConeGeometry(0.25, 0.8, 8);
          const mesh = new THREE.Mesh(geo, coneMat);
          mesh.position.set(ex, 0.4, pz);
          mesh.castShadow = true;
          trackGroup.add(mesh);
          const body = Physics.createStaticBox(0.25, 0.4, 0.25, { x: ex, y: 0.4, z: pz });
          barrierBodies.push(body);
        }
      }
    }
  }

  /* ─ Track-side decorations ─ */
  function _buildDecorations() {
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 1.5 });
    const poleMat  = new THREE.MeshStandardMaterial({ color: 0x888898, metalness: 0.9, roughness: 0.2 });

    // Track lighting poles every 60m
    for (let z = 20; z < TRACK_LENGTH; z += 60) {
      for (const px of [TRACK_WIDTH/2 + 4, -(TRACK_WIDTH/2 + 4)]) {
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 12, 6);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(px, 6, -z);
        pole.castShadow = true;
        trackGroup.add(pole);

        const lightGeo = new THREE.BoxGeometry(1.2, 0.25, 0.25);
        const lightHead = new THREE.Mesh(lightGeo, lightMat);
        lightHead.position.set(px + (px > 0 ? -0.8 : 0.8), 12, -z);
        trackGroup.add(lightHead);
      }
    }
  }

  /* Returns the half-width of the clear riding zone */
  function getLaneClear()  { return LANE_CLEAR; }
  function getTrackWidth() { return TRACK_WIDTH; }
  function getTrackLength(){ return TRACK_LENGTH; }

  function dispose(scene) {
    if (trackGroup) { scene.remove(trackGroup); trackGroup = null; }
    barrierBodies = [];
  }

  return { build, dispose, getLaneClear, getTrackWidth, getTrackLength };
})();
