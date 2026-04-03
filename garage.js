/* ═══════════════════════════════════
   garage.js — Upgrade & pit logic
═══════════════════════════════════ */

'use strict';

const Garage = (() => {

  let cash = 0;

  const upgradeCosts = { engine: 1200, tires: 800, nitro: 600 };

  function init() {
    document.getElementById('btn-engine').addEventListener('click', () => _buy('engine'));
    document.getElementById('btn-tires').addEventListener('click',  () => _buy('tires'));
    document.getElementById('btn-nitro').addEventListener('click',  () => _buy('nitro'));
    document.getElementById('btn-garage-race').addEventListener('click', _startRace);
    document.getElementById('btn-garage-back').addEventListener('click', _back);
  }

  function _buy(item) {
    const cost = upgradeCosts[item];
    if (!cost || cash < cost) { _shake(`btn-${item}`); return; }
    cash -= cost;
    _applyCashDisplay();

    switch (item) {
      case 'engine': Bike.upgradeEngine(); break;
      case 'tires':  Bike.upgradeTires();  break;
      case 'nitro':  Bike.addNitro();      break;
    }
    _refreshStats();
  }

  function _shake(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.style.borderColor = '#ef4444';
    setTimeout(() => btn.style.borderColor = '', 500);
  }

  function _applyCashDisplay() {
    document.getElementById('garage-cash').textContent = cash.toLocaleString();
    for (const [item, cost] of Object.entries(upgradeCosts)) {
      const btn = document.getElementById(`btn-${item}`);
      if (btn) btn.disabled = cash < cost;
    }
  }

  function _refreshStats() {
    const s  = Bike.getState();
    const el = document.getElementById('garage-stats');
    el.innerHTML = `
      Engine Lvl: <span>${s.engineLevel}</span> &nbsp;|&nbsp;
      Tire Lvl: <span>${s.tireLevel}</span> &nbsp;|&nbsp;
      Nitro Charges: <span>${s.nitroPips}</span>
    `;
  }

  function _startRace() {
    hide();
    Utils.emit('garageToRace');
  }

  function _back() {
    hide();
    document.getElementById('main-menu').classList.remove('hidden');
  }

  function addCash(amount) { cash += amount; }

  function show() {
    document.getElementById('garage-screen').classList.remove('hidden');
    _applyCashDisplay();
    _refreshStats();
  }

  function hide() {
    document.getElementById('garage-screen').classList.add('hidden');
  }

  function getCash() { return cash; }

  return { init, show, hide, addCash, getCash };
})();
