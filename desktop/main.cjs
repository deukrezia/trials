const { app, BrowserWindow, Menu, protocol, net, shell, session, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'rpgmap', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (process.env.VTT_MAP_MAKER_TEST_PROFILE) app.setPath('userData', process.env.VTT_MAP_MAKER_TEST_PROFILE);
const root = path.join(__dirname, '..', 'dist', 'desktop');
let window;

async function createWindow() {
  window = new BrowserWindow({ title: 'Trials', frame: false, width: 1440, height: 1000, minWidth: 650, minHeight: 650, show: process.env.VTT_MAP_MAKER_TEST !== '1', backgroundColor: '#181722', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), partition: 'persist:map-maker', nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const sendState = () => window.webContents.send('trials:window-state', { maximized: window.isMaximized() });
  window.on('maximize', sendState); window.on('unmaximize', sendState);
  window.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('rpgmap://app/')) event.preventDefault(); });
  window.webContents.session.on('will-download', (_event, item) => { if (window && !window.isDestroyed()) item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) }); });
  await window.loadURL('rpgmap://app/');
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ipcMain.on('trials:window-action', (event, action) => {
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('rpgmap://app/')) return;
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (action === 'close') window.close();
    else if (action === 'state') window.webContents.send('trials:window-state', { maximized: window.isMaximized() });
  });
  const currentSession = session.fromPartition('persist:map-maker');
  currentSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  currentSession.protocol.handle('rpgmap', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app' || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    const filename = path.resolve(root, '.' + (decodeURIComponent(url.pathname) === '/' ? '/index.html' : decodeURIComponent(url.pathname))), relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.'))) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(filename).href), headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'");
    return new Response(response.body, { status: response.status, headers });
  });
  await createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
