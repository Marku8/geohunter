// ═══════════════════════════════════════════════════════════
//  GeoHunter RPG — game.js
// ═══════════════════════════════════════════════════════════

// ─── State ──────────────────────────────────────────────
let G = {
  player: {
    hp: 100, maxHp: 100,
    baseAtk: 8, baseDef: 2,
    gold: 0, kills: 0,
    avatar: null,
    eq: { weapon: null, armor: null, shield: null },
  },
  pos: { lat: 0, lng: 0 },
  env: 'urban',
  lastEnvCheckPos: null,
};

let map, playerMarker;
let monsters = [];
let nextMonsterId = 1;

let battle = null;
let monsterHitTimer = null;
let attackOnCooldown = false;
let pendingLoot = null;

// Floating joystick
const joy = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, tid: null };
const JOY_R = 52;

// Keyboard
const keys = {};
let moveLoop = null;

// ─── Helpers ────────────────────────────────────────────
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2-la1)*r, dLo = (lo2-lo1)*r;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function offsetPos(lat, lng, dist, bearing) {
  const R = 6371000, r = Math.PI/180;
  const φ1=lat*r, λ1=lng*r, θ=bearing*r, δ=dist/R;
  const φ2 = Math.asin(Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ)*Math.sin(δ)*Math.cos(φ1), Math.cos(δ)-Math.sin(φ1)*Math.sin(φ2));
  return { lat: φ2/r, lng: λ2/r };
}

function nearbyRandom(lat, lng) {
  return offsetPos(lat, lng, SPAWN_MIN + Math.random()*(SPAWN_MAX-SPAWN_MIN), Math.random()*360);
}

function shopItemById(id) { return SHOP_ITEMS.find(i => i.id === id); }
function pAtk()   { return G.player.baseAtk + (G.player.eq.weapon?.atk || 0); }
function pDef()   { return G.player.baseDef + (G.player.eq.armor?.def  || 0) + (G.player.eq.shield?.def || 0); }
function pMaxHp() { return 100 + (G.player.eq.armor?.mhp || 0); }
function avatarEmoji() { return G.player.avatar?.e || '🧙'; }

// ─── Persistence ────────────────────────────────────────
function saveGame() {
  try { localStorage.setItem('geohunter_v3', JSON.stringify(G.player)); } catch(e) {}
}
function loadGame() {
  try {
    const s = localStorage.getItem('geohunter_v3');
    if (s) G.player = { ...G.player, ...JSON.parse(s) };
  } catch(e) {}
}

// ─── HUD ────────────────────────────────────────────────
function updateHUD() {
  const mxhp = pMaxHp(), pct = Math.max(0, Math.min(100, G.player.hp/mxhp*100));
  const bar = document.getElementById('hud-hpbar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 50 ? 'linear-gradient(90deg,#a01020,#e84040)'
    : pct > 25 ? 'linear-gradient(90deg,#a06000,#e89020)'
    : 'linear-gradient(90deg,#600808,#c01010)';
  document.getElementById('hud-hpnum').textContent = `${Math.max(0,G.player.hp)} / ${mxhp}`;
  document.getElementById('hud-gold').textContent  = G.player.gold;
  document.getElementById('hud-env').textContent   = `${ENV[G.env].emoji} ${ENV[G.env].name}`;
}

function refreshBattleHUD() {
  if (!battle) return;
  const m = battle.mon, mxhp = pMaxHp();
  document.getElementById('b-mhpbar').style.width = Math.max(0, m.curHp/m.hp*100) + '%';
  document.getElementById('b-mhpv').textContent   = `${Math.max(0,m.curHp)}/${m.hp}`;
  document.getElementById('b-phpbar').style.width = Math.max(0, G.player.hp/mxhp*100) + '%';
  document.getElementById('b-phpv').textContent   = `${Math.max(0,G.player.hp)}/${mxhp}`;
}

// ─── Toast ──────────────────────────────────────────────
let toastTimer;
function showToast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// ─── FX ─────────────────────────────────────────────────
function floatDamage(dmg, cls, targetEl) {
  const el = document.createElement('div');
  el.className = `dmg-float ${cls}`;
  el.textContent = `-${dmg}`;
  const r = targetEl.getBoundingClientRect();
  el.style.left = (r.left + r.width/2 - 20 + rand(-15,15)) + 'px';
  el.style.top  = (r.top + rand(-5,5)) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function screenFlash() {
  const el = document.createElement('div');
  el.className = 'screen-flash';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 350);
}

// ─── Character Picker ────────────────────────────────────
function showCharPicker(reselect = false) {
  const screen = document.getElementById('char-picker');
  screen.querySelector('.cp-title').textContent = reselect ? 'CHANGE CHARACTER' : 'CHOOSE YOUR HERO';
  screen.querySelector('.cp-sub').textContent   = reselect
    ? 'Pick a new look — stats unchanged'
    : 'Select your adventurer to begin';
  const grid = document.getElementById('avatar-grid');
  grid.innerHTML = PLAYER_AVATARS.map(a => `
    <div class="av-card ${G.player.avatar?.id===a.id ? 'av-selected' : ''}"
         onclick="pickAvatar('${a.id}')">
      <div class="av-emoji">${a.e}</div>
      <div class="av-name">${a.name}</div>
    </div>`).join('');
  screen.style.display = 'flex';
}

function pickAvatar(id) {
  const av = PLAYER_AVATARS.find(a => a.id === id);
  if (!av) return;
  G.player.avatar = av;
  saveGame();
  document.getElementById('char-picker').style.display = 'none';
  if (map) {
    // mid-game reselect — just update the marker
    updatePlayerMarkerIcon();
    openStats();
  } else {
    beginBoot();
  }
}

function buildPlayerIcon() {
  return L.divIcon({
    html: `<div class="player-figure">
             <div class="player-glow"></div>
             <div class="player-emoji">${avatarEmoji()}</div>
           </div>`,
    className: '',
    iconSize: [44, 52],
    iconAnchor: [22, 48],
  });
}

function updatePlayerMarkerIcon() {
  if (playerMarker) playerMarker.setIcon(buildPlayerIcon());
}

// ─── Environment ─────────────────────────────────────────
async function detectEnvironment(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await res.json();
    const cls  = (d.class || '').toLowerCase();
    const type = (d.type  || '').toLowerCase();
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
    } else { G.env = env; }
    G.lastEnvCheckPos = { lat, lng };
    updateHUD();
  } catch(e) { G.lastEnvCheckPos = { lat, lng }; }
}

// ─── Map ─────────────────────────────────────────────────
function initMap(lat, lng) {
  map = L.map('map', {
    zoomControl: false, attributionControl: false,
    dragging: false, touchZoom: false,
    scrollWheelZoom: false, doubleClickZoom: false, keyboard: false,
  }).setView([lat, lng], 17);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
  }).addTo(map);
  playerMarker = L.marker([lat, lng], { icon: buildPlayerIcon(), zIndexOffset: 1000 }).addTo(map);
  spawnMonsters();
  detectEnvironment(lat, lng);
}

// ─── Monsters ────────────────────────────────────────────
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
    className: '', iconSize: [48, 54], iconAnchor: [24, 27],
  });
  const mark = L.marker([lat, lng], { icon }).addTo(map);
  mark.on('click', () => { if (!battle) engageBattle(mon, mark, monsters.find(m => m.marker === mark)); });
  monsters.push({ data: mon, marker: mark, lat, lng });
}

function removeMonster(entry) {
  if (entry?.marker) map.removeLayer(entry.marker);
  monsters = monsters.filter(m => m !== entry);
}

function respawnAllMonsters() {
  monsters.forEach(m => map.removeLayer(m.marker));
  monsters = [];
  spawnMonsters();
}

function checkProximity() {
  if (battle) return;
  for (const m of monsters) {
    if (haversine(G.pos.lat, G.pos.lng, m.lat, m.lng) < ENGAGE_RANGE) {
      engageBattle(m.data, m.marker, m);
      break;
    }
  }
}

// ─── Floating Joystick ───────────────────────────────────
function initFloatingJoystick() {
  const ring = document.getElementById('joy-ring');
  const knob = document.getElementById('joy-knob-float');

  function isUI(el) {
    return !!el.closest('#hud-top,#hud-bot,#battle,#loot,.panel,#toast,#char-picker');
  }

  function jStart(cx, cy) {
    joy.active = true; joy.ox = cx; joy.oy = cy; joy.dx = 0; joy.dy = 0;
    ring.style.left    = (cx - JOY_R - 6) + 'px';
    ring.style.top     = (cy - JOY_R - 6) + 'px';
    ring.style.opacity = '1';
    knob.style.transform = 'translate(0,0)';
  }

  function jMove(cx, cy) {
    if (!joy.active) return;
    let dx = cx - joy.ox, dy = cy - joy.oy;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d > JOY_R) { dx = dx/d*JOY_R; dy = dy/d*JOY_R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    joy.dx =  dx / JOY_R;
    joy.dy = -dy / JOY_R;
  }

  function jEnd() {
    joy.active = false; joy.dx = 0; joy.dy = 0;
    ring.style.opacity = '0';
    knob.style.transform = 'translate(0,0)';
  }

  document.addEventListener('touchstart', e => {
    if (joy.active || battle) return;
    const t = e.touches[0];
    if (isUI(t.target)) return;
    joy.tid = t.identifier;
    e.preventDefault();
    jStart(t.clientX, t.clientY);
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!joy.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.tid) { e.preventDefault(); jMove(t.clientX, t.clientY); break; }
    }
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (!joy.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.tid) { jEnd(); break; }
    }
  }, { passive: false });

  document.addEventListener('touchcancel', () => jEnd());
}

// ─── Keyboard ────────────────────────────────────────────
function initKeyboard() {
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    // prevent page scroll with arrows
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
}

function keyDelta() {
  let dx = 0, dy = 0;
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
  if (keys['ArrowUp']    || keys['w'] || keys['W']) dy += 1;
  if (keys['ArrowDown']  || keys['s'] || keys['S']) dy -= 1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  return { dx, dy };
}

// ─── Move Loop ───────────────────────────────────────────
function startMoveLoop() {
  if (moveLoop) return;
  moveLoop = setInterval(() => {
    if (battle) return;
    let dx = joy.dx, dy = joy.dy;
    if (!joy.active) { const kb = keyDelta(); dx = kb.dx; dy = kb.dy; }
    if (Math.abs(dx) < 0.03 && Math.abs(dy) < 0.03) return;

    G.pos.lat += (dy * WALK_SPEED) / 111320;
    G.pos.lng += (dx * WALK_SPEED) / (111320 * Math.cos(G.pos.lat * Math.PI/180));

    playerMarker.setLatLng([G.pos.lat, G.pos.lng]);
    map.setView([G.pos.lat, G.pos.lng], map.getZoom(), { animate: false });

    if (G.lastEnvCheckPos &&
        haversine(G.pos.lat, G.pos.lng, G.lastEnvCheckPos.lat, G.lastEnvCheckPos.lng) > 200) {
      detectEnvironment(G.pos.lat, G.pos.lng);
    }

    checkProximity();
    if (monsters.length < Math.floor(MONSTER_COUNT * 0.5)) spawnMonsters();
  }, 80);
}

// ─── Battle ──────────────────────────────────────────────
function engageBattle(monData, mark, entry) {
  if (battle || G.player.hp <= 0) return;
  const mon = { ...monData, curHp: monData.hp };
  battle = { mon, mark, entry };

  const env = ENV[G.env];
  document.getElementById('b-env-tag').textContent    = `${env.emoji} ${env.name.toUpperCase()} ENCOUNTER`;
  document.getElementById('b-title').textContent      = `${mon.e} ${mon.name.toUpperCase()}!`;
  document.getElementById('b-emoji').textContent      = mon.e;
  document.getElementById('b-mname').textContent      = mon.name;
  document.getElementById('b-mname-bar').textContent  = mon.name;
  document.getElementById('b-mlvl').textContent       = `Level ${mon.lv}`;
  document.getElementById('b-atk-stat').textContent   = `⚔ ATK: ${pAtk()}`;
  document.getElementById('b-def-stat').textContent   = `🛡 DEF: ${pDef()}`;
  document.getElementById('b-player-icon').textContent= avatarEmoji();
  document.getElementById('atk-btn').disabled = false;
  attackOnCooldown = false;
  refreshBattleHUD();
  document.getElementById('battle').classList.add('open');
  monsterHitTimer = setInterval(monsterHit, 2600);
}

function playerAttack() {
  if (!battle || attackOnCooldown) return;
  const m = battle.mon;
  const dmg = Math.max(1, pAtk() - m.def + rand(-2,5));
  m.curHp = Math.max(0, m.curHp - dmg);
  const el = document.getElementById('b-emoji');
  el.classList.remove('mon-hit'); void el.offsetWidth; el.classList.add('mon-hit');
  floatDamage(dmg, 'dmg-yellow', el);
  refreshBattleHUD();
  startAttackCooldown(820);
  if (m.curHp <= 0) onMonsterKilled();
}

function monsterHit() {
  if (!battle) return;
  const dmg = Math.max(1, battle.mon.atk - pDef() + rand(-1,3));
  G.player.hp = Math.max(0, G.player.hp - dmg);
  floatDamage(dmg, 'dmg-red', document.getElementById('b-player-icon'));
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
  removeMonster(battle.entry);

  const gold = m.gold[0] + Math.floor(Math.random()*(m.gold[1]-m.gold[0]+1));
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
  setTimeout(showLootScreen, 420);
  setTimeout(spawnMonsters, 3000);
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
  showToast(`💀 Defeated! Lost ${lost} gold. Revived at 30% HP.`, 4000);
  saveGame();
}

function playerFlee() {
  if (!battle) return;
  clearInterval(monsterHitTimer); monsterHitTimer = null;
  battle = null; attackOnCooldown = false;
  document.getElementById('battle').classList.remove('open');
  showToast('🏃 You escaped!');
}

// ─── Loot ────────────────────────────────────────────────
function showLootScreen() {
  if (!pendingLoot) return;
  document.getElementById('loot-sub').textContent = `You defeated ${pendingLoot.monName}!`;
  document.getElementById('loot-list').innerHTML = pendingLoot.drops.map((d, i) => `
    <div class="loot-row" style="animation-delay:${i*0.1}s">
      <div class="loot-ic">${d.e}</div>
      <div class="loot-info">
        <div class="loot-name">${d.name}</div>
        ${d.stat ? `<div class="loot-stat">${d.stat}</div>` : ''}
      </div>
    </div>`).join('');
  document.getElementById('loot').classList.add('open');
}

function collectLoot() {
  if (!pendingLoot) return;
  for (const d of pendingLoot.drops) {
    if (d.type === 'gold') G.player.gold += d.amt;
    else if (d.item) applyOrEquipItem(d.item, true);
  }
  pendingLoot = null;
  document.getElementById('loot').classList.remove('open');
  updateHUD(); saveGame();
}

// ─── Items ───────────────────────────────────────────────
function applyOrEquipItem(item, fromLoot) {
  if (item.type === 'consumable') {
    G.player.hp = Math.min(pMaxHp(), G.player.hp + (item.hp||0));
    if (fromLoot) showToast(`${item.e} ${item.name}: HP restored`);
    updateHUD();
  } else if (item.type === 'weapon')  G.player.eq.weapon = item;
  else if (item.type === 'armor')   { G.player.eq.armor = item; G.player.maxHp = pMaxHp(); }
  else if (item.type === 'shield')    G.player.eq.shield = item;
}

// ─── Shop ────────────────────────────────────────────────
function openShop()  { renderShop(); document.getElementById('shop-panel').classList.add('open'); }
function closeShop() { document.getElementById('shop-panel').classList.remove('open'); }

function renderShop() {
  document.getElementById('shop-gold-display').textContent = G.player.gold;
  const eq = G.player.eq;
  document.getElementById('shop-grid').innerHTML = SHOP_ITEMS.map(item => {
    const isEq = eq.weapon?.id===item.id || eq.armor?.id===item.id || eq.shield?.id===item.id;
    const can  = G.player.gold >= item.cost;
    return `<div class="shop-card ${isEq?'equipped':''} ${!can&&!isEq?'cant-afford':''}" onclick="buyItem('${item.id}')">
      ${isEq ? '<span class="eq-badge">ON</span>' : ''}
      <div class="si-icon">${item.e}</div>
      <div class="si-name">${item.name}</div>
      <div class="si-desc">${item.desc}</div>
      <div class="si-cost" style="color:${can?'var(--gold)':'var(--muted)'}">💰 ${item.cost}</div>
    </div>`;
  }).join('');
}

function buyItem(id) {
  const item = shopItemById(id);
  if (!item) return;
  if (G.player.gold < item.cost) { showToast('❌ Not enough gold!'); return; }
  G.player.gold -= item.cost;
  applyOrEquipItem(item, false);
  renderShop(); updateHUD(); saveGame();
  showToast(`✅ ${item.name} acquired!`);
}

// ─── Stats ───────────────────────────────────────────────
function openStats() {
  const p = G.player, eq = p.eq;
  document.getElementById('stats-body').innerHTML = `
    <div class="stat-card">
      <div class="stat-section-title">🧝 Hero</div>
      <div class="st-row" style="font-size:1.6rem;padding:8px 0">${avatarEmoji()}</div>
      <div class="st-row"><span class="st-l">Class</span><span class="st-v">${G.player.avatar?.name||'Unknown'}</span></div>
      <div class="st-row cp-btn" onclick="changeAvatar()"><span class="st-l">Look</span><span class="st-v" style="color:var(--gold)">✏️ Change</span></div>
    </div>
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
      <div class="st-row"><span class="st-l">Monsters near</span><span class="st-v">${monsters.length}</span></div>
    </div>`;
  document.getElementById('stats-panel').classList.add('open');
}
function closeStats() { document.getElementById('stats-panel').classList.remove('open'); }

function changeAvatar() {
  closeStats();
  showCharPicker(true);
}

// ─── Boot ────────────────────────────────────────────────
let _bootLat, _bootLng;

function boot(lat, lng) {
  _bootLat = lat; _bootLng = lng;
  loadGame();
  if (!G.player.avatar) {
    showCharPicker(false);
  } else {
    beginBoot();
  }
}

function beginBoot() {
  document.getElementById('load-msg').textContent = 'Spawning creatures...';
  G.pos = { lat: _bootLat, lng: _bootLng };
  updateHUD();
  initMap(_bootLat, _bootLng);
  initFloatingJoystick();
  initKeyboard();
  startMoveLoop();
  setTimeout(() => {
    const l = document.getElementById('loading');
    l.style.opacity = '0';
    setTimeout(() => l.style.display = 'none', 600);
  }, 900);
}

// ─── Entry ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (!navigator.geolocation) { boot(51.5074, -0.1278); return; }
  navigator.geolocation.getCurrentPosition(
    p  => boot(p.coords.latitude, p.coords.longitude),
    () => { showToast('GPS unavailable — demo location'); boot(51.5074, -0.1278); },
    { enableHighAccuracy: true, timeout: 14000, maximumAge: 0 }
  );
});
