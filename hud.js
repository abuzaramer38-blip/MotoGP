/* ═══════════════════════════════════
   hud.js — Canvas RPM gauge & HUD
═══════════════════════════════════ */

'use strict';

const HUD = (() => {

  let rpmCanvas = null, rpmCtx = null;
  let totalLaps = 3;

  function init() {
    rpmCanvas = document.getElementById('rpm-gauge');
    rpmCtx    = rpmCanvas.getContext('2d');
    _buildNitroPips();

    // Listen to game events
    Utils.on('damage',      _onDamage);
    Utils.on('nitroStart',  _onNitroStart);
    Utils.on('nitroEnd',    _onNitroEnd);
    Utils.on('lapComplete', _onLapComplete);
    Utils.on('engineBlown', _onEngineBlown);
  }

  function show()  { document.getElementById('hud').classList.remove('hidden'); }
  function hide()  { document.getElementById('hud').classList.add('hidden'); }

  function _buildNitroPips(count = 3) {
    const container = document.getElementById('hud-nitro-pips');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const pip = document.createElement('div');
      pip.className = 'nitro-pip active';
      pip.dataset.idx = i;
      container.appendChild(pip);
    }
  }

  function update(state) {
    const speedKPH = Math.round(state.speed * 3.6);
    document.getElementById('hud-speed').textContent = speedKPH;
    document.getElementById('hud-gear').textContent  = state.gear;

    // Lap counter
    document.getElementById('hud-lap').textContent =
      `${Math.min(state.lapsCompleted + 1, totalLaps)} / ${totalLaps}`;

    // Lap time
    const elapsed = performance.now() - state.raceStartTime;
    document.getElementById('hud-laptime').textContent = Utils.formatTime(elapsed);

    // Health bar
    const hpct = Utils.clamp(state.health / 100, 0, 1);
    const hBar  = document.getElementById('hud-health-bar');
    const hPct  = document.getElementById('hud-health-pct');
    hBar.style.width = `${hpct * 100}%`;
    hPct.textContent = `${Math.round(state.health)}%`;
    hBar.style.background = hpct > 0.5
      ? 'linear-gradient(90deg,#22c55e,#84cc16)'
      : hpct > 0.25
        ? 'linear-gradient(90deg,#f59e0b,#f97316)'
        : 'linear-gradient(90deg,#ef4444,#dc2626)';

    // Nitro pips
    const pips = document.querySelectorAll('.nitro-pip');
    pips.forEach((p, i) => {
      p.classList.toggle('active', i < state.nitroPips);
    });

    // RPM gauge
    _drawRPM(state.rpm, state.gear);
  }

  function _drawRPM(rpmFrac, gear) {
    const c = rpmCtx;
    const W = rpmCanvas.width, H = rpmCanvas.height;
    c.clearRect(0, 0, W, H);

    const cx = W/2, cy = H/2 + 10;
    const R  = W/2 - 10;

    // Background arc
    c.beginPath();
    c.arc(cx, cy, R, Math.PI * 0.75, Math.PI * 2.25);
    c.lineWidth = 12;
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.stroke();

    // RPM fill arc
    const rpmAngle = Math.PI * 0.75 + rpmFrac * Math.PI * 1.5;
    const rpmColor = rpmFrac > 0.85
      ? '#ef4444'
      : rpmFrac > 0.65
        ? '#f59e0b'
        : '#e83838';
    c.beginPath();
    c.arc(cx, cy, R, Math.PI * 0.75, rpmAngle);
    c.lineWidth = 12;
    c.strokeStyle = rpmColor;
    c.shadowColor = rpmColor;
    c.shadowBlur  = 12;
    c.stroke();
    c.shadowBlur = 0;

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const angle = Math.PI * 0.75 + (i/10) * Math.PI * 1.5;
      const inner = i % 2 === 0 ? R - 20 : R - 13;
      c.beginPath();
      c.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      c.lineTo(cx + Math.cos(angle) * (R - 4), cy + Math.sin(angle) * (R - 4));
      c.lineWidth = i % 2 === 0 ? 2 : 1;
      c.strokeStyle = i >= 9 ? '#ef4444' : 'rgba(255,255,255,0.3)';
      c.stroke();
    }

    // Needle
    const needleAngle = Math.PI * 0.75 + rpmFrac * Math.PI * 1.5;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(
      cx + Math.cos(needleAngle) * (R - 18),
      cy + Math.sin(needleAngle) * (R - 18)
    );
    c.lineWidth   = 2;
    c.strokeStyle = '#ffffff';
    c.shadowColor = '#ffffff';
    c.shadowBlur  = 6;
    c.stroke();
    c.shadowBlur = 0;

    // Centre dot
    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI*2);
    c.fillStyle = '#e83838';
    c.fill();

    // "RPM" label
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.font = 'bold 10px Orbitron, monospace';
    c.textAlign = 'center';
    c.fillText('RPM', cx, cy + 28);
  }

  function _onDamage({ health, amount }) {
    const flash = document.getElementById('damage-flash');
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');

    // Bump camera (visual shake handled in main.js)
    Utils.emit('cameraShake', { intensity: amount / 20 });
  }

  function _onNitroStart() {
    document.getElementById('nitro-flare').classList.remove('hidden');
  }
  function _onNitroEnd() {
    document.getElementById('nitro-flare').classList.add('hidden');
  }

  function _onLapComplete({ lap }) {
    document.getElementById('hud-lap').textContent = `${lap} / ${totalLaps}`;
  }

  function _onEngineBlown() {
    document.getElementById('engine-blown').classList.remove('hidden');
  }

  function hideEngineBlown() {
    document.getElementById('engine-blown').classList.add('hidden');
  }

  function setTotalLaps(n) { totalLaps = n; }

  return { init, show, hide, update, hideEngineBlown, setTotalLaps };
})();
