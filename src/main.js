// 바탕화면 냉장고 — Electron 메인 프로세스
const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const WIDGET_W = 200;
const WIDGET_H = 500;

let widget = null;
let decoWin = null;
let recipeWin = null;
let tray = null;

// ---------------------------------------------------------------- 저장소
app.setPath('userData', path.join(app.getPath('appData'), 'desktop-fridge'));
const dataFile = () => path.join(app.getPath('userData'), 'fridge-data.json');

function defaultState() {
  return {
    items: [],
    deco: {
      fridgeColor: '#ebe7df',
      freezerColor: '#ebe7df',
      handleColor: '#c9c2b6',
      stickers: [],
      doodles: { fridge: null, freezer: null },
    },
    settings: { alwaysOnTop: false, bounds: null, pantry: true },
  };
}

let state = defaultState();

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    const def = defaultState();
    state = {
      items: Array.isArray(saved.items) ? saved.items : [],
      deco: { ...def.deco, ...(saved.deco || {}) },
      settings: { ...def.settings, ...(saved.settings || {}) },
    };
    state.deco.doodles = { ...def.deco.doodles, ...(state.deco.doodles || {}) };
    // 첫 버전의 민트색 기본값은 새 기본값으로
    if (state.deco.fridgeColor === '#bfe3de') state.deco.fridgeColor = def.deco.fridgeColor;
    if (state.deco.freezerColor === '#bfe3de') state.deco.freezerColor = def.deco.freezerColor;
    if (state.deco.handleColor === '#f4f4f4') state.deco.handleColor = def.deco.handleColor;
  } catch {
    state = defaultState();
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
}
function writeNow() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, dataFile());
  } catch (err) {
    console.error('저장 실패:', err);
  }
}

function broadcast(sender) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== sender) {
      win.webContents.send('state:changed', state);
    }
  }
}

// ---------------------------------------------------------------- 창
function initialBounds() {
  const saved = state.settings.bounds;
  const area = screen.getPrimaryDisplay().workArea;
  if (saved) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x + 40 > a.x && saved.x < a.x + a.width - 40 && saved.y + 40 > a.y && saved.y < a.y + a.height - 40);
    if (visible) return { x: saved.x, y: saved.y };
  }
  return { x: area.x + area.width - WIDGET_W - 24, y: area.y + Math.max(0, area.height - WIDGET_H - 40) };
}

function createWidget() {
  const { x, y } = initialBounds();
  widget = new BrowserWindow({
    x, y,
    width: WIDGET_W,
    height: WIDGET_H,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: !!state.settings.alwaysOnTop,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  widget.setMenu(null);
  widget.loadFile(path.join(__dirname, 'renderer', 'fridge.html'));

  let moveTimer = null;
  widget.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!widget || widget.isDestroyed()) return;
      const [bx, by] = widget.getPosition();
      state.settings.bounds = { x: bx, y: by };
      saveState();
    }, 200);
  });
  widget.on('closed', () => { widget = null; });
}

function openChild(kind) {
  const existing = kind === 'deco' ? decoWin : recipeWin;
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const opts = kind === 'deco'
    ? { width: 760, height: 720, minWidth: 640, minHeight: 600, title: '냉장고 꾸미기' }
    : { width: 460, height: 680, minWidth: 380, minHeight: 460, title: '레시피' };
  const win = new BrowserWindow({
    ...opts,
    autoHideMenuBar: true,
    backgroundColor: '#f4f2ee',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', kind === 'deco' ? 'deco.html' : 'recipes.html'));
  if (kind === 'deco') {
    decoWin = win;
    win.on('closed', () => { decoWin = null; });
  } else {
    recipeWin = win;
    win.on('closed', () => { recipeWin = null; });
  }
}

function buildMenu() {
  const login = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: '꾸미기', click: () => openChild('deco') },
    { label: '레시피', click: () => openChild('recipes') },
    { type: 'separator' },
    {
      label: '항상 위에 표시',
      type: 'checkbox',
      checked: !!state.settings.alwaysOnTop,
      click: (item) => {
        state.settings.alwaysOnTop = item.checked;
        if (widget) widget.setAlwaysOnTop(item.checked);
        saveState();
        refreshTray();
      },
    },
    {
      label: '컴퓨터 켤 때 자동 실행',
      type: 'checkbox',
      checked: !!login.openAtLogin,
      visible: process.platform === 'win32' || process.platform === 'darwin',
      click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); refreshTray(); },
    },
    {
      label: '위치 초기화',
      click: () => {
        const area = screen.getPrimaryDisplay().workArea;
        if (widget) widget.setPosition(area.x + area.width - WIDGET_W - 24, area.y + Math.max(0, area.height - WIDGET_H - 40));
      },
    },
    { label: '냉장고 보이기', click: () => { if (widget) widget.showInactive(); else createWidget(); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildMenu());
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
    tray = new Tray(img.resize({ width: 16, height: 16 }));
    tray.setToolTip('바탕화면 냉장고');
    tray.setContextMenu(buildMenu());
    tray.on('click', () => { if (widget) widget.show(); });
  } catch (err) {
    console.warn('트레이 생성 실패:', err);
  }
}

// ---------------------------------------------------------------- IPC
ipcMain.handle('state:get', () => state);

ipcMain.handle('state:patch', (event, patch) => {
  if (patch && typeof patch === 'object') {
    if (Array.isArray(patch.items)) state.items = patch.items;
    if (patch.deco) state.deco = { ...state.deco, ...patch.deco };
    if (patch.settings) state.settings = { ...state.settings, ...patch.settings };
    saveState();
    broadcast(event.sender);
  }
  return state;
});

ipcMain.on('window:open', (_e, kind) => {
  if (kind === 'deco' || kind === 'recipes') openChild(kind);
});

ipcMain.on('widget:menu', () => {
  if (widget) buildMenu().popup({ window: widget });
});

// ---------------------------------------------------------------- 앱 수명주기
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (widget) widget.show(); });

  app.whenReady().then(() => {
    loadState();
    createWidget();
    createTray();
  });

  // 위젯은 트레이/메뉴의 '종료'로만 닫힌다
  app.on('window-all-closed', () => {});
  app.on('before-quit', writeNow);
  app.on('activate', () => { if (!widget) createWidget(); });
}
