const { SECTIONS, DEFAULT_DECO, api, daysLeft, dLabel, tagStyle, addDays, uid, escapeHtml, sectionById } = window.Fridge;

const app = document.getElementById('app');
const form = document.querySelector('.sheet');
const toast = document.querySelector('.toast');

let state = { items: [], deco: {}, settings: {} };
let editingId = null;

// ---------------------------------------------------------------- 칸 만들기
for (const sec of SECTIONS) {
  const interior = document.querySelector(`.comp[data-door="${sec.door}"] .interior`);
  const el = document.createElement('div');
  el.className = `section ${sec.kind}`;
  el.dataset.section = sec.id;
  el.innerHTML = `<div class="tags"></div><span class="label">${sec.name}</span>`
    + `<button class="add" title="${sec.name}에 넣기"><svg class="ico" viewBox="0 0 12 12"><path d="M6 2.2v7.6M2.2 6h7.6"/></svg></button>`;
  interior.appendChild(el);

  const opt = document.createElement('option');
  opt.value = sec.id;
  opt.textContent = `${sec.door === 'fridge' ? '냉장' : '냉동'} · ${sec.name}`;
  form.section.appendChild(opt);
}

// ---------------------------------------------------------------- 그리기
function renderItems() {
  for (const sec of SECTIONS) {
    const box = document.querySelector(`.section[data-section="${sec.id}"] .tags`);
    const items = state.items
      .filter((it) => it.section === sec.id)
      .map((it) => ({ ...it, days: daysLeft(it.expiry) }))
      .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9) || a.name.localeCompare(b.name, 'ko'));

    box.innerHTML = items.map((it, i) => {
      const st = tagStyle(it.days);
      const title = [it.name, it.expiry ? `${it.expiry} (${dLabel(it.days)})` : '기한 없음', it.memo]
        .filter(Boolean).join('\n');
      return `<span class="tag" data-id="${it.id}" title="${escapeHtml(title)}"
        style="--i:${i};--tag-bg:${st.bg};background:${st.bg};color:${st.fg}">${escapeHtml(it.name)}<button class="x" title="빼기">×</button></span>`;
    }).join('');
  }

  for (const door of ['fridge', 'freezer']) {
    const list = state.items.filter((it) => sectionById(it.section)?.door === door);
    const urgent = list.filter((it) => { const d = daysLeft(it.expiry); return d !== null && d <= 3; }).length;
    const alert = document.querySelector(`.door[data-door="${door}"] .alert`);
    alert.textContent = urgent || '';
    alert.classList.toggle('show', urgent > 0);
    document.querySelector(`.door[data-door="${door}"]`).title = list.length
      ? `${list.length}개${urgent ? ` · 기한 임박 ${urgent}개` : ''}` : '비어 있음';
  }
}

function renderDeco() {
  const deco = { ...DEFAULT_DECO, ...state.deco };
  app.style.setProperty('--fridge-color', deco.fridgeColor);
  app.style.setProperty('--freezer-color', deco.freezerColor);
  app.style.setProperty('--handle-color', deco.handleColor);

  for (const door of ['fridge', 'freezer']) {
    const front = document.querySelector(`.door[data-door="${door}"] .front`);
    const doodle = front.querySelector('.doodle');
    const src = deco.doodles?.[door];
    if (src) doodle.src = src; else doodle.removeAttribute('src');

    front.querySelector('.stickers').innerHTML = (deco.stickers || [])
      .filter((s) => s.door === door)
      .map((s) => `<img class="sticker" src="${s.src}" alt="" style="left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;transform:translate(-50%,-50%) rotate(${s.rot || 0}deg)${s.flip ? ' scaleX(-1)' : ''}">`)
      .join('');
  }
}

function render() {
  renderItems();
  renderDeco();
}

// ---------------------------------------------------------------- 문 열고 닫기
const revealTimers = {};
function setOpen(door, open) {
  const comp = document.querySelector(`.comp[data-door="${door}"]`);
  if (open && !comp.classList.contains('open')) {
    // 문이 열릴 때만 태그가 하나씩 나타나는 효과
    comp.classList.add('revealing');
    clearTimeout(revealTimers[door]);
    revealTimers[door] = setTimeout(() => comp.classList.remove('revealing'), 1200);
  }
  comp.classList.toggle('open', open);
}

document.querySelectorAll('.door').forEach((el) => {
  el.addEventListener('click', () => setOpen(el.dataset.door, true));
});

document.querySelectorAll('.interior').forEach((el) => {
  el.addEventListener('click', (e) => {
    // 빈 곳을 누르면 문 닫기
    if (e.target.closest('.tag, button')) return;
    setOpen(el.parentElement.dataset.door, false);
  });
});

// ---------------------------------------------------------------- 태그
document.querySelector('.fridge').addEventListener('click', (e) => {
  const add = e.target.closest('.section .add');
  if (add) {
    openForm({ section: add.closest('.section').dataset.section });
    return;
  }
  const tag = e.target.closest('.tag');
  if (!tag) return;
  const item = state.items.find((it) => it.id === tag.dataset.id);
  if (!item) return;
  if (e.target.closest('.x')) {
    tag.classList.add('leaving');
    setTimeout(() => removeItem(item.id), 170);
  } else {
    openForm(item);
  }
});

let undoItem = null;
let toastTimer = null;
function removeItem(id) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  save(state.items.filter((it) => it.id !== id));
  undoItem = item;
  toast.querySelector('span').textContent = `'${item.name}' 뺐어요`;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}
toast.querySelector('button').addEventListener('click', () => {
  if (undoItem) save([...state.items, undoItem]);
  undoItem = null;
  toast.classList.add('hidden');
});

function save(items) {
  state.items = items;
  renderItems();
  api.patch({ items });
}

// ---------------------------------------------------------------- 입력 창
function openForm(item = {}) {
  editingId = item.id || null;
  form.classList.toggle('editing', !!editingId);
  form.querySelector('.ok').textContent = editingId ? '저장' : '넣기';
  form.itemName.value = item.name || '';
  form.section.value = item.section || defaultSection();
  form.expiry.value = item.expiry || (editingId ? '' : addDays(7));
  form.memo.value = item.memo || '';
  form.classList.remove('hidden');
  form.itemName.focus();
  form.itemName.select();
}

function defaultSection() {
  const fridgeOpen = document.querySelector('.comp[data-door="fridge"]').classList.contains('open');
  const freezerOpen = document.querySelector('.comp[data-door="freezer"]').classList.contains('open');
  return freezerOpen && !fridgeOpen ? 'freezer-1' : 'fridge-1';
}

function closeForm() {
  form.classList.add('hidden');
  editingId = null;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const names = form.itemName.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (!names.length) return;
  const fields = {
    section: form.section.value,
    expiry: form.expiry.value || null,
    memo: form.memo.value.trim(),
  };
  let items;
  if (editingId) {
    items = state.items.map((it) => (it.id === editingId ? { ...it, ...fields, name: names[0] } : it));
    if (names.length > 1) items.push(...names.slice(1).map((name) => ({ id: uid(), name, ...fields, addedAt: Date.now() })));
  } else {
    items = [...state.items, ...names.map((name) => ({ id: uid(), name, ...fields, addedAt: Date.now() }))];
  }
  save(items);
  setOpen(sectionById(fields.section).door, true);
  closeForm();
});

form.querySelector('.chips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  form.expiry.value = b.dataset.days === '' ? '' : addDays(Number(b.dataset.days));
});
form.querySelector('.cancel').addEventListener('click', closeForm);
form.querySelector('.del').addEventListener('click', () => {
  const id = editingId;
  closeForm();
  removeItem(id);
});

// ---------------------------------------------------------------- 상단 버튼 / 단축키
document.querySelector('.bar').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'add') openForm({});
  else if (act === 'deco' || act === 'recipes') api.openWindow(act);
  else if (act === 'menu') api.showMenu();
});

window.addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, select')) return;
  e.preventDefault();
  api.showMenu();
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!form.classList.contains('hidden')) closeForm();
  else { setOpen('fridge', false); setOpen('freezer', false); }
});

// ---------------------------------------------------------------- 시작
api.onChange((s) => { state = s; render(); });
api.getState().then((s) => { state = s; render(); });

// 날짜가 바뀌면 D-day 색상도 다시 계산
setInterval(renderItems, 10 * 60 * 1000);
