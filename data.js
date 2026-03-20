// ═══════════════════════════════════════════════════════════
//  GeoHunter RPG — data.js
//  All static game data: environments, monsters, shop, drops
// ═══════════════════════════════════════════════════════════

const ENV = {
  water: {
    name: 'Water',
    emoji: '🌊',
    bgColor: '#040c18',
    accentColor: '#1060c0',
    monsters: [
      { name:'Sea Serpent', e:'🐍', hp:30, atk:8,  def:3,  gold:[10,25], lv:3 },
      { name:'Angry Crab',  e:'🦀', hp:22, atk:6,  def:6,  gold:[8,18],  lv:2 },
      { name:'Kraken',      e:'🦑', hp:65, atk:15, def:9,  gold:[30,65], lv:9 },
      { name:'Deep Horror', e:'🐙', hp:75, atk:18, def:10, gold:[40,80], lv:11 },
      { name:'Siren',       e:'🧜', hp:28, atk:12, def:2,  gold:[15,30], lv:4 },
    ]
  },
  forest: {
    name: 'Forest',
    emoji: '🌲',
    bgColor: '#040e06',
    accentColor: '#208040',
    monsters: [
      { name:'Forest Wolf', e:'🐺', hp:25, atk:7,  def:2,  gold:[8,18],  lv:2 },
      { name:'Goblin',      e:'👺', hp:20, atk:5,  def:1,  gold:[5,15],  lv:1 },
      { name:'Forest Bear', e:'🐻', hp:50, atk:12, def:6,  gold:[20,45], lv:6 },
      { name:'Dark Fairy',  e:'🧚', hp:18, atk:9,  def:1,  gold:[12,22], lv:3 },
      { name:'Tree Troll',  e:'🧌', hp:65, atk:14, def:8,  gold:[30,60], lv:9 },
    ]
  },
  urban: {
    name: 'Urban',
    emoji: '🏙️',
    bgColor: '#08080f',
    accentColor: '#6040c0',
    monsters: [
      { name:'Street Wraith',   e:'👻', hp:20, atk:6,  def:1,  gold:[5,15],  lv:1 },
      { name:'Sewer Rat King',  e:'🐀', hp:28, atk:7,  def:3,  gold:[10,20], lv:3 },
      { name:'Gargoyle',        e:'🗿', hp:40, atk:10, def:8,  gold:[18,38], lv:6 },
      { name:'Shadow Bot',      e:'🤖', hp:35, atk:9,  def:5,  gold:[15,30], lv:5 },
      { name:'Dark Mage',       e:'🧙', hp:30, atk:14, def:2,  gold:[20,40], lv:6 },
    ]
  },
  industrial: {
    name: 'Industrial',
    emoji: '🏭',
    bgColor: '#0a0806',
    accentColor: '#c06010',
    monsters: [
      { name:'Rust Golem',  e:'🤖', hp:45, atk:11, def:9,  gold:[18,40], lv:7 },
      { name:'Toxic Slime', e:'🟢', hp:28, atk:8,  def:3,  gold:[10,22], lv:3 },
      { name:'Mech Drone',  e:'🦾', hp:38, atk:10, def:6,  gold:[15,32], lv:5 },
      { name:'Acid Spider', e:'🕷️', hp:22, atk:12, def:2,  gold:[12,25], lv:4 },
    ]
  },
  mountain: {
    name: 'Mountain',
    emoji: '⛰️',
    bgColor: '#080a0c',
    accentColor: '#8090a0',
    monsters: [
      { name:'Stone Troll', e:'👹', hp:55, atk:14, def:10, gold:[25,55], lv:8 },
      { name:'Rock Eagle',  e:'🦅', hp:30, atk:9,  def:4,  gold:[12,25], lv:4 },
      { name:'Cave Giant',  e:'🧟', hp:70, atk:18, def:12, gold:[40,80], lv:11 },
      { name:'Ice Witch',   e:'🧊', hp:35, atk:15, def:5,  gold:[22,45], lv:7 },
    ]
  },
  desert: {
    name: 'Desert',
    emoji: '🏜️',
    bgColor: '#0e0a04',
    accentColor: '#c09020',
    monsters: [
      { name:'Scorpion King', e:'🦂', hp:32, atk:10, def:5,  gold:[12,25], lv:5 },
      { name:'Sand Worm',     e:'🪱', hp:55, atk:13, def:7,  gold:[22,48], lv:7 },
      { name:'Mummy',         e:'🧟', hp:38, atk:8,  def:8,  gold:[15,35], lv:5 },
      { name:'Desert Djinn',  e:'🌪️', hp:42, atk:16, def:3,  gold:[25,50], lv:8 },
    ]
  },
  cemetery: {
    name: 'Cemetery',
    emoji: '⚰️',
    bgColor: '#080810',
    accentColor: '#604080',
    monsters: [
      { name:'Grave Zombie',   e:'🧟', hp:28, atk:7,  def:4,  gold:[10,22], lv:3 },
      { name:'Bone Archer',    e:'💀', hp:22, atk:10, def:2,  gold:[12,24], lv:4 },
      { name:'Banshee',        e:'👻', hp:20, atk:13, def:1,  gold:[15,28], lv:5 },
      { name:'Lich Lord',      e:'🦴', hp:60, atk:18, def:6,  gold:[35,70], lv:10 },
      { name:'Death Knight',   e:'🪦', hp:45, atk:14, def:10, gold:[25,50], lv:8 },
    ]
  },
};

const SHOP_ITEMS = [
  // Consumables
  { id:'pot_s',  name:'Health Potion', e:'🧪', type:'consumable', hp:50,          cost:30,  desc:'+50 HP restore' },
  { id:'pot_l',  name:'Mega Potion',   e:'💊', type:'consumable', hp:150,         cost:80,  desc:'+150 HP restore' },
  { id:'elixir', name:'Elixir',        e:'✨', type:'consumable', hp:9999,        cost:200, desc:'Full HP restore' },
  // Weapons
  { id:'sw1',    name:'Iron Sword',    e:'⚔️',  type:'weapon',    atk:5,          cost:50,  desc:'+5 Attack' },
  { id:'sw2',    name:'Steel Sword',   e:'🗡️',  type:'weapon',    atk:12,         cost:150, desc:'+12 Attack' },
  { id:'sw3',    name:'Dragon Blade',  e:'🔥',  type:'weapon',    atk:25,         cost:400, desc:'+25 Attack' },
  // Shields
  { id:'sh1',    name:'Wood Shield',   e:'🛡️',  type:'shield',    def:5,          cost:40,  desc:'+5 Defense' },
  { id:'sh2',    name:'Iron Shield',   e:'🔰',  type:'shield',    def:12,         cost:120, desc:'+12 Defense' },
  { id:'sh3',    name:'Titan Shield',  e:'🪬',  type:'shield',    def:25,         cost:350, desc:'+25 Defense' },
  // Armor
  { id:'ar1',    name:'Leather Armor', e:'🥋',  type:'armor',     def:8,  mhp:20, cost:80,  desc:'+8 DEF / +20 MaxHP' },
  { id:'ar2',    name:'Chain Mail',    e:'⛓️',  type:'armor',     def:18, mhp:40, cost:200, desc:'+18 DEF / +40 MaxHP' },
  { id:'ar3',    name:'Dragon Armor',  e:'🐲',  type:'armor',     def:30, mhp:80, cost:500, desc:'+30 DEF / +80 MaxHP' },
];

const DROP_TABLE = [
  { itemId:'pot_s',  chance:0.40 },
  { itemId:'sw1',    chance:0.12 },
  { itemId:'sh1',    chance:0.12 },
  { itemId:'ar1',    chance:0.08 },
  { itemId:'sw2',    chance:0.06 },
  { itemId:'sh2',    chance:0.06 },
  { itemId:'pot_l',  chance:0.05 },
  { itemId:'ar2',    chance:0.04 },
];

// Player avatar choices
const PLAYER_AVATARS = [
  { id:'knight',  e:'🧙', name:'Mage'     },
  { id:'warrior', e:'⚔️',  name:'Warrior'  },
  { id:'ninja',   e:'🥷', name:'Ninja'    },
  { id:'archer',  e:'🏹', name:'Archer'   },
  { id:'witch',   e:'🧟', name:'Undead'   },
  { id:'elf',     e:'🧝', name:'Elf'      },
  { id:'dwarf',   e:'👷', name:'Dwarf'    },
  { id:'pirate',  e:'🫅', name:'Noble'    },
  { id:'zombie',  e:'🤺', name:'Duelist'  },
  { id:'alien',   e:'👽', name:'Alien'    },
  { id:'robot',   e:'🤖', name:'Mech'     },
  { id:'dragon',  e:'🐲', name:'Dragonkin'},
];

// How far (meters) player must be to trigger encounter
const ENGAGE_RANGE = 45;

// Player walk speed in meters per tick (tick = 80ms)
const WALK_SPEED = 2.5;

// How far monsters spawn from player (min/max meters)
const SPAWN_MIN = 80;
const SPAWN_MAX = 280;

// Terrain scan radius — Overpass query radius in meters
const TERRAIN_SCAN_RADIUS = 500;

// Number of monsters to keep on map at once
const MONSTER_COUNT = 8;
