// ═══════════════════════════════════════════════════════════
//  GeoHunter RPG — game.js
//  Core game logic: map, movement, monsters, battle, shop
// ═══════════════════════════════════════════════════════════

// ─── State ──────────────────────────────────────────────
let G = {
  player: {
    hp: 100, maxHp: 100,
    baseAtk: 8, baseDef: 2,
    gold: 0, kills: 0,
    eq: { weapon: null, armor: null, shield: null },
  },
  pos: { lat: 0, lng: 0 },
  env: 'urban',
  lastEnvCheckPos: null,
};

// ─── Map & Markers ──────────────────────────────────────
let map, playerMarker;
let monsters = []; // { data, marker, lat, lng, id }
let nextMonsterId = 1;

// ─── Battle state ───────────────────────────────────────
let battle = null;
let monsterHitTimer = null;
let attackOnCooldown = false;
let pendingLoot = null;

// ─── Joystick state ─────────────────────────────────────
let joystick = {
  active: false,
  originX: 0, originY: 0,
  dx: 0, dy: 0,        // normalized -1..1
  radius: 50,
};
let moveLoop = null;

// ─── Helpers ────────────────────────────────────────────
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function offsetLatLng(lat, lng, distM, bearingDeg) {
  const R = 6371000, toR = Math.PI / 180;
  const φ1 = lat * toR, λ1 = lng * toR, θ = bearingDeg * toR;
  const δ = distM / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / toR, lng: λ2 / toR };
}

function nearbyRandom(lat, lng) {
  const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  const bear = Math.random() * 360;
  return offsetLatLng(lat, lng, dist, bear);
}

function shopItemById(id) { return SHOP_ITEMS.find(i => i.id === id); }

// ─── Player Stats ────────────────────────────────────────
function pAtk()   { return G.player.baseAtk + (G.player.eq.weapon?.atk  || 0); }
function pDef()   { return G.player.baseDef + (G.player.eq.armor?.def   || 0) + (G.player.eq.shield?.def || 0); }
function pMaxHp() { return 100 + (G.player.eq.armor?.mhp || 0); }

// ─── Persistence ────────────────────────────────────────
function saveGame() {
  try { localStorage.setItem('geohunter_v2', JSON.stringify(G.player)); } catch (e) {}
}
function loadGame() {
  try {
    const s = localStorage.getItem('geohunter_v2');
    if (s) G.player = { ...G.player, ...JSON.parse(s) };
  } catch (e) {}
}

// ─── HUD ────────────────────────────────────────────────
function updateHUD() {
  const mxhp = pMaxHp();
  const pct = Math.max(0, Math.min(100, (G.player.hp / mxhp) * 100));
  document.getElementById('hud-hpbar').style.width = pct + '%';
  document.getElementById('hud-hpbar').style.background =
    pct > 50 ? 'linear-gradient(90deg,#a01020,#e84040)'
    : pct > 25 ? 'linear-gradient(90deg,#a06000,#e89020)'
    : 'linear-gradient(90deg,#600808,#c01010)';
  document.getElementById('hud-hpnum').textContent = `${Math.max(0, G.player.hp)} / ${mxhp}`;
  document.getElementById('hud-gold').textContent  = G.player.gold;
  document.getElementById('hud-env').textContent   = `${ENV[G.env].emoji} ${ENV[G.env].name}`;
}

function refreshBattleHUD() {
  if (!battle) return;
  const m = battle.mon, mxhp = pMaxHp();
  document.getElementById('b-mhpbar').style.width = Math.max(0, (m.curHp / m.hp) * 100) + '%';
  document.getElementById('b-mhpv').textContent   = `${Math.max(0, m.curHp)}/${m.hp}`;
  document.getElementById('b-phpbar').style.width = Math.max(0, (G.player.hp / mxhp) * 100) + '%';
  document.getElementById('b-phpv').textContent   = `${Math.max(0, G.player.hp)}/${mxhp}`;
}

// ─── Toast ──────────────────────────────────────────────
let toastTimer;
function showToast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// ─── Visual FX ──────────────────────────────────────────
function floatDamage(dmg, cls, targetEl) {
  const el = document.createElement('div');
  el.className = `dmg-float ${cls}`;
  el.textContent = `-${dmg}`;
  const r = targetEl.getBoundingClientRect();
  el.style.left = (r.left + r.width / 2 - 20 + rand(-15, 15)) + 'px';
  el.style.top  = (r.top + rand(-5, 5)) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function screenFlash() {
  const el = document.createElement('div');
  el.className = 'screen-flash';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 350);
}

// ─── Environment Detection ───────────────────────────────
async function detectEnvironment(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await res.json();
    const cls  = (d.class  || '').toLowerCase();
    const type = (d.type   || '').toLowerCase();
    const name = (d.display_name || '').toLowerCase();
    let env = 'urban';
    if (cls==='waterway'||type==='water'||type==='bay'||name.includes('river')||name.includes('lake')||name.includes('sea')||name.includes('ocean')||name.includes('beach')) env='water';
    else if (cls==='leisure'||type==='park'||type==='forest'||type==='wood'||cls==='natural'||name.includes('park')||name.includes('forest')||name.includes('garden')) env='forest';
    else if ((cls==='landuse'&&type==='industrial')||name.includes('industrial')||name.includes('factory')) env='industrial';
    else if (type==='peak'||type==='cliff'||name.includes('mountain')||name.includes('hill')) env='mountain';
    else if (name.includes('desert')||name.includes('dune')||name.includes('sand')) env='desert';

    if (env !== G.env) {
      G.env = env;
      showToast(`Entered ${ENV[env].emoji} ${ENV[env].name} zone!`);
      respawnAllMonsters();
    } else {
      G.env = env;
    }
    G.lastEnvCheckPos = { lat, lng };
    updateHUD();
  } catch (e) {
    G.lastEnvCheckPos = { lat, lng };
  }
}

// ─── Map Init ────────────────────────────────────────────
function initMap(lat, lng) {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,          // player walks; map follows
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    keyboard: false,
  }).setView([lat, lng], 17);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  const pIcon = L.divIcon({
    html: '<div class="player-dot"></div>',
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  playerMarker = L.marker([lat, lng], { icon: pIcon, zIndexOffset: 1000 }).addTo(map);

  spawnMonsters();
  detectEnvironment(lat, lng);
}

// ─── Monster Spawning ────────────────────────────────────
function spawnMonsters() {
  const needed = MONSTER_COUNT - monsters.length;
  if (needed <= 0) return;
  const pool = ENV[G.env].monsters;
  for (let i = 0; i < needed; i++) {
    const base = pool[Math.floor(Math.random() * pool.length)];
    const pos  = nearbyRandom(G.pos.lat, G.pos.lng);
    addMonsterToMap({ ...base, id: nextMonsterId++ }, pos.lat, pos.lng);
  }
}

function addMonsterToMap(mon, lat, lng) {
  const icon = L.divIcon({
    html: `<div class="mon-marker"><div class="mon-m-emoji">${mon.e}</div><div class="mon-m-tag">${mon.name}</div></div>`,
    className: '',
    iconSize: [48, 54],
    iconAnchor: [24, 27],
  });
  const mark = L.marker([lat, lng], { icon }).addTo(map);
  mark.on('click', () => { if (!battle) engageBattle(mon, mark, lat, lng); });
  monsters.push({ data: mon, marker: mark, lat, lng });
}

function removeMonster(monEntry) {
  if (monEntry.marker) map.removeLayer(monEntry.marker);
  monsters = monsters.filter(m => m !== monEntry);
}

function respawnAllMonsters() {
  monsters.forEach(m => map.removeLayer(m.marker));
  monsters = [];
  spawnMonsters();
}

// ─── Joystick ────────────────────────────────────────────
function initJoystick() {
  const pad   = document.getElementById('joy-pad');
  const knob  = document.getElementById('joy-knob');
  const R     = joystick.radius;

  function onStart(cx, cy) {
    const rect = pad.getBoundingClientRect();
    joystick.originX = rect.left + rect.width  / 2;
    joystick.originY = rect.top  + rect.height / 2;
    joystick.active = true;
    pad.classList.add('active');
  }

  function onMove(cx, cy) {
    if (!joystick.active) return;
    let dx = cx - joystick.originX;
    let dy = cy - joystick.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > R) { dx = dx / dist * R; dy = dy / dist * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.dx =  dx / R;
    joystick.dy = -dy / R;   // screen-y is inverted vs lat
  }

  function onEnd() {
    joystick.active = false;
    joystick.dx = 0;
    joystick.dy = 0;
    knob.style.transform = 'translate(0,0)';
    pad.classList.remove('active');
  }

  pad.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onStart(t.clientX, t.clientY); }, { passive: false });
  pad.addEventListener('touchmove',  e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY);  }, { passive: false });
  pad.addEventListener('touchend',   e => { e.preventDefault(); onEnd(); }, { passive: false });

  // mouse fallback for desktop testing
  pad.addEventListener('mousedown', e => { onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { if (joystick.active) onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   () => onEnd());
}

// ─── Movement Loop ───────────────────────────────────────
function startMoveLoop() {
  if (moveLoop) return;
  moveLoop = setInterval(() => {
    if (!joystick.active || battle) return;
    if (Math.abs(joystick.dx) < 0.05 && Math.abs(joystick.dy) < 0.05) return;

    const speed  = WALK_SPEED;
    const dLat   = (joystick.dy * speed) / 111320;
    const dLng   = (joystick.dx * speed) / (111320 * Math.cos(G.pos.lat * Math.PI / 180));

    G.pos.lat += dLat;
    G.pos.lng += dLng;

    playerMarker.setLatLng([G.pos.lat, G.pos.lng]);
    map.setView([G.pos.lat, G.pos.lng], map.getZoom(), { animate: false });

    // Re-check env every 200m of travel
    if (G.lastEnvCheckPos) {
      const d = haversine(G.pos.lat, G.pos.lng, G.lastEnvCheckPos.lat, G.lastEnvCheckPos.lng);
      if (d > 200) detectEnvironment(G.pos.lat, G.pos.lng);
    }

    // Proximity check for monsters
    checkProximity();

    // Refill map if monsters got sparse
    if (monsters.length < Math.floor(MONSTER_COUNT * 0.5)) spawnMonsters();

  }, 80);
}

// ─── Proximity Check ─────────────────────────────────────
function checkProximity() {
  if (battle) return;
  for (const m of monsters) {
    const dist = haversine(G.pos.lat, G.pos.lng, m.lat, m.lng);
    if (dist < ENGAGE_RANGE) {
      engageBattle(m.data, m.marker, m.lat, m.lng);
      break;
    }
  }
}

// ─── Battle ──────────────────────────────────────────────
function engageBattle(monData, mark, lat, lng) {
  if (battle || G.player.hp <= 0) return;

  // Find the actual entry in monsters array
  const entry = monsters.find(m => m.marker === mark);

  const mon = { ...monData, curHp: monData.hp };
  battle = { mon, mark, lat, lng, entry };

  // Populate battle UI
  const envData = ENV[G.env];
  document.getElementById('b-env-tag').textContent  = `${envData.emoji} ${envData.name.toUpperCase()} ENCOUNTER`;
  document.getElementById('b-title').textContent    = `${mon.e} ${mon.name.toUpperCase()}!`;
  document.getElementById('b-emoji').textContent    = mon.e;
  document.getElementById('b-mname').textContent    = mon.name;
  document.getElementById('b-mname-bar').textContent= mon.name;
  document.getElementById('b-mlvl').textContent     = `Level ${mon.lv}`;
  document.getElementById('b-atk-stat').textContent = `⚔ ATK: ${pAtk()}`;
  document.getElementById('b-def-stat').textContent = `🛡 DEF: ${pDef()}`;
  document.getElementById('atk-btn').disabled       = false;
  attackOnCooldown = false;
  refreshBattleHUD();

  document.getElementById('battle').classList.add('open');

  // Monster attacks every 2.6s
  monsterHitTimer = setInterval(monsterHit, 2600);
}

function playerAttack() {
  if (!battle || attackOnCooldown) return;
  const m = battle.mon;
  const dmg = Math.max(1, pAtk() - m.def + rand(-2, 5));
  m.curHp = Math.max(0, m.curHp - dmg);

  const emojiEl = document.getElementById('b-emoji');
  emojiEl.classList.remove('mon-hit'); void emojiEl.offsetWidth; emojiEl.classList.add('mon-hit');
  floatDamage(dmg, 'dmg-yellow', emojiEl);
  refreshBattleHUD();
  startAttackCooldown(820);

  if (m.curHp <= 0) onMonsterKilled();
}

function monsterHit() {
  if (!battle) return;
  const dmg = Math.max(1, battle.mon.atk - pDef() + rand(-1, 3));
  G.player.hp = Math.max(0, G.player.hp - dmg);
  const playerIco = document.querySelector('.player-ico');
  floatDamage(dmg, 'dmg-red', playerIco);
  screenFlash();
  refreshBattleHUD();
  updateHUD();
  if (G.player.hp <= 0) onPlayerDied();
}

function startAttackCooldown(ms) {
  attackOnCooldown = true;
  const btn = document.getElementById('atk-btn');
  const bar = document.getElementById('cd-bar');
  btn.disabled = true;
  bar.style.transition = 'none'; bar.style.width = '100%';
  requestAnimationFrame(() => {
    bar.style.transition = `width ${ms}ms linear`; bar.style.width = '0%';
  });
  setTimeout(() => {
    attackOnCooldown = false;
    if (battle && battle.mon.curHp > 0) btn.disabled = false;
  }, ms);
}

function onMonsterKilled() {
  clearInterval(monsterHitTimer); monsterHitTimer = null;
  const m = battle.mon;
  G.player.kills++;

  if (battle.entry) removeMonster(battle.entry);
  else if (battle.mark) map.removeLayer(battle.mark);

  // Roll loot
  const gold = m.gold[0] + Math.floor(Math.random() * (m.gold[1] - m.gold[0] + 1));
  const drops = [{ type:'gold', amt:gold, e:'💰', name:`${gold} Gold`, stat:'' }];

  for (const row of DROP_TABLE) {
    if (Math.random() < row.chance) {
      const item = shopItemById(row.itemId);
      if (item) { drops.push({ type:'item', item, e:item.e, name:item.name, stat:item.desc }); break; }
    }
  }
  pendingLoot = { drops, monName: m.name };
  battle = null;

  document.getElementById('battle').classList.remove('open');
  setTimeout(() => showLootScreen(), 420);

  // Refill monsters
  setTimeout(() => spawnMonsters(), 3000);
  saveGame();
}

function onPlayerDied() {
  clearInterval(monsterHitTimer); monsterHitTimer = null;
  battle = null; attackOnCooldown = false;
  document.getElementById('battle').classList.remove('open');
  const lost = Math.floor(G.player.gold * 0.1);
  G.player.gold = Math.max(0, G.player.gold - lost);
  G.player.hp = Math.floor(pMaxHp() * 0.3);
  updateHUD();
  showToast(`💀 You died! Lost ${lost} gold. Revived at 30% HP.`, 4000);
  saveGame();
}

function playerFlee() {
  if (!battle) return;
  clearInterval(monsterHitTimer); monsterHitTimer = null;
  battle = null; attackOnCooldown = false;
  document.getElementById('battle').classList.remove('open');
  showToast('🏃 You escaped!');
}

// ─── Loot Screen ─────────────────────────────────────────
function showLootScreen() {
  if (!pendingLoot) return;
  document.getElementById('loot-sub').textContent = `You defeated ${pendingLoot.monName}!`;
  document.getElementById('loot-list').innerHTML = pendingLoot.drops
    .map((d, i) => `
      <div class="loot-row" style="animation-delay:${i * 0.1}s">
        <div class="loot-ic">${d.e}</div>
        <div class="loot-info">
          <div class="loot-name">${d.name}</div>
          ${d.stat ? `<div class="loot-stat">${d.stat}</div>` : ''}
        </div>
      </div>`)
    .join('');
  document.getElementById('loot').classList.add('open');
}

function collectLoot() {
  if (!pendingLoot) return;
  for (const d of pendingLoot.drops) {
    if (d.type === 'gold') {
      G.player.gold += d.amt;
    } else if (d.type === 'item' && d.item) {
      applyOrEquipItem(d.item, true);
    }
  }
  pendingLoot = null;
  document.getElementById('loot').classList.remove('open');
  updateHUD();
  saveGame();
}

// ─── Item Application ─────────────────────────────────────
function applyOrEquipItem(item, fromLoot) {
  if (item.type === 'consumable') {
    G.player.hp = Math.min(pMaxHp(), G.player.hp + (item.hp || 0));
    if (fromLoot) showToast(`${item.e} ${item.name}: HP restored`);
    updateHUD();
  } else if (item.type === 'weapon') {
    G.player.eq.weapon = item;
  } else if (item.type === 'armor') {
    G.player.eq.armor = item;
    G.player.maxHp = pMaxHp();
  } else if (item.type === 'shield') {
    G.player.eq.shield = item;
  }
}

// ─── Shop ─────────────────────────────────────────────────
function openShop() {
  renderShop();
  document.getElementById('shop-panel').classList.add('open');
}
function closeShop() { document.getElementById('shop-panel').classList.remove('open'); }

function renderShop() {
  document.getElementById('shop-gold-display').textContent = G.player.gold;
  const eq = G.player.eq;
  document.getElementById('shop-grid').innerHTML = SHOP_ITEMS.map(item => {
    const isEq       = eq.weapon?.id === item.id || eq.armor?.id === item.id || eq.shield?.id === item.id;
    const canAfford  = G.player.gold >= item.cost;
    return `
      <div class="shop-card ${isEq ? 'equipped' : ''} ${!canAfford && !isEq ? 'cant-afford' : ''}"
           onclick="buyItem('${item.id}')">
        ${isEq ? '<span class="eq-badge">ON</span>' : ''}
        <div class="si-icon">${item.e}</div>
        <div class="si-name">${item.name}</div>
        <div class="si-desc">${item.desc}</div>
        <div class="si-cost" style="color:${canAfford ? 'var(--gold)' : 'var(--muted)'}">💰 ${item.cost}</div>
      </div>`;
  }).join('');
}

function buyItem(id) {
  const item = shopItemById(id);
  if (!item) return;
  if (G.player.gold < item.cost) { showToast('❌ Not enough gold!'); return; }
  G.player.gold -= item.cost;
  applyOrEquipItem(item, false);
  renderShop();
  updateHUD();
  saveGame();
  showToast(`✅ ${item.name} acquired!`);
}

// ─── Stats Panel ─────────────────────────────────────────
function openStats() {
  const p = G.player, eq = p.eq;
  document.getElementById('stats-body').innerHTML = `
    <div class="stat-card">
      <div class="stat-section-title">⚔ Combat</div>
      <div class="st-row"><span class="st-l">❤️ HP</span><span class="st-v">${p.hp} / ${pMaxHp()}</span></div>
      <div class="st-row"><span class="st-l">⚔️ Attack</span><span class="st-v">${pAtk()} <small>(base ${p.baseAtk})</small></span></div>
      <div class="st-row"><span class="st-l">🛡️ Defense</span><span class="st-v">${pDef()} <small>(base ${p.baseDef})</small></span></div>
      <div class="st-row"><span class="st-l">💰 Gold</span><span class="st-v gold-txt">${p.gold}</span></div>
      <div class="st-row"><span class="st-l">💀 Kills</span><span class="st-v">${p.kills}</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-section-title">🎒 Equipment</div>
      <div class="eq-row"><span class="eq-ic">${eq.weapon?.e||'🪵'}</span><div><div class="eq-nm">${eq.weapon?.name||'Bare Fists'}</div><div class="eq-st">${eq.weapon?.desc||'No bonus'}</div></div></div>
      <div class="eq-row"><span class="eq-ic">${eq.armor?.e||'👕'}</span><div><div class="eq-nm">${eq.armor?.name||'Cloth Shirt'}</div><div class="eq-st">${eq.armor?.desc||'No bonus'}</div></div></div>
      <div class="eq-row"><span class="eq-ic">${eq.shield?.e||'🤛'}</span><div><div class="eq-nm">${eq.shield?.name||'No Shield'}</div><div class="eq-st">${eq.shield?.desc||'No bonus'}</div></div></div>
    </div>
    <div class="stat-card">
      <div class="stat-section-title">🌍 World</div>
      <div class="st-row"><span class="st-l">Zone</span><span class="st-v">${ENV[G.env].emoji} ${ENV[G.env].name}</span></div>
      <div class="st-row"><span class="st-l">Monsters nearby</span><span class="st-v">${monsters.length}</span></div>
    </div>`;
  document.getElementById('stats-panel').classList.add('open');
}
function closeStats() { document.getElementById('stats-panel').classList.remove('open'); }

// ─── Boot ─────────────────────────────────────────────────
function boot(lat, lng) {
  document.getElementById('load-msg').textContent = 'Spawning creatures...';
  G.pos = { lat, lng };
  loadGame();
  updateHUD();
  initMap(lat, lng);
  initJoystick();
  startMoveLoop();

  setTimeout(() => {
    const l = document.getElementById('loading');
    l.style.opacity = '0';
    setTimeout(() => { l.style.display = 'none'; }, 600);
  }, 900);
}

// ─── Entry point ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const fallbackLat = 51.5074, fallbackLng = -0.1278;

  if (!navigator.geolocation) {
    showToast('GPS unavailable — using demo location');
    boot(fallbackLat, fallbackLng);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => boot(pos.coords.latitude, pos.coords.longitude),
    ()  => { showToast('GPS denied — using demo location'); boot(fallbackLat, fallbackLng); },
    { enableHighAccuracy: true, timeout: 14000, maximumAge: 0 }
  );
});
