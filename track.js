/* ═══════════════════════════════════
   track.js — Streaming tile track
   3 road tiles recycle as bike advances
   → road never ends, any number of laps
═══════════════════════════════════ */

'use strict';

const Track = (() => {

  const TRACK_WIDTH  = 16;    // metres
  const TILE_LEN     = 300;   // length of one road tile
  const NUM_TILES    = 3;     // tiles in flight at once (covers ~900 m visible)
  const LANE_CLEAR   = 5.5;   // half-width of safe riding lane

  // The single canonical "track length" for lap counting
  // — one lap = TILE_LEN * NUM_TILES (900 m)
  const TRACK_LENGTH = TILE_LEN * NUM_TILES;

  let scene        = null;
  let tileGroup    = null;   // parent for the three road tiles
  let tiles        = [];     // { mesh, nextZ } — the three recycled panels
  let staticGroup  = null;   // barriers, stands, decorations (never move)
  let barrierBodies = [];

  // Materials — built once, reused across tiles
  let _roadMat  = null;
  let _lineMat  = null;
  let _rumbMat  = null;

  /* ═══ PUBLIC: build ═══════════════════════════════════ */
  function build(sc) {
    scene = sc;

    // ── Materials ──
    _roadMat = new THREE.MeshStandardMaterial({
      map: Utils.makeAsphaltTexture(512),
      roughness: 0.85,
      metalness: 0.0,
    });
    _lineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, opacity: 0.5, transparent: true
    });
    _rumbMat = new THREE.MeshStandardMaterial({
      map: Utils.makeRumbleTexture(), roughness: 0.9, metalness: 0.0
    });

    // ── Tile group ──
    tileGroup = new THREE.Group();
    scene.add(tileGroup);
    tiles = [];

    for (let i = 0; i < NUM_TILES; i++) {
      const tile = _makeTile();
      // Place tile i starting at z=0, -TILE_LEN, -2*TILE_LEN …
      _positionTileAt(tile, i * TILE_LEN);
      tileGroup.add(tile.group);
      tiles.push(tile);
    }

    // ── Static scenery (built once) ──
    staticGroup = new THREE.Group();
    scene.add(staticGroup);
    barrierBodies = [];

    _buildStaticBarriers();
    _buildGrandstands();
    _buildStartFinishLine();
    _buildObstaclesOnEdges();
    _buildDecorations();

    // Infinite ground plane for physics
    Physics.createGround();

    return { tileGroup, staticGroup };
  }

  /* ═══ TILE FACTORY ════════════════════════════════════ */
  function _makeTile() {
    const g = new THREE.Group();

    // Road surface
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_WIDTH, TILE_LEN, 4, 20),
      _roadMat
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    g.add(road);

    // Centre dashes
    for (let z = 0; z < TILE_LEN; z += 20) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 8), _lineMat
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.01, z - TILE_LEN / 2 + 4);
      g.add(dash);
    }

    // Rumble strips L & R
    for (const xPos of [TRACK_WIDTH / 2 - 0.6, -(TRACK_WIDTH / 2 - 0.6)]) {
      const rumble = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, TILE_LEN, 1, 1), _rumbMat
      );
      rumble.rotation.x = -Math.PI / 2;
      rumble.position.set(xPos, 0.005, 0);
      rumble.receiveShadow = true;
      g.add(rumble);
    }

    // Track-side lighting poles (every 60 m within tile)
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 1.5
    });
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x888898, metalness: 0.9, roughness: 0.2
    });
    for (let z = 30; z < TILE_LEN; z += 60) {
      for (const px of [TRACK_WIDTH / 2 + 4, -(TRACK_WIDTH / 2 + 4)]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.14, 12, 6), poleMat
        );
        pole.position.set(px, 6, z - TILE_LEN / 2);
        pole.castShadow = true;
        g.add(pole);

        const head = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.25, 0.25), lightMat
        );
        head.position.set(px + (px > 0 ? -0.8 : 0.8), 12, z - TILE_LEN / 2);
        g.add(head);
      }
    }

    return { group: g, currentZ: 0 };
  }

  /* Position tile so its START (positive-Z end) is at worldZ = startZ
     → tile spans world Z: -startZ  to  -(startZ + TILE_LEN)               */
  function _positionTileAt(tile, startZ) {
    tile.currentZ = startZ;
    // Centre of tile is at startZ + TILE_LEN/2
    tile.group.position.z = -(startZ + TILE_LEN / 2);
  }

  /* ═══ PUBLIC: update — call every frame with bike world-Z ════════════ */
  function update(bikeZ) {
    // bikeZ is NEGATIVE in world space (bike moves in -Z direction)
    // Convert to positive distance travelled
    const bikeDist = -bikeZ;   // positive number that grows as bike moves forward

    for (const tile of tiles) {
      // If the bike has passed beyond this tile's far end, recycle it ahead
      const tileFarDist = tile.currentZ + TILE_LEN;
      if (bikeDist > tileFarDist + TILE_LEN) {
        // Find the tile that is furthest ahead and place this one after it
        const maxZ = Math.max(...tiles.map(t => t.currentZ));
        _positionTileAt(tile, maxZ + TILE_LEN);
      }
    }
  }

  /* ═══ STATIC SCENERY (built once, never recycled) ════════════════════ */
  function _buildStaticBarriers() {
    const barrierTex = Utils.makeBarrierTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: barrierTex, roughness: 0.4, metalness: 0.7
    });

    const hw = 0.12, hh = 0.5, segLen = 10;
    const sides = [
      { x:  TRACK_WIDTH / 2 + 0.12 },
      { x: -TRACK_WIDTH / 2 - 0.12 },
    ];

    // Build barriers for 3 × TILE_LEN so they cover the starting area
    const coverDist = TILE_LEN * NUM_TILES;
    for (const { x } of sides) {
      for (let z = 0; z < coverDist; z += segLen) {
        const geo  = new THREE.BoxGeometry(hw * 2, hh * 2, segLen - 0.05);
        const mesh = new THREE.Mesh(geo, mat);
        const pz   = -(z + segLen / 2);
        mesh.position.set(x, hh, pz);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        staticGroup.add(mesh);

        const body = Physics.createStaticBox(hw, hh, (segLen - 0.05) / 2, { x, y: hh, z: pz });
        barrierBodies.push(body);
      }
    }
  }

  function _buildGrandstands() {
    const standTex = Utils.makeGrandstandTexture();
    const mat    = new THREE.MeshStandardMaterial({ map: standTex, roughness: 0.9, metalness: 0.0 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9, metalness: 0.2 });

    const positions = [
      { x:  TRACK_WIDTH / 2 + 12, z: -200, len: 120 },
      { x: -(TRACK_WIDTH / 2 + 12), z: -350, len: 100 },
      { x:  TRACK_WIDTH / 2 + 12, z: -550, len: 140 },
    ];

    for (const { x, z, len } of positions) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(16, 14, len), mat);
      body.position.set(x, 7, z);
      body.castShadow = true;
      staticGroup.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, len), roofMat);
      roof.position.set(x, 14.3, z);
      roof.castShadow = true;
      staticGroup.add(roof);
    }
  }

  function _buildStartFinishLine() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#000';
        ctx.fillRect(i * 32, j * 32, 32, 32);
      }
    }
    const mat  = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.015, -5);
    staticGroup.add(mesh);

    // Gantry
    const gMat = new THREE.MeshStandardMaterial({ color: 0x222230, metalness: 0.8, roughness: 0.3 });
    for (const px of [-(TRACK_WIDTH / 2 + 1), TRACK_WIDTH / 2 + 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 8), gMat);
      post.position.set(px, 5, -5);
      post.castShadow = true;
      staticGroup.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 3, 0.4, 0.4), gMat);
    beam.position.set(0, 10.2, -5);
    beam.castShadow = true;
    staticGroup.add(beam);
  }

  function _buildObstaclesOnEdges() {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.05 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.7,  metalness: 0.1  });
    const edgeXMin = LANE_CLEAR + 0.5;
    const edgeXMax = TRACK_WIDTH / 2 - 0.8;

    for (let z = 60; z < TRACK_LENGTH - 30; z += 40) {
      for (const sign of [-1, 1]) {
        if (Math.random() < 0.5) continue;
        const ex = sign * Utils.randomRange(edgeXMin, edgeXMax);
        const pz = -(z + Utils.randomRange(-8, 8));

        if (Math.random() < 0.5) {
          const r = 0.5;
          const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 8, 16), tireMat);
          m.rotation.x = Math.PI / 2;
          m.position.set(ex, r, pz);
          m.castShadow = true;
          staticGroup.add(m);
          barrierBodies.push(Physics.createStaticBox(r + 0.2, r + 0.2, r + 0.2, { x: ex, y: r, z: pz }));
        } else {
          const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 8), coneMat);
          m.position.set(ex, 0.4, pz);
          m.castShadow = true;
          staticGroup.add(m);
          barrierBodies.push(Physics.createStaticBox(0.25, 0.4, 0.25, { x: ex, y: 0.4, z: pz }));
        }
      }
    }
  }

  function _buildDecorations() {
    // Decorations are now baked into each tile (see _makeTile)
    // This function intentionally empty — kept for API compatibility
  }

  /* ═══ PUBLIC API ══════════════════════════════════════ */
  function getLaneClear()  { return LANE_CLEAR;    }
  function getTrackWidth() { return TRACK_WIDTH;   }
  function getTrackLength(){ return TRACK_LENGTH;  }

  function dispose() {
    if (tileGroup)   { scene.remove(tileGroup);   tileGroup = null;   }
    if (staticGroup) { scene.remove(staticGroup); staticGroup = null; }
    tiles = [];
    barrierBodies = [];
  }

  return { build, update, dispose, getLaneClear, getTrackWidth, getTrackLength };
})();
