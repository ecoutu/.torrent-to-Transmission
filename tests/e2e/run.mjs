/*
    End-to-end tests in real Chrome against a real Transmission server.

    Requires:
    - a Chrome build in .output/chrome-mv3 (npm run build)
    - Transmission RPC at E2E_RPC_URL (default http://127.0.0.1:9091/transmission/rpc)
      with username/password test/test, e.g.:
        docker run -d -p 127.0.0.1:9091:9091 -e USER=test -e PASS=test lscr.io/linuxserver/transmission
    - Chrome at CHROME_PATH (default /usr/bin/google-chrome)

    Usage: npm run test:e2e
*/
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(import.meta.dirname, '../..');
const NEW_BUILD = join(ROOT, '.output/chrome-mv3');
// last published version (1.1.0), used to test upgrades
const OLD_COMMIT = '04b351d';
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const RPC = process.env.E2E_RPC_URL || 'http://127.0.0.1:9091/transmission/rpc';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SCREENSHOTS = process.env.E2E_SCREENSHOTS;
const AUTH = 'Basic ' + btoa('test:test');
const PAGE_PORT = 8765;
const MAGNET = 'magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef&dn=clicked-magnet';
// fake info hashes so the test server never downloads anything real
const ADD_MAGNET = 'magnet:?xt=urn:btih:00000000000000000000000000000000c0ffee00&dn=popup-added';
const SEED_MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=e2e-test-torrent';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The old service worker's CDP session closes during the upgrade.
process.on('unhandledRejection', (e) => { if (!String(e).includes('Target closed')) throw e; });

/* Transmission helpers */
let sessionId = '';
async function rpc(method, args) {
    for (let i = 0; i < 2; i++) {
        const res = await fetch(RPC, {
            method: 'POST',
            headers: { Authorization: AUTH, 'X-Transmission-Session-Id': sessionId },
            body: JSON.stringify({ method, arguments: args })
        });
        if (res.status === 409) {
            sessionId = res.headers.get('X-Transmission-Session-Id');
            continue;
        }
        return res.json();
    }
    throw new Error('session negotiation failed');
}
const torrents = async () => (await rpc('torrent-get', { fields: ['id', 'name', 'status'] })).arguments.torrents;

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            await rpc('session-get');
            return;
        } catch {
            await sleep(1000);
        }
    }
    throw new Error('Transmission not reachable at ' + RPC);
}

async function resetServer() {
    const existing = await torrents();
    if (existing.length) {
        await rpc('torrent-remove', { ids: existing.map((t) => t.id) });
    }
    await rpc('session-set', { 'alt-speed-enabled': false });
    await rpc('torrent-add', { filename: SEED_MAGNET });
}

/* Reporting */
const results = [];
function check(name, ok, detail = '') {
    results.push(!!ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
}

async function screenshot(page, name) {
    if (SCREENSHOTS) {
        mkdirSync(SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(SCREENSHOTS, name + '.png'), fullPage: true });
    }
}

/* Browser helpers */
function launch(extensionDir) {
    return puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        pipe: true,
        enableExtensions: [extensionDir],
        args: ['--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : [])]
    });
}

async function extensionId(browser) {
    const target = await browser.waitForTarget(
        (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
    return new URL(target.url()).host;
}

async function extPage(browser, id, path) {
    const page = await browser.newPage();
    await page.goto(`chrome-extension://${id}/${path}`);
    return page;
}

const waitFor = (page, fn, arg) => page.waitForFunction(fn, { timeout: 6000 }, arg).catch(() => {});

/* Scenarios */
const statusKind = (page) => page.$eval('[data-testid="connection-status"]', (e) => e.dataset.kind).catch(() => null);
const waitForStatus = (page, kind) => waitFor(page, (k) => document.querySelector('[data-testid="connection-status"]')?.dataset.kind === k, kind);

async function freshInstall(work) {
    rmSync(work, { recursive: true, force: true });
    cpSync(NEW_BUILD, work, { recursive: true });
    const browser = await launch(work);
    try {
        const id = await extensionId(browser);
        const options = await extPage(browser, id, 'options.html');
        check('fresh install has no host access',
            (await options.evaluate(() => chrome.permissions.getAll())).origins.length === 0);

        await options.evaluate(async (rpcURL) => {
            while ((await chrome.storage.local.get('refreshRate')).refreshRate === undefined) {
                await new Promise((r) => setTimeout(r, 50));
            }
            await chrome.storage.local.set({ rpcURL, rpcUser: 'test', rpcPass: 'test' });
        }, RPC);
        await options.reload();
        await waitForStatus(options, 'permission');
        check('options asks to connect when access is missing', (await statusKind(options)) === 'permission');
        check('options offers Connect',
            (await options.$eval('[data-testid="save-server"]', (e) => !e.disabled && e.textContent.trim())) === 'Connect');
        await screenshot(options, 'options-permission');

        const popup = await extPage(browser, id, 'popup.html');
        await popup.waitForSelector('[data-testid="grant-access"]', { timeout: 6000 }).catch(() => {});
        check('popup offers to grant access', !!(await popup.$('[data-testid="grant-access"]')));
        await screenshot(popup, 'popup-permission');
    } finally {
        await browser.close();
    }
}

async function upgradeAndUse(work, oldBuild) {
    rmSync(work, { recursive: true, force: true });
    cpSync(oldBuild, work, { recursive: true });
    const browser = await launch(work);
    try {
        // configure 1.1.0, then update in place to the new build
        const oldWorker = await (await browser.waitForTarget((t) => t.type() === 'service_worker')).worker();
        await oldWorker.evaluate(async (rpcURL) => {
            while ((await chrome.storage.local.get('refreshRate')).refreshRate === undefined) {
                await new Promise((r) => setTimeout(r, 50));
            }
            await chrome.storage.local.set({ rpcURL, rpcUser: 'test', rpcPass: 'test' });
        }, RPC);
        rmSync(work, { recursive: true, force: true });
        cpSync(NEW_BUILD, work, { recursive: true });
        await browser.installExtension(work);
        const id = await extensionId(browser);
        await sleep(2500);

        const options = await extPage(browser, id, 'options.html');
        const manifest = await options.evaluate(() => chrome.runtime.getManifest());
        check('upgrade installs the new build', manifest.version === VERSION && !!manifest.optional_host_permissions, manifest.version);
        check('upgrade keeps host access',
            await options.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })));
        check('settings survive upgrade', (await options.evaluate(() => chrome.storage.local.get('rpcURL'))).rpcURL === RPC);
        await waitForStatus(options, 'ok');
        check('options shows connected', (await statusKind(options)) === 'ok');

        const badge = await options.evaluate(() => chrome.action.getBadgeText({}));
        check('badge shows counts', /^\d\/\d$/.test(badge), badge);

        await popupFlows(browser, id, options);
        await magnetClickFlows(browser, id, options);
        await optionsFlows(options);
        await offlineFlows(browser, id, options);
    } finally {
        await browser.close();
    }
}

async function popupFlows(browser, id, options) {
    const popup = await extPage(browser, id, 'popup.html');
    const errors = [];
    popup.on('pageerror', (e) => errors.push(String(e)));
    await popup.setViewport({ width: 420, height: 600 });
    const rows = () => popup.$$('[data-testid="torrent"]');
    const names = () => popup.$$eval('[data-testid="torrent"] .name', (els) => els.map((e) => e.textContent));

    await popup.waitForSelector('[data-testid="torrent"]', { timeout: 6000 }).catch(() => {});
    check('popup lists torrents on first open', JSON.stringify(await names()) === '["e2e-test-torrent"]', JSON.stringify(await names()));
    await screenshot(popup, 'popup');

    await popup.click('[data-testid="torrent"] [data-testid="pause"]');
    await popup.waitForSelector('[data-testid="torrent"] [data-testid="resume"]', { timeout: 6000 }).catch(() => {});
    check('pause updates server and popup',
        (await torrents())[0].status === 0 && !!(await popup.$('[data-testid="torrent"] [data-testid="resume"]')));

    await popup.click('[data-testid="filter-pause"]');
    check('paused tab shows paused torrent', (await rows()).length === 1);
    await popup.click('[data-testid="filter-download"]');
    check('downloading tab hides paused torrent', (await rows()).length === 0 && !!(await popup.$('[data-testid="empty"]')));
    await popup.click('[data-testid="filter-all"]');

    await popup.click('[data-testid="resume-all"]');
    await sleep(2000);
    check('resume all starts torrent', (await torrents())[0].status !== 0);

    await popup.click('[data-testid="alt-speed"]');
    await waitFor(popup, () => document.querySelector('[data-testid="alt-speed"]').getAttribute('aria-pressed') === 'true');
    check('turtle toggles alt speed',
        (await rpc('session-get', { fields: ['alt-speed-enabled'] })).arguments['alt-speed-enabled'] === true &&
        (await popup.$eval('[data-testid="alt-speed"]', (e) => e.getAttribute('aria-pressed'))) === 'true');
    await rpc('session-set', { 'alt-speed-enabled': false });

    // add from the popup, into a download location
    await options.evaluate(() => chrome.storage.local.set({ 'additional-paths': [['Movies', '/downloads/movies']] }));
    await popup.click('[data-testid="toggle-add"]');
    await popup.waitForSelector('[data-testid="add-location"]', { timeout: 6000 }).catch(() => {});
    check('add form offers download locations', !!(await popup.$('[data-testid="add-location"]')));
    await popup.type('[data-testid="add-url"]', ADD_MAGNET);
    await popup.select('[data-testid="add-location"]', '/downloads/movies');
    await popup.click('[data-testid="add-submit"]');
    await popup.waitForSelector('[data-testid="add-result"]', { timeout: 6000 }).catch(() => {});
    const added = (await rpc('torrent-get', { fields: ['name', 'downloadDir'] })).arguments.torrents.find((t) => t.name === 'popup-added');
    check('adding from the popup reports success',
        ((await popup.$eval('[data-testid="add-result"]', (e) => e.textContent).catch(() => '')) || '').includes('Torrent added'));
    check('popup add uses the chosen location', added?.downloadDir === '/downloads/movies', added?.downloadDir);
    await screenshot(popup, 'popup-add');
    await popup.click('[data-testid="toggle-add"]');
    await options.evaluate(() => chrome.storage.local.set({ 'additional-paths': [] }));

    // remove via the row menu with confirmation
    await popup.waitForFunction(() => [...document.querySelectorAll('[data-testid="torrent"] .name')].some((e) => e.textContent === 'popup-added'), { timeout: 6000 }).catch(() => {});
    const row = await popup.evaluateHandle(() =>
        [...document.querySelectorAll('[data-testid="torrent"]')].find((e) => e.querySelector('.name').textContent === 'popup-added'));
    await (await row.$('[data-testid="more"]')).click();
    await (await row.$('[data-testid="remove"]')).click();
    check('remove asks for confirmation', !!(await row.$('[data-testid="confirm-remove"]')));
    await (await row.$('[data-testid="confirm-remove"]')).click();
    await sleep(2000);
    check('confirmed remove deletes the torrent', !(await torrents()).some((t) => t.name === 'popup-added'));

    check('no popup errors', errors.length === 0, errors.join(' | '));
    await popup.close();
}

async function magnetClickFlows(browser, id, options) {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<a id="m" href="${MAGNET}">magnet</a>`);
    }).listen(PAGE_PORT, '127.0.0.1');
    const pageUrl = `http://127.0.0.1:${PAGE_PORT}/`;
    const hasClicked = async () => (await torrents()).some((t) => t.name === 'clicked-magnet');
    const registered = () => options.evaluate(() => chrome.scripting.getRegisteredContentScripts());

    try {
        // Off by default. An unhandled magnet click leaves an external
        // protocol prompt on the tab, so close it afterwards.
        const off = await browser.newPage();
        await off.goto(pageUrl);
        await off.click('#m');
        await sleep(1500);
        check('magnet click ignored while option is off', !(await hasClicked()));
        await off.close();

        await options.bringToFront();
        await options.click('[data-testid="click-magnets"]');
        await waitFor(options, () => document.querySelector('[data-testid="toast"]').textContent === 'Saved');
        check('toggle autosaves without prompting when access is granted',
            (await options.$eval('[data-testid="toast"]', (e) => e.textContent)) === 'Saved' &&
            (await options.evaluate(() => chrome.storage.local.get('clickMagnets'))).clickMagnets === true);
        await sleep(500);
        check('magnet content script registered', (await registered()).some((s) => s.id === 'magnet-click'));

        const on = await browser.newPage();
        await on.goto(pageUrl);
        await on.click('#m');
        await sleep(2500);
        check('clicking a magnet link adds it to Transmission', await hasClicked());

        const clicked = (await torrents()).filter((t) => t.name === 'clicked-magnet').map((t) => t.id);
        await rpc('torrent-remove', { ids: clicked });
        await sleep(500);
        await on.keyboard.down('Shift');
        await on.click('#m').catch(() => {});
        await on.keyboard.up('Shift');
        await sleep(1500);
        check('shift-click is not intercepted', !(await hasClicked()));
        await on.close();

        await options.bringToFront();
        await options.click('[data-testid="click-magnets"]');
        await sleep(1000);
        check('magnet content script unregistered when disabled', (await registered()).length === 0);
    } finally {
        server.close();
    }
}

async function optionsFlows(options) {
    await options.bringToFront();
    await options.setViewport({ width: 900, height: 900 });

    // download locations
    await options.type('[data-testid="location-label"]', 'Movies');
    await options.type('[data-testid="location-dir"]', '/downloads/movies');
    await options.click('[data-testid="location-add"]');
    await sleep(300);
    check('download location is saved',
        JSON.stringify((await options.evaluate(() => chrome.storage.local.get('additional-paths')))['additional-paths']) ===
        JSON.stringify([['Movies', '/downloads/movies']]));
    await screenshot(options, 'options');

    // wrong password is reported on save
    await options.click('[data-testid="rpc-pass"]', { count: 3 });
    await options.type('[data-testid="rpc-pass"]', 'wrong');
    check('unsaved server changes are flagged', (await options.$eval('[data-testid="connection-status"]', (e) => e.textContent)).includes('Unsaved'));
    await options.click('[data-testid="save-server"]');
    await waitForStatus(options, 'error');
    check('options reports bad password',
        (await options.$eval('[data-testid="connection-status"]', (e) => e.textContent)).includes('Wrong username or password'));

    await options.click('[data-testid="rpc-pass"]', { count: 3 });
    await options.type('[data-testid="rpc-pass"]', 'test');
    await options.click('[data-testid="save-server"]');
    await waitForStatus(options, 'ok');
    check('fixing the password reconnects', (await statusKind(options)) === 'ok');
}

async function offlineFlows(browser, id, options) {
    const popup = await extPage(browser, id, 'popup.html');
    await popup.waitForSelector('[data-testid="torrent"]', { timeout: 6000 }).catch(() => {});

    await options.evaluate(() => chrome.storage.local.set({ rpcURL: 'http://127.0.0.1:1/transmission/rpc' }));
    await popup.waitForSelector('[data-testid="connection-error"]', { timeout: 6000 }).catch(() => {});
    check('popup shows connection error', !!(await popup.$('[data-testid="connection-error"]')));
    await screenshot(popup, 'popup-error');
    check('badge shows offline', (await options.evaluate(() => chrome.action.getBadgeText({}))) === '?');

    await options.evaluate((rpcURL) => chrome.storage.local.set({ rpcURL }), RPC);
    await popup.waitForSelector('[data-testid="torrent"]', { timeout: 8000 }).catch(() => {});
    check('popup recovers when server returns', (await popup.$$('[data-testid="torrent"]')).length === 1);
    await popup.close();
}

/* Main */
const tmp = mkdtempSync(join(tmpdir(), 't2t-e2e-'));
try {
    const oldBuild = join(tmp, 'old');
    mkdirSync(oldBuild);
    execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${OLD_COMMIT} | tar -x -C "${oldBuild}"`]);

    await waitForServer();
    await resetServer();
    await freshInstall(join(tmp, 'fresh'));
    await upgradeAndUse(join(tmp, 'upgrade'), oldBuild);
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
