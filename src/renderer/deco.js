const { api, uid, DEFAULT_DECO, migrateDeco } = window.Fridge;

const body = document.body;
const fridgeEl = document.querySelector('.fridge');
const doors = {
  fridge: document.querySelector('.door[data-door="fridge"]'),
  freezer: document.querySelector('.door[data-door="freezer"]'),
};
const $ = (id) => document.getElementById(id);

let deco = null;
let tool = 'move';
let selectedId = null;
let targetDoor = 'fridge';
let penColor = '#2e2c29';

// ---------------------------------------------------------------- 저장
let saveTimer = null;
function save(immediate) {
  clearTimeout(saveTimer);
  const run = () => {
    api.patch({ deco });
  };
  if (immediate) run(); else saveTimer = setTimeout(run, 250);
}

// ---------------------------------------------------------------- 크기 맞추기
const BASE_W = 164;
const BASE_H = 448;
function fit() {
  const stage = document.querySelector('.stage');
  const s = Math.min((stage.clientHeight - 90) / BASE_H, (stage.clientWidth - 60) / BASE_W, 2);
  fridgeEl.style.setProperty('--s', Math.max(s, 0.8).toFixed(3));
}
window.addEventListener('resize', fit);

// ---------------------------------------------------------------- 스티커 그리기
function renderColors() {
  document.documentElement.style.setProperty('--handle-color', deco.handleColor);
  fridgeEl.style.setProperty('--fridge-color', deco.fridgeColor);
  doors.fridge.style.setProperty('--door-color', deco.fridgeColor);
  doors.freezer.style.setProperty('--door-color', deco.freezerColor);
  $('fridgeColor').value = deco.fridgeColor;
  $('freezerColor').value = deco.freezerColor;
  markSwatch('doorSwatches', deco.fridgeColor === deco.freezerColor ? deco.fridgeColor : null);
  markSwatch('handleSwatches', deco.handleColor);
}

function markSwatch(id, color) {
  $(id).querySelectorAll('i').forEach((i) => i.classList.toggle('on', i.dataset.c === color));
}

// 색 동그라미 줄 + 마지막에 직접 고르는 무지개 동그라미
function swatchRow(id, colors, onPick) {
  $(id).innerHTML = colors.map((c) => `<i style="background:${c}" data-c="${c}" title="${c}"></i>`).join('')
    + '<label title="직접 고르기"><input type="color"></label>';
  $(id).addEventListener('click', (e) => { if (e.target.dataset.c) onPick(e.target.dataset.c); });
  $(id).querySelector('input').addEventListener('input', (e) => onPick(e.target.value));
}

function renderStickers() {
  for (const door of Object.keys(doors)) {
    const layer = doors[door].querySelector('.stickers');
    layer.innerHTML = '';
    for (const s of deco.stickers.filter((st) => st.door === door)) {
      const el = document.createElement('div');
      el.className = 'sticker' + (s.id === selectedId ? ' sel' : '') + (s.flip ? ' flip' : '');
      el.dataset.id = s.id;
      el.innerHTML = '<img alt=""><span class="h h-size"></span><span class="h h-rot"></span><span class="h h-del" title="떼기">×</span>';
      el.querySelector('img').src = s.src;
      placeSticker(el, s);
      layer.appendChild(el);
    }
  }
  const sel = selected();
  $('selected').classList.toggle('disabled', !sel);
  if (sel) {
    $('stSize').value = Math.round(sel.w * 100);
    $('stRot').value = Math.round(sel.rot || 0);
  }
}

function placeSticker(el, s) {
  el.style.left = `${s.x * 100}%`;
  el.style.top = `${s.y * 100}%`;
  el.style.width = `${s.w * 100}%`;
  el.style.transform = `translate(-50%, -50%) rotate(${s.rot || 0}deg)`;
}

const selected = () => deco.stickers.find((s) => s.id === selectedId) || null;
const stickerEl = (id) => document.querySelector(`.sticker[data-id="${id}"]`);

function select(id) {
  selectedId = id;
  document.querySelectorAll('.sticker').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
  const sel = selected();
  $('selected').classList.toggle('disabled', !sel);
  if (sel) {
    $('stSize').value = Math.round(sel.w * 100);
    $('stRot').value = Math.round(sel.rot || 0);
    setTarget(sel.door);
  }
}

function setTarget(door) {
  targetDoor = door;
  Object.entries(doors).forEach(([d, el]) => el.classList.toggle('target', d === door && tool === 'move'));
}

function addSticker(src, opts = {}) {
  const s = {
    id: uid(),
    door: opts.door || targetDoor,
    src,
    x: opts.x ?? 0.3 + Math.random() * 0.4,
    y: opts.y ?? 0.3 + Math.random() * 0.4,
    w: opts.w ?? 0.38,
    rot: opts.rot ?? Math.round(Math.random() * 16 - 8),
  };
  deco.stickers.push(s);
  selectedId = s.id;
  renderStickers();
  save();
}

// ---------------------------------------------------------------- 스티커 끌기/크기/회전
let drag = null;

document.querySelector('.stage').addEventListener('pointerdown', (e) => {
  if (tool !== 'move') return;
  const el = e.target.closest('.sticker');
  if (!el) {
    const door = e.target.closest('.door');
    if (door) setTarget(door.dataset.door);
    select(null);
    return;
  }
  const s = deco.stickers.find((st) => st.id === el.dataset.id);
  if (!s) return;

  if (e.target.classList.contains('h-del')) {
    removeSticker(s.id);
    return;
  }
  select(s.id);
  const rect = doors[s.door].getBoundingClientRect();
  const cx = rect.left + s.x * rect.width;
  const cy = rect.top + s.y * rect.height;
  let mode = 'move';
  if (e.target.classList.contains('h-size')) mode = 'size';
  else if (e.target.classList.contains('h-rot')) mode = 'rot';

  drag = {
    mode, s, el, rect, cx, cy,
    startX: e.clientX, startY: e.clientY,
    x0: s.x, y0: s.y, w0: s.w,
    dist0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
  };
  el.classList.add('dragging');
  el.setPointerCapture(e.pointerId);
  e.preventDefault();
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { s, rect } = drag;
  if (drag.mode === 'move') {
    s.x = drag.x0 + (e.clientX - drag.startX) / rect.width;
    s.y = drag.y0 + (e.clientY - drag.startY) / rect.height;
  } else if (drag.mode === 'size') {
    const dist = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
    s.w = clamp(drag.w0 * (dist / drag.dist0), 0.05, 1.2);
  } else {
    const ang = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI + 90;
    s.rot = Math.round(((ang + 540) % 360) - 180);
  }
  placeSticker(drag.el, s);
});

window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const { s, el, mode } = drag;
  el.classList.remove('dragging');
  drag = null;
  if (mode === 'move') moveToDoorUnder(s, e.clientX, e.clientY);
  renderStickers();
  save();
});

// 다른 문 위에 놓으면 그 문으로 옮겨 붙이기
function moveToDoorUnder(s, px, py) {
  const cur = doors[s.door].getBoundingClientRect();
  const cx = cur.left + s.x * cur.width;
  const cy = cur.top + s.y * cur.height;
  for (const [door, el] of Object.entries(doors)) {
    const r = el.getBoundingClientRect();
    if (door !== s.door && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
      s.door = door;
      s.x = (cx - r.left) / r.width;
      s.y = (cy - r.top) / r.height;
      s.w = (s.w * cur.width) / r.width;
      setTarget(door);
      break;
    }
  }
  s.x = clamp(s.x, -0.15, 1.15);
  s.y = clamp(s.y, -0.15, 1.15);
}

document.querySelector('.stage').addEventListener('wheel', (e) => {
  const sel = selected();
  if (!sel || tool !== 'move') return;
  e.preventDefault();
  if (e.shiftKey) sel.rot = clamp((sel.rot || 0) + Math.sign(e.deltaY) * 5, -180, 180);
  else sel.w = clamp(sel.w * (e.deltaY < 0 ? 1.06 : 0.94), 0.05, 1.2);
  placeSticker(stickerEl(sel.id), sel);
  select(sel.id);
  save();
}, { passive: false });

function removeSticker(id) {
  deco.stickers = deco.stickers.filter((s) => s.id !== id);
  if (selectedId === id) selectedId = null;
  renderStickers();
  save();
}

$('stSize').addEventListener('input', (e) => {
  const sel = selected(); if (!sel) return;
  sel.w = Number(e.target.value) / 100;
  placeSticker(stickerEl(sel.id), sel); save();
});
$('stRot').addEventListener('input', (e) => {
  const sel = selected(); if (!sel) return;
  sel.rot = Number(e.target.value);
  placeSticker(stickerEl(sel.id), sel); save();
});
$('stFront').addEventListener('click', () => {
  const sel = selected(); if (!sel) return;
  deco.stickers = [...deco.stickers.filter((s) => s !== sel), sel];
  renderStickers(); save();
});
$('stFlip').addEventListener('click', () => {
  const sel = selected(); if (!sel) return;
  sel.flip = !sel.flip;
  renderStickers(); save();
});
$('stDelete').addEventListener('click', () => { if (selectedId) removeSticker(selectedId); });
$('clearStickers').addEventListener('click', () => {
  if (!deco.stickers.length || !confirm('스티커를 전부 뗄까요?')) return;
  deco.stickers = [];
  selectedId = null;
  renderStickers(); save();
});

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) removeSticker(selectedId);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoDoodle(); }
});

// ---------------------------------------------------------------- 이미지 가져오기
const MAX_SIDE = 360;
function fileToSticker(file) {
  if (!file || !file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/webp', 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function addFiles(files, opts) {
  for (const f of files) {
    const src = await fileToSticker(f);
    if (src) addSticker(src, opts);
  }
}

$('file').addEventListener('change', async (e) => {
  await addFiles([...e.target.files]);
  e.target.value = '';
});

document.querySelector('.stage').addEventListener('dragover', (e) => e.preventDefault());
document.querySelector('.stage').addEventListener('drop', async (e) => {
  e.preventDefault();
  const doorEl = e.target.closest('.door');
  let opts;
  if (doorEl) {
    const r = doorEl.getBoundingClientRect();
    opts = { door: doorEl.dataset.door, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  await addFiles([...e.dataTransfer.files], opts);
});

window.addEventListener('paste', async (e) => {
  if (e.target.closest('input')) return;
  const files = [...e.clipboardData.items].filter((it) => it.kind === 'file').map((it) => it.getAsFile());
  if (files.length) await addFiles(files);
});

// 이모지 / 글자 스티커
const EMOJI = ['🍓', '🍋', '🥑', '🍒', '🥚', '🧀', '🐻', '🐱', '🐶', '🐰', '🌷', '🍀', '⭐', '❤️', '☁️', '📌'];
function textToSticker(text, font, color, stroke) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const m = ctx.measureText(text);
  const pad = 16;
  const h = Math.ceil(parseInt(font.match(/(\d+)px/)[1], 10) * 1.3);
  c.width = Math.ceil(m.width) + pad * 2;
  c.height = h + pad * 2;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, c.width / 2, c.height / 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, c.height / 2);
  return c.toDataURL('image/png');
}
$('emoji').innerHTML = EMOJI.map((em) => `<button data-em="${em}">${em}</button>`).join('');
$('emoji').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  addSticker(textToSticker(b.dataset.em, '120px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', '#000'), { w: 0.26 });
});
$('addText').addEventListener('click', async () => {
  const t = $('textSticker').value.trim();
  if (!t) return;
  await document.fonts.load('700 56px Pretendard');
  addSticker(textToSticker(t, '700 56px "Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif', penColor, '#ffffff'), { w: 0.6, rot: 0 });
  $('textSticker').value = '';
});
$('textSticker').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addText').click(); });


// ---------------------------------------------------------------- 낙서
const RES = 3; // 냉장고 위젯 1px당 캔버스 픽셀 수
const canvases = {};
const history = [];
for (const [door, el] of Object.entries(doors)) {
  const c = el.querySelector('.doodle');
  c.width = 158 * RES;
  c.height = (door === 'fridge' ? 280 : 159) * RES;
  canvases[door] = c;
}

function loadDoodles() {
  for (const [door, c] of Object.entries(canvases)) {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const src = deco.doodles?.[door];
    if (src) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = src;
    }
  }
}

function storeDoodle(door) {
  const c = canvases[door];
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let empty = true;
  for (let i = 3; i < data.length; i += 4) { if (data[i]) { empty = false; break; } }
  deco.doodles = { ...deco.doodles, [door]: empty ? null : c.toDataURL('image/png') };
  save();
}

let stroke = null;
for (const [door, c] of Object.entries(canvases)) {
  c.addEventListener('pointerdown', (e) => {
    if (tool === 'move') return;
    const ctx = c.getContext('2d');
    history.push({ door, img: ctx.getImageData(0, 0, c.width, c.height) });
    if (history.length > 30) history.shift();
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = Number($('penSize').value) * RES * (tool === 'eraser' ? 2.5 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    stroke = { door, c, ctx, r, k, last: p };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => {
    if (!stroke || stroke.c !== c) return;
    const { ctx, r, k, last } = stroke;
    const p = { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    stroke.last = p;
  });
  const end = () => {
    if (!stroke || stroke.c !== c) return;
    stroke.ctx.globalCompositeOperation = 'source-over';
    storeDoodle(stroke.door);
    stroke = null;
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

function undoDoodle() {
  const last = history.pop();
  if (!last) return;
  canvases[last.door].getContext('2d').putImageData(last.img, 0, 0);
  storeDoodle(last.door);
}
$('undo').addEventListener('click', undoDoodle);
$('clearDoodle').addEventListener('click', () => {
  if (!confirm('낙서를 전부 지울까요?')) return;
  for (const [door, c] of Object.entries(canvases)) {
    const ctx = c.getContext('2d');
    history.push({ door, img: ctx.getImageData(0, 0, c.width, c.height) });
    ctx.clearRect(0, 0, c.width, c.height);
  }
  deco.doodles = { fridge: null, freezer: null };
  save();
});

const PEN_COLORS = ['#2e2c29', '#ffffff', '#d9543a', '#e9a23b', '#6f9a6a', '#4f7ea8', '#b98bb0'];
swatchRow('penSwatches', PEN_COLORS, (c) => { penColor = c; markSwatch('penSwatches', c); });
markSwatch('penSwatches', penColor);
function showPenSize() {
  const px = Math.max(2, Math.min(22, Number($('penSize').value) * 0.9));
  $('penDot').style.width = $('penDot').style.height = `${px}px`;
}
$('penSize').addEventListener('input', showPenSize);
showPenSize();

// ---------------------------------------------------------------- 도구 전환
$('tools').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  tool = b.dataset.tool;
  document.querySelectorAll('#tools button').forEach((x) => x.classList.toggle('on', x === b));
  body.classList.toggle('drawing', tool !== 'move');
  body.classList.toggle('erasing', tool === 'eraser');
  if (tool !== 'move') select(null);
  setTarget(targetDoor);
});

// ---------------------------------------------------------------- 문 색상
const DOOR_COLORS = ['#ebe7df', '#f6f5f2', '#e3dccf', '#cdd3c5', '#cbd8d6', '#c9d3dc', '#e9d6cf', '#ede0bd', '#d4b49d', '#8d9aa1', '#6f7266', '#3a3936'];
const HANDLE_COLORS = ['#c9c2b6', '#e9e7e3', '#b9bcbf', '#c2a46e', '#2f2e2c'];

swatchRow('doorSwatches', DOOR_COLORS, (c) => {
  deco.fridgeColor = c;
  deco.freezerColor = c;
  $('linkDoors').checked = true;
  renderColors(); save();
});
swatchRow('handleSwatches', HANDLE_COLORS, (c) => {
  deco.handleColor = c;
  renderColors(); save();
});
$('fridgeColor').addEventListener('input', (e) => {
  deco.fridgeColor = e.target.value;
  if ($('linkDoors').checked) deco.freezerColor = e.target.value;
  renderColors(); save();
});
$('freezerColor').addEventListener('input', (e) => {
  deco.freezerColor = e.target.value;
  if ($('linkDoors').checked) deco.fridgeColor = e.target.value;
  renderColors(); save();
});

// ---------------------------------------------------------------- 시작
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

api.getState().then((s) => {
  deco = migrateDeco({ ...DEFAULT_DECO, ...JSON.parse(JSON.stringify(s.deco)) });
  deco.stickers = deco.stickers || [];
  deco.doodles = deco.doodles || { fridge: null, freezer: null };
  $('linkDoors').checked = deco.fridgeColor === deco.freezerColor;
  fit();
  renderColors();
  renderStickers();
  loadDoodles();
  setTarget('fridge');
});
window.addEventListener('beforeunload', () => { if (deco) save(true); });
