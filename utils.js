/* ═══════════════════════════════════
   utils.js — Shared helpers
═══════════════════════════════════ */

'use strict';

const Utils = (() => {

  function lerp(a, b, t) { return a + (b - a) * t; }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function randomRange(min, max) { return min + Math.random() * (max - min); }

  function formatTime(ms) {
    const mins  = Math.floor(ms / 60000);
    const secs  = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    return `${mins}:${String(secs).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
  }

  /* Simple event bus */
  const _handlers = {};
  function on(evt, fn)  { (_handlers[evt] = _handlers[evt] || []).push(fn); }
  function off(evt, fn) { if (_handlers[evt]) _handlers[evt] = _handlers[evt].filter(h => h !== fn); }
  function emit(evt, data) { (_handlers[evt] || []).forEach(h => h(data)); }

  /* Detect touch device */
  const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /* Procedural texture generation helpers */
  function makeAsphaltTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    // Dark base
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);
    // Noise grains
    for (let i = 0; i < size * size * 0.4; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.floor(Math.random() * 40 + 10);
      ctx.fillStyle = `rgb(${r},${r},${r})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    // Occasional bright flecks (aggregate)
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = Math.floor(Math.random() * 120 + 80);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 2, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 60);
    return tex;
  }

  function makeRumbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const stripeW = 32;
    for (let i = 0; i < 256 / stripeW; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#cc1111' : '#ffffff';
      ctx.fillRect(i * stripeW, 0, stripeW, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 1);
    return tex;
  }

  function makeBarrierTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    // Metallic base
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#888');
    grad.addColorStop(0.5, '#ccc');
    grad.addColorStop(1, '#666');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 128);
    // Red/white sponsor stripes
    ctx.fillStyle = '#cc1111';
    ctx.fillRect(0, 0, 512, 24);
    ctx.fillRect(0, 104, 512, 24);
    // "SPONSOR" text repeated
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 28px Arial';
    for (let x = 20; x < 512; x += 160) {
      ctx.fillText('MOTO GP', x, 78);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    return tex;
  }

  function makeGrandstandTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 512, 256);
    // Seats
    const colors = ['#cc1111','#1155cc','#22aa22','#ccaa11','#888'];
    const rows = 10, cols = 20;
    const sw = 512 / cols, sh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const empty = Math.random() > 0.3;
        ctx.fillStyle = empty ? colors[Math.floor(Math.random()*colors.length)] : '#0a0a1a';
        ctx.fillRect(c * sw + 2, r * sh + 2, sw - 4, sh - 4);
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  function makeSkyGradient() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#0a0e1a');
    grad.addColorStop(0.4, '#1a2540');
    grad.addColorStop(0.7, '#2d3f6e');
    grad.addColorStop(0.9, '#c8602a');
    grad.addColorStop(1.0, '#e8803a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  return {
    lerp, clamp, randomRange, formatTime,
    on, off, emit,
    isMobile,
    makeAsphaltTexture,
    makeRumbleTexture,
    makeBarrierTexture,
    makeGrandstandTexture,
    makeSkyGradient,
  };
})();
