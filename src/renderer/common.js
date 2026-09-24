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

  // 남은 날이 적을수록 초록 → 노랑 → 빨강 (14일 이상은 완전 초록)
  const FULL_GREEN_DAYS = 14;
  function tagStyle(days) {
    if (days === null) {
      return { bg: '#e9edf1', border: '#b9c3cc', fg: '#46525c' };
    }
    if (days < 0) {
      return { bg: '#8e1b1b', border: '#5c0f0f', fg: '#ffffff' };
    }
    const t = Math.min(days, FULL_GREEN_DAYS) / FULL_GREEN_DAYS; // 0(임박) ~ 1(여유)
    const hue = Math.round(t * 125);
    const light = Math.round(52 + t * 36);          // 임박할수록 진하게
    const sat = Math.round(82 - t * 22);
    return {
      bg: `hsl(${hue} ${sat}% ${light}%)`,
      border: `hsl(${hue} ${sat}% ${Math.max(light - 22, 25)}%)`,
      fg: light < 66 ? '#ffffff' : `hsl(${hue} 60% 22%)`,
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
        fridgeColor: '#bfe3de', freezerColor: '#bfe3de', handleColor: '#f4f4f4',
        stickers: [], doodles: { fridge: null, freezer: null },
      },
      settings: { alwaysOnTop: false, bounds: null, pantry: true },
    });
    const read = () => {
      try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (s) {
          const d = defaults();
          return { items: s.items || [], deco: { ...d.deco, ...s.deco }, settings: { ...d.settings, ...s.settings } };
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
    SECTIONS, DAY, todayStart, toISODate, addDays, daysLeft, dLabel, tagStyle, uid, escapeHtml,
    api: window.fridge || browserBridge(),
    sectionById: (id) => SECTIONS.find((s) => s.id === id),
  };
})();
