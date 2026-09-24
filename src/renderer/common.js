// 모든 창이 같이 쓰는 도우미
(function () {
  const SECTIONS = [
    { id: 'fridge-1', door: 'fridge', name: '1단', kind: 'shelf' },
    { id: 'fridge-2', door: 'fridge', name: '2단', kind: 'shelf' },
    { id: 'fridge-3', door: 'fridge', name: '3단 야채실', kind: 'crisper' },
    { id: 'fridge-4', door: 'fridge', name: '4단 신선실', kind: 'crisper' },
    { id: 'freezer-1', door: 'freezer', name: '냉동 1칸', kind: 'drawer' },
    { id: 'freezer-2', door: 'freezer', name: '냉동 2칸', kind: 'drawer' },
    { id: 'freezer-3', door: 'freezer', name: '냉동 3칸', kind: 'drawer' },
  ];

  const DAY = 24 * 60 * 60 * 1000;

  const DEFAULT_DECO = { fridgeColor: '#ebe7df', freezerColor: '#ebe7df', handleColor: '#c9c2b6' };
  // 첫 버전의 민트색 기본값은 새 기본값으로 바꿔 준다
  function migrateDeco(deco) {
    const d = { ...deco };
    if (d.fridgeColor === '#bfe3de') d.fridgeColor = DEFAULT_DECO.fridgeColor;
    if (d.freezerColor === '#bfe3de') d.freezerColor = DEFAULT_DECO.freezerColor;
    if (d.handleColor === '#f4f4f4') d.handleColor = DEFAULT_DECO.handleColor;
    return d;
  }

  function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toISODate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDays(n) {
    const d = todayStart();
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  // 유통기한까지 남은 날 (없으면 null, 지났으면 음수)
  function daysLeft(expiry) {
    if (!expiry) return null;
    const [y, m, d] = expiry.split('-').map(Number);
    if (!y || !m || !d) return null;
    return Math.round((new Date(y, m - 1, d) - todayStart()) / DAY);
  }

  function dLabel(days) {
    if (days === null) return '';
    if (days === 0) return 'D-day';
    return days > 0 ? `D-${days}` : `D+${-days}`;
  }

  // 남은 날이 적을수록 차분한 회색 → 모래색 → 살구 → 빨강 (날짜 글자는 안 보이고 색으로만)
  const STOPS = [
    [0, [217, 84, 58]],
    [1, [228, 128, 99]],
    [3, [240, 195, 172]],
    [6, [237, 224, 200]],
    [10, [234, 231, 225]],
  ];
  function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  function tagStyle(days) {
    if (days === null) return { bg: 'rgb(236,234,230)', fg: '#77716a', level: 'none' };
    if (days < 0) return { bg: 'rgb(150,46,30)', fg: '#fff', level: 'expired' };
    let rgb = STOPS[STOPS.length - 1][1];
    for (let i = 0; i < STOPS.length - 1; i++) {
      const [d0, c0] = STOPS[i];
      const [d1, c1] = STOPS[i + 1];
      if (days <= d1) { rgb = mix(c0, c1, (days - d0) / (d1 - d0)); break; }
    }
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return {
      bg: `rgb(${rgb.join(',')})`,
      fg: lum < 0.66 ? '#fff' : lum < 0.85 ? '#6b3a26' : '#57524a',
      level: days <= 3 ? 'urgent' : 'ok',
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Electron 없이 브라우저에서 열었을 때를 위한 대체 저장소 (미리보기/테스트용)
  function browserBridge() {
    const KEY = 'desktop-fridge-state';
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('desktop-fridge') : null;
    const defaults = () => ({
      items: [],
      deco: {
        fridgeColor: DEFAULT_DECO.fridgeColor, freezerColor: DEFAULT_DECO.freezerColor, handleColor: DEFAULT_DECO.handleColor,
        stickers: [], doodles: { fridge: null, freezer: null },
      },
      settings: { alwaysOnTop: false, bounds: null, pantry: true },
    });
    const read = () => {
      try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (s) {
          const d = defaults();
          return { items: s.items || [], deco: migrateDeco({ ...d.deco, ...s.deco }), settings: { ...d.settings, ...s.settings } };
        }
      } catch { /* 없음 */ }
      return defaults();
    };
    return {
      getState: async () => read(),
      patch: async (patch) => {
        const s = read();
        if (patch.items) s.items = patch.items;
        if (patch.deco) s.deco = { ...s.deco, ...patch.deco };
        if (patch.settings) s.settings = { ...s.settings, ...patch.settings };
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn(e); }
        if (channel) channel.postMessage(s);
        return s;
      },
      onChange: (cb) => { if (channel) channel.onmessage = (e) => cb(e.data); },
      openWindow: (kind) => window.open(kind === 'deco' ? 'deco.html' : 'recipes.html', kind, 'width=820,height=800'),
      showMenu: () => {},
    };
  }

  window.Fridge = {
    SECTIONS, DAY, DEFAULT_DECO, migrateDeco, todayStart, toISODate, addDays, daysLeft, dLabel, tagStyle, uid, escapeHtml,
    api: window.fridge || browserBridge(),
    sectionById: (id) => SECTIONS.find((s) => s.id === id),
  };
})();
