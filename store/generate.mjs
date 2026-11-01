/*
    Generates Chrome Web Store artwork from the real extension UI.

    1. Loads .output/chrome-mv3 in Chrome, pointed at a demo Transmission
       server (store/demo-server.mjs), and captures the popup and settings.
    2. Lays the captures out into store images (store/images/).

    Usage: npm run build && npm run store:assets
    Requires Chrome at CHROME_PATH (default /usr/bin/google-chrome).
*/
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startDemoServer } from './demo-server.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD = join(ROOT, '.output/chrome-mv3');
const OUT = join(ROOT, 'store/images');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
// Last published version without opt-in host access; installing it first and
// updating in place gives the new build host access without a prompt.
const OLD_COMMIT = '04b351d';
// Shown in the settings screenshot; Chrome maps it to the demo server.
const DISPLAY_RPC_URL = 'http://nas.local:9091/transmission/rpc';
const LOCATIONS = [['Movies', '/srv/media/movies'], ['TV', '/srv/media/tv'], ['Linux ISOs', '/srv/isos']];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', (e) => { if (!String(e).includes('Target closed')) throw e; });

const dataUri = (png) => 'data:image/png;base64,' + Buffer.from(png).toString('base64');
const ICON = dataUri(readFileSync(join(ROOT, 'public/img/icon-large.png')));

/* ---------- 1. Capture the real UI ---------- */

async function capture() {
    const demo = await startDemoServer();
    const tmp = mkdtempSync(join(tmpdir(), 't2t-store-'));
    const work = join(tmp, 'ext');
    const old = join(tmp, 'old');
    mkdirSync(old);
    execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${OLD_COMMIT} | tar -x -C "${old}"`]);
    cpSync(old, work, { recursive: true });

    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        pipe: true,
        enableExtensions: [work],
        args: [
            '--no-first-run',
            '--hide-scrollbars',
            `--host-resolver-rules=MAP nas.local:9091 ${new URL(demo.url).host}`,
            ...(process.env.CI ? ['--no-sandbox'] : [])
        ]
    });
    const shots = {};
    try {
        const oldWorker = await (await browser.waitForTarget((t) => t.type() === 'service_worker')).worker();
        await oldWorker.evaluate(async (rpcURL) => {
            while ((await chrome.storage.local.get('refreshRate')).refreshRate === undefined) {
                await new Promise((r) => setTimeout(r, 50));
            }
            await chrome.storage.local.set({ rpcURL, rpcUser: '', rpcPass: '' });
        }, DISPLAY_RPC_URL);
        rmSync(work, { recursive: true, force: true });
        cpSync(BUILD, work, { recursive: true });
        await browser.installExtension(work);
        const target = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
        const id = new URL(target.url()).host;
        await sleep(2000);

        const page = async (path, scheme = 'light', viewport = { width: 420, height: 600 }) => {
            const p = await browser.newPage();
            await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
            await p.setViewport({ ...viewport, deviceScaleFactor: 2 });
            await p.goto(`chrome-extension://${id}/${path}`);
            await sleep(1500);
            return p;
        };
        const settings = await page('options.html', 'light', { width: 760, height: 900 });
        await settings.evaluate((locations) => chrome.storage.local.set({
            'additional-paths': locations, clickMagnets: true, webURL: ''
        }), LOCATIONS);

        // popup, light
        let popup = await page('popup.html');
        shots.popupLight = await (await popup.$('.app')).screenshot();

        // add a torrent into a location
        await popup.click('[data-testid="toggle-add"]');
        await popup.type('[data-testid="add-url"]', 'magnet:?xt=urn:btih:…&dn=Cosmos+Laundromat');
        await popup.select('[data-testid="add-location"]', '/srv/media/movies');
        await popup.click('[data-testid="add-submit"]');
        await popup.waitForSelector('[data-testid="add-result"]', { timeout: 5000 });
        await sleep(300);
        shots.popupAdd = await (await popup.$('.app')).screenshot();
        await popup.close();

        // row menu with "Move to"
        popup = await page('popup.html');
        const row = await popup.evaluateHandle(() =>
            [...document.querySelectorAll('[data-testid="torrent"]')].find((e) => e.querySelector('.name').textContent.startsWith('Fedora')));
        await (await row.$('[data-testid="more"]')).click();
        await popup.waitForSelector('[data-testid="move-to"]', { visible: true });
        await sleep(200);
        shots.popupMenu = await (await popup.$('.app')).screenshot();
        await popup.close();

        // popup, dark
        popup = await page('popup.html', 'dark');
        shots.popupDark = await (await popup.$('.app')).screenshot();
        await popup.close();

        // settings, light: first two cards
        await settings.reload();
        await settings.waitForFunction(() => document.querySelector('[data-testid="connection-status"]')?.dataset.kind === 'ok', { timeout: 8000 });
        await sleep(300);
        const clip = await settings.evaluate(() => {
            const cards = document.querySelectorAll('.card');
            const top = document.querySelector('.page-header').getBoundingClientRect().top - 8;
            const bottom = cards[1].getBoundingClientRect().bottom + 8;
            const left = cards[0].getBoundingClientRect().left - 8;
            return { x: left, y: top, width: cards[0].getBoundingClientRect().width + 16, height: bottom - top };
        });
        shots.settings = await settings.screenshot({ clip });
    } finally {
        await browser.close();
        demo.close();
        rmSync(tmp, { recursive: true, force: true });
    }
    return Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, dataUri(v)]));
}

/* ---------- 2. Compose store images ---------- */

const BASE_CSS = `
    * { box-sizing: border-box; margin: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
        font-family: Inter, "Noto Sans", system-ui, sans-serif;
        color: #fff;
        background:
            radial-gradient(900px 600px at 105% 110%, rgb(239 68 68 / 0.38), transparent 60%),
            radial-gradient(700px 500px at -10% -20%, rgb(96 165 250 / 0.35), transparent 60%),
            linear-gradient(135deg, #0b1630 0%, #13285e 55%, #1b3a8f 100%);
        -webkit-font-smoothing: antialiased;
    }
    .shot {
        border-radius: 14px;
        box-shadow: 0 30px 60px rgb(2 6 23 / 0.45), 0 0 0 1px rgb(255 255 255 / 0.08);
        display: block;
    }
    .copy { position: absolute; left: 88px; top: 0; bottom: 0; width: var(--copy-width, 540px); display: flex; flex-direction: column; justify-content: center; }
    .kicker { display: inline-flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 600; color: #bfdbfe; letter-spacing: 0.01em; margin-bottom: 26px; }
    .kicker img { width: 40px; height: 40px; }
    h1 { font-size: 58px; line-height: 1.08; font-weight: 750; letter-spacing: -0.02em; }
    p.sub { margin-top: 24px; font-size: 25px; line-height: 1.45; color: #c7d2fe; max-width: 520px; }
    ul.points { margin-top: 28px; padding: 0; list-style: none; display: grid; gap: 12px; font-size: 22px; color: #e0e7ff; }
    ul.points li::before { content: "✓"; color: #4ade80; font-weight: 700; margin-right: 12px; }
`;

function copyBlock(title, sub, points = [], width = 540) {
    return `<div class="copy" style="--copy-width:${width}px">
        <div class="kicker"><img src="${ICON}" alt="">.torrent to Transmission</div>
        <h1>${title}</h1>
        <p class="sub">${sub}</p>
        ${points.length ? `<ul class="points">${points.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
    </div>`;
}

const popupAt = (src, { right = 96, top = 70, width = 452 } = {}) =>
    `<img class="shot" src="${src}" style="position:absolute; right:${right}px; top:${top}px; width:${width}px">`;

function screenshots(shots) {
    const contextMenu = `
        <div style="position:absolute; right:64px; top:96px; width:600px; height:600px">
            <div style="position:absolute; left:0; top:0; width:440px; height:470px; border-radius:14px; background:#fff; color:#1f2937; box-shadow:0 30px 60px rgb(2 6 23 / .45); overflow:hidden">
                <div style="height:44px; background:#eef1f5; display:flex; align-items:center; gap:8px; padding:0 16px">
                    <span style="width:12px;height:12px;border-radius:50%;background:#f87171"></span>
                    <span style="width:12px;height:12px;border-radius:50%;background:#fbbf24"></span>
                    <span style="width:12px;height:12px;border-radius:50%;background:#4ade80"></span>
                    <span style="margin-left:14px; flex:1; height:26px; border-radius:13px; background:#fff; font-size:13px; color:#6b7280; display:flex; align-items:center; padding:0 12px">releases.example.org/downloads</span>
                </div>
                <div style="padding:26px 28px; font-size:17px; line-height:1.9">
                    <div style="font-size:22px; font-weight:700; margin-bottom:10px">Downloads</div>
                    <div>Desktop image — <span style="color:#2563eb; text-decoration:underline">ubuntu-26.04.1-desktop-amd64.iso.torrent</span></div>
                    <div>Magnet — <span style="color:#2563eb; text-decoration:underline; background:#dbeafe; border-radius:3px; padding:0 3px">magnet:?xt=urn:btih:…</span></div>
                    <div style="color:#9ca3af">Server image — ubuntu-26.04.1-live-server-amd64.iso.torrent</div>
                </div>
            </div>
            <div style="position:absolute; left:190px; top:208px; width:248px; border-radius:10px; background:#fff; color:#1f2937; font-size:15px; padding:6px 0; box-shadow:0 18px 40px rgb(2 6 23 / .35), 0 0 0 1px rgb(0 0 0 / .06)">
                <div style="padding:7px 16px">Open link in new tab</div>
                <div style="padding:7px 16px">Copy link address</div>
                <div style="height:1px; background:#e5e7eb; margin:5px 0"></div>
                <div style="padding:7px 16px; background:#e8efff; display:flex; align-items:center; gap:10px"><img src="${ICON}" style="width:18px;height:18px">Send to Transmission<span style="margin-left:auto">›</span></div>
                <div style="padding:7px 16px">Inspect</div>
            </div>
            <div style="position:absolute; left:432px; top:296px; width:168px; border-radius:10px; background:#fff; color:#1f2937; font-size:15px; padding:6px 0; box-shadow:0 18px 40px rgb(2 6 23 / .35), 0 0 0 1px rgb(0 0 0 / .06)">
                <div style="padding:7px 16px">Default location</div>
                <div style="height:1px; background:#e5e7eb; margin:5px 0"></div>
                <div style="padding:7px 16px">Movies</div>
                <div style="padding:7px 16px">TV</div>
                <div style="padding:7px 16px; background:#e8efff">Linux ISOs</div>
            </div>
            <div style="position:absolute; left:0; bottom:20px; width:420px; border-radius:14px; background:#1f2430; color:#f3f4f6; padding:16px 18px; display:flex; gap:14px; align-items:center; box-shadow:0 18px 40px rgb(2 6 23 / .45)">
                <img src="${ICON}" style="width:48px;height:48px">
                <div><div style="font-weight:700; font-size:16px">Torrent added</div><div style="font-size:14px; color:#cbd5e1">ubuntu-26.04.1-desktop-amd64.iso</div></div>
            </div>
        </div>`;

    return [
        ['01-popup', copyBlock(
            'Your torrents, one&nbsp;click&nbsp;away',
            'See speeds, progress and time left for everything in Transmission, right from the toolbar.',
            ['Pause, resume and filter at a glance', 'Live speeds and toolbar badge', 'Alternative speed limits toggle']
        ) + popupAt(shots.popupLight)],
        ['02-send-links', copyBlock(
            'Send links from any page',
            'Right-click a magnet or .torrent link and choose <b>Send to Transmission</b>, straight into the folder you pick.',
            ['Download locations submenu', 'Optional: send magnet links on click', 'Works with private trackers'],
            500
        ) + contextMenu],
        ['03-add-torrent', copyBlock(
            'Paste a link, pick a folder',
            'Add magnet links or .torrent URLs from the popup and see the result instantly. Already added? It tells you where it is.',
            []
        ) + popupAt(shots.popupAdd)],
        ['04-manage', copyBlock(
            'Manage without leaving the page',
            'Reorder the queue, verify data, move torrents between folders, or remove them with or without their files.',
            []
        ) + popupAt(shots.popupMenu)],
        ['05-setup', copyBlock(
            'Quick setup, light or dark',
            'Connect once, with access only to your server. Everything else saves as you go, and the look follows your system.',
            [],
            440
        ) + `<img class="shot" src="${shots.settings}" style="position:absolute; right:260px; top:80px; width:430px">`
          + `<img class="shot" src="${shots.popupDark}" style="position:absolute; right:64px; top:250px; width:330px">`]
    ];
}

function promo(shots, { width }) {
    const small = width < 600;
    const bars = [
        ['#5b8cff', 0.72], ['#3fbf6f', 1], ['#5b8cff', 0.38], ['#f0a33a', 0.56]
    ].map(([color, pct]) => `
        <div style="background:rgb(255 255 255 / .1); border-radius:${small ? 8 : 12}px; padding:${small ? '10px 12px' : '16px 20px'}">
            <div style="height:${small ? 7 : 10}px; width:${small ? 70 : 60}%; border-radius:4px; background:rgb(255 255 255 / .55); margin-bottom:${small ? 8 : 12}px"></div>
            <div style="height:${small ? 6 : 8}px; border-radius:4px; background:rgb(255 255 255 / .14)"><div style="height:100%; width:${pct * 100}%; border-radius:4px; background:${color}"></div></div>
        </div>`).join('');
    const right = small
        ? `<div style="position:absolute; right:30px; top:34px; width:200px; display:grid; gap:10px">${bars}</div>`
        : `<img class="shot" src="${shots.popupLight}" style="position:absolute; right:110px; top:56px; width:400px; transform:rotate(0deg)">
           <div style="position:absolute; left:470px; top:140px; width:330px; display:grid; gap:16px">${bars}</div>`;
    return `<div style="position:absolute; left:${small ? 40 : 120}px; top:50%; transform:translateY(-50%);
                width:${small ? 150 : 260}px; height:${small ? 150 : 260}px; border-radius:50%;
                background:radial-gradient(circle, rgb(255 255 255 / .22), rgb(255 255 255 / .04) 70%);
                display:grid; place-items:center">
                <img src="${ICON}" style="width:${small ? 112 : 160}px; height:${small ? 112 : 160}px; image-rendering:auto">
            </div>${right}`;
}

async function render(browser, html, { width, height }, file) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${html}</body></html>`, { waitUntil: 'load' });
    await page.screenshot({ path: file, type: 'png' });
    await page.close();
}

const shots = await capture();
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.env.CI ? ['--no-sandbox'] : [] });
try {
    for (const [name, html] of screenshots(shots)) {
        await render(browser, html, { width: 1280, height: 800 }, join(OUT, `screenshot-${name}.png`));
    }
    await render(browser, promo(shots, { width: 440, height: 280 }), { width: 440, height: 280 }, join(OUT, 'promo-small-440x280.png'));
    await render(browser, promo(shots, { width: 1400, height: 560 }), { width: 1400, height: 560 }, join(OUT, 'promo-marquee-1400x560.png'));
} finally {
    await browser.close();
}
console.log('Wrote store images to', OUT);
