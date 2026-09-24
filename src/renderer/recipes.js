const { api, daysLeft, dLabel, tagStyle, escapeHtml } = window.Fridge;

let state = { items: [], settings: {} };
const picked = new Set();
const opened = new Set();

const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();

// 냉장고 재료 이름이 레시피 재료(key)에 해당하는지
function matches(key, itemName) {
  const def = window.INGREDIENTS[key] || { terms: [key] };
  const name = norm(itemName);
  if ((def.not || []).some((t) => name.includes(norm(t)))) return false;
  return def.terms.some((t) => (t.length === 1 ? name === t : name.includes(norm(t))));
}

function withDays(items) {
  return items.map((it) => ({ ...it, days: daysLeft(it.expiry) }));
}

// 여러 개가 맞으면 유통기한이 가장 급한 것부터 쓴다
function findItem(key, items) {
  return items
    .filter((it) => matches(key, it.name))
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9))[0] || null;
}

function analyze(recipe, items, pantry) {
  const used = [];
  const needs = recipe.need.map((slot) => {
    const alts = Array.isArray(slot) ? slot : [slot];
    for (const key of alts) {
      const item = findItem(key, items);
      if (item) { used.push(item); return { label: key, item }; }
    }
    const fromPantry = pantry && alts.find((k) => window.PANTRY.includes(k));
    if (fromPantry) return { label: fromPantry, pantry: true };
    return { label: alts.join('/'), missing: true };
  });
  const opts = recipe.opt.map((key) => {
    const item = findItem(key, items);
    if (item) used.push(item);
    return { label: key, item };
  });
  const missing = needs.filter((n) => n.missing).length;
  const urgent = used.filter((it) => it.days !== null && it.days <= 3);
  return { recipe, needs, opts, used, missing, urgent, haveCount: used.length };
}

function ingHtml(x, kind) {
  if (x.missing) return `<span class="ing need" title="없는 재료">${escapeHtml(x.label)} 없음</span>`;
  if (x.pantry) return `<span class="ing have" title="기본 재료로 가정">${escapeHtml(x.label)}</span>`;
  if (!x.item) return `<span class="ing opt">+${escapeHtml(x.label)}</span>`;
  const urgent = x.item.days !== null && x.item.days <= 3;
  const cls = `ing have ${kind === 'opt' ? 'opt' : ''} ${urgent ? 'urgent' : ''}`;
  const d = x.item.days !== null ? ` ${dLabel(x.item.days)}` : '';
  return `<span class="${cls}" title="냉장고: ${escapeHtml(x.item.name)}">${kind === 'opt' ? '+' : ''}${escapeHtml(x.item.name)}${d}</span>`;
}

function cardHtml(r) {
  const { recipe } = r;
  const id = recipe.name;
  const score = r.missing ? `<span class="score miss">${r.missing}개 부족</span>` : '<span class="score">바로 가능!</span>';
  const ribbon = r.urgent.length ? `<span class="ribbon">⏰ ${escapeHtml(r.urgent.map((u) => u.name).join(', '))} 빨리 써요</span>` : '';
  return `<article class="card ${opened.has(id) ? 'open' : ''}" data-id="${escapeHtml(id)}">
    <div class="top">
      <span class="emoji">${recipe.emoji}</span>
      <div class="title"><b>${escapeHtml(recipe.name)}</b><span class="meta">${recipe.time}분</span></div>
      ${ribbon}${score}
    </div>
    <div class="ings">${r.needs.map((x) => ingHtml(x, 'need')).join('')}${r.opts.map((x) => ingHtml(x, 'opt')).join('')}</div>
    <div class="details">
      <div class="sauce">🧂 양념: ${escapeHtml(recipe.sauce)}</div>
      <ol>${recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    </div>
  </article>`;
}

function render() {
  const items = withDays(state.items);
  const pantry = document.getElementById('pantry').checked;
  const showAll = document.getElementById('showAll').checked;

  // 내 재료
  for (const id of [...picked]) if (!items.some((it) => it.id === id)) picked.delete(id);
  const mine = [...items].sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  document.getElementById('mine').innerHTML = mine.length
    ? mine.map((it) => {
      const st = tagStyle(it.days);
      return `<span class="pill ${picked.has(it.id) ? 'picked' : ''}" data-id="${it.id}" style="background:${st.bg};border-color:${st.border};color:${st.fg}">
        ${escapeHtml(it.name)}${it.days !== null ? `<span class="d">${dLabel(it.days)}</span>` : ''}</span>`;
    }).join('')
    : '<span class="empty">냉장고가 비어 있어요. 위젯에서 재료를 넣어 주세요.</span>';

  // 레시피
  let results = window.RECIPES.map((r) => analyze(r, items, pantry));
  if (picked.size) {
    results = results.filter((r) => [...picked].every((id) => r.used.some((u) => u.id === id)));
  }
  if (!showAll) results = results.filter((r) => r.haveCount > 0 && r.missing <= 2);
  results.sort((a, b) => a.missing - b.missing || b.urgent.length - a.urgent.length
    || b.haveCount - a.haveCount || a.recipe.time - b.recipe.time);

  const groups = [
    ['✅ 지금 바로 만들 수 있어요', results.filter((r) => r.missing === 0)],
    ['🛒 재료 한두 개만 더 있으면', results.filter((r) => r.missing > 0 && r.missing <= 2)],
    ['📖 나머지 요리', results.filter((r) => r.missing > 2)],
  ].filter(([, list]) => list.length);

  document.getElementById('list').innerHTML = groups.length
    ? groups.map(([title, list]) => `<h3 class="group">${title} <small>(${list.length})</small></h3>${list.map(cardHtml).join('')}`).join('')
    : `<div class="nothing">${picked.size ? '고른 재료를 모두 쓰는 요리를 못 찾았어요.<br>재료 선택을 조금 줄여 보세요.' : '아직 만들 수 있는 요리가 없어요.<br>“못 만드는 요리도 보기”를 켜면 전체 레시피를 볼 수 있어요.'}</div>`;
}

document.getElementById('mine').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  const id = pill.dataset.id;
  if (picked.has(id)) picked.delete(id); else picked.add(id);
  render();
});

document.getElementById('list').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  if (opened.has(id)) opened.delete(id); else opened.add(id);
  card.classList.toggle('open');
});

document.getElementById('pantry').addEventListener('change', (e) => {
  api.patch({ settings: { pantry: e.target.checked } });
  render();
});
document.getElementById('showAll').addEventListener('change', render);

api.onChange((s) => { state = s; render(); });
api.getState().then((s) => {
  state = s;
  document.getElementById('pantry').checked = s.settings?.pantry !== false;
  render();
});
