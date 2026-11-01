<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from 'wxt/browser';
    import Icon from '@/components/Icon.svelte';
    import Toggle from '@/components/Toggle.svelte';
    import {
        ALL_SITES,
        DEFAULTS,
        describeStatus,
        originPattern,
        rpcRequest,
        type DownloadLocation,
        type SessionInfo,
        type Settings,
        webInterfaceURL
    } from '@/utils/transmission';

    type Stored = Partial<Settings>;
    type ConnectionStatus =
        | { kind: 'idle' }
        | { kind: 'testing' }
        | { kind: 'ok'; version: string }
        | { kind: 'permission' }
        | { kind: 'error'; message: string; field?: 'auth' | 'url' };

    const DURATIONS = [
        { value: 5, label: '5 seconds' },
        { value: 10, label: '10 seconds' },
        { value: 30, label: '30 seconds' },
        { value: 0, label: 'Never (keep until dismissed)' }
    ];
    const REFRESH_RATES = [1, 2, 5, 10, 30];

    // Server form (saved explicitly)
    let rpcURL = $state('');
    let rpcUser = $state('');
    let rpcPass = $state('');
    let webURL = $state('');
    let showPassword = $state(false);
    let saved = $state({ rpcURL: '', rpcUser: '', rpcPass: '', webURL: '' });
    let status = $state<ConnectionStatus>({ kind: 'idle' });

    // Autosaved settings
    let clickMagnets = $state(false);
    let sendTorrentFile = $state(false);
    let displayNotification = $state(true);
    let notificationDuration = $state(10);
    let refreshRate = $state(5);
    let locations = $state<DownloadLocation[]>([]);
    let newLabel = $state('');
    let newDirectory = $state('');
    let permissionNote = $state('');

    let grantedOrigins: string[] = [];
    let toast = $state('');
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    let loaded = $state(false);
    let testSeq = 0;

    const dirty = $derived(
        rpcURL !== saved.rpcURL || rpcUser !== saved.rpcUser || rpcPass !== saved.rpcPass || webURL !== saved.webURL
    );
    const urlValid = $derived(!!originPattern(rpcURL));
    const webPlaceholder = $derived(webInterfaceURL('', rpcURL));
    const durationOptions = $derived(
        DURATIONS.some((d) => d.value === notificationDuration)
            ? DURATIONS
            : [...DURATIONS, { value: notificationDuration, label: notificationDuration + ' seconds' }]
    );
    const refreshOptions = $derived(
        (REFRESH_RATES.includes(refreshRate) ? REFRESH_RATES : [...REFRESH_RATES, refreshRate]).sort((a, b) => a - b)
    );
    const version = browser.runtime.getManifest().version;

    function flash(message = 'Saved') {
        toast = message;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (toast = ''), 1800);
    }

    async function persist(values: Stored & Record<string, unknown>) {
        await browser.storage.local.set(values);
        flash();
    }

    async function refreshGranted() {
        grantedOrigins = (await browser.permissions.getAll()).origins ?? [];
    }

    function isCovered(origin: string): boolean {
        const scheme = origin.split('://')[0];
        return grantedOrigins.includes(origin) ||
            grantedOrigins.includes(scheme + '://*/*') ||
            grantedOrigins.includes('<all_urls>');
    }

    async function testConnection() {
        const seq = ++testSeq;
        const pattern = originPattern(saved.rpcURL);
        if (!pattern) {
            status = { kind: 'error', message: 'Enter an http:// or https:// address', field: 'url' };
            return;
        }
        await refreshGranted();
        if (!isCovered(pattern)) {
            status = { kind: 'permission' };
            return;
        }
        status = { kind: 'testing' };
        const { status: code, data } = await rpcRequest<SessionInfo['arguments']>({ method: 'session-get' });
        if (seq !== testSeq) return;
        if (code === 200 && data?.result === 'success' && data.arguments) {
            const args = data.arguments as SessionInfo['arguments'] & { version?: string };
            // "4.1.4 (a6d907d9ea)" -> "4.1.4"
            const release = (args.version ?? '').split(' ')[0];
            status = { kind: 'ok', version: 'Transmission ' + release + ' · RPC ' + args['rpc-version'] };
        } else if (code === 401) {
            status = { kind: 'error', message: describeStatus(code), field: 'auth' };
        } else if (code === 200) {
            status = { kind: 'error', message: 'That address answered, but it isn\'t a Transmission RPC endpoint', field: 'url' };
        } else {
            status = { kind: 'error', message: describeStatus(code), field: code === 0 || code === 404 ? 'url' : undefined };
        }
    }

    // Must start permissions.request synchronously inside the click.
    function saveServer(event: SubmitEvent) {
        event.preventDefault();
        if (!urlValid) {
            status = { kind: 'error', message: 'Enter an http:// or https:// address', field: 'url' };
            return;
        }
        const pattern = originPattern(rpcURL)!;
        const request = isCovered(pattern)
            ? Promise.resolve(true)
            : browser.permissions.request({ origins: [pattern] }).catch(() => false);

        const values = { rpcURL: rpcURL.trim(), rpcUser, rpcPass, webURL: webURL.trim() };
        request.then(async (granted) => {
            await browser.storage.local.set(values);
            saved = { ...values };
            rpcURL = values.rpcURL;
            webURL = values.webURL;
            flash();
            if (!granted) {
                status = { kind: 'permission' };
                return;
            }
            testConnection();
        });
    }

    // Turning on either option needs access to every site.
    function setAllSitesOption(key: 'clickMagnets' | 'sendTorrentFile', value: boolean, revert: () => void) {
        permissionNote = '';
        if (!value || ALL_SITES.every(isCovered)) {
            persist({ [key]: value });
            return;
        }
        browser.permissions.request({ origins: ALL_SITES }).catch(() => false).then((granted) => {
            if (granted) {
                refreshGranted();
                persist({ [key]: value });
            } else {
                revert();
                permissionNote = 'This option needs access to all sites. Turn it on again and choose Allow to use it.';
            }
        });
    }

    function addLocation(event: SubmitEvent) {
        event.preventDefault();
        const directory = newDirectory.trim();
        if (!directory) return;
        locations = [...locations, [newLabel.trim(), directory]];
        newLabel = '';
        newDirectory = '';
        persist({ 'additional-paths': $state.snapshot(locations) as DownloadLocation[] });
    }

    function removeLocation(index: number) {
        locations = locations.filter((_, i) => i !== index);
        persist({ 'additional-paths': $state.snapshot(locations) as DownloadLocation[] });
    }

    onMount(async () => {
        const items = await browser.storage.local.get([
            'rpcURL', 'rpcUser', 'rpcPass', 'webURL', 'clickMagnets', 'sendTorrentFile', 'displayNotification',
            'notificationDuration', 'refreshRate', 'additional-paths'
        ]) as Stored;

        rpcURL = items.rpcURL ?? DEFAULTS.rpcURL;
        rpcUser = items.rpcUser ?? '';
        rpcPass = items.rpcPass ?? '';
        webURL = items.webURL ?? '';
        saved = { rpcURL, rpcUser, rpcPass, webURL };
        clickMagnets = !!items.clickMagnets;
        sendTorrentFile = !!items.sendTorrentFile;
        displayNotification = items.displayNotification ?? DEFAULTS.displayNotification;
        notificationDuration = Number(items.notificationDuration ?? DEFAULTS.notificationDuration);
        refreshRate = Number(items.refreshRate ?? DEFAULTS.refreshRate);
        locations = items['additional-paths'] ?? [];
        loaded = true;

        browser.permissions.onAdded.addListener(refreshGranted);
        browser.permissions.onRemoved.addListener(refreshGranted);
        testConnection();
    });
</script>

<main>
    <header class="page-header">
        <img src="/img/icon-small.png" alt="" width="40" height="40" />
        <div>
            <h1>.torrent to Transmission</h1>
            <p class="muted">Settings · version {version}</p>
        </div>
    </header>

    {#if loaded}
        <!-- Server -->
        <section class="card" aria-labelledby="server-heading">
            <h2 id="server-heading"><Icon name="server" size={16} />Transmission server</h2>
            <form onsubmit={saveServer} novalidate>
                <div class="field">
                    <label for="rpc-url">RPC address</label>
                    <input
                        id="rpc-url"
                        class="input mono"
                        type="url"
                        data-testid="rpc-url"
                        bind:value={rpcURL}
                        aria-invalid={status.kind === 'error' && status.field === 'url'}
                        placeholder={DEFAULTS.rpcURL}
                        spellcheck="false"
                    />
                    <p class="hint">Usually <code>http://&lt;host&gt;:9091/transmission/rpc</code>. Remote access must be enabled in Transmission.</p>
                </div>
                <div class="row">
                    <div class="field">
                        <label for="rpc-user">Username</label>
                        <input
                            id="rpc-user"
                            class="input"
                            data-testid="rpc-user"
                            bind:value={rpcUser}
                            aria-invalid={status.kind === 'error' && status.field === 'auth'}
                            autocomplete="username"
                        />
                    </div>
                    <div class="field">
                        <label for="rpc-pass">Password</label>
                        <div class="password">
                            <input
                                id="rpc-pass"
                                class="input"
                                data-testid="rpc-pass"
                                type={showPassword ? 'text' : 'password'}
                                bind:value={rpcPass}
                                aria-invalid={status.kind === 'error' && status.field === 'auth'}
                                autocomplete="current-password"
                            />
                            <button
                                type="button"
                                class="icon-btn small"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                aria-pressed={showPassword}
                                onclick={() => (showPassword = !showPassword)}
                            ><Icon name={showPassword ? 'eyeOff' : 'eye'} size={15} /></button>
                        </div>
                    </div>
                </div>
                <div class="field">
                    <label for="web-url">Web interface address <span class="muted">(optional)</span></label>
                    <input id="web-url" class="input mono" type="url" data-testid="web-url" bind:value={webURL} placeholder={webPlaceholder} spellcheck="false" />
                </div>

                <div class="form-footer">
                    <div class="status" data-testid="connection-status" data-kind={status.kind} aria-live="polite">
                        {#if dirty}
                            <span class="muted">Unsaved changes</span>
                        {:else if status.kind === 'testing'}
                            <span class="muted">Testing connection…</span>
                        {:else if status.kind === 'ok'}
                            <span class="pill ok"><Icon name="check" size={13} />Connected</span>
                            <span class="muted">{status.version}</span>
                        {:else if status.kind === 'permission'}
                            <span class="pill warn"><Icon name="lock" size={13} />Access needed</span>
                            <span class="muted">Click Connect and allow access to the server.</span>
                        {:else if status.kind === 'error'}
                            <span class="pill error"><Icon name="alert" size={13} />Not connected</span>
                            <span class="text-danger">{status.message}</span>
                        {/if}
                    </div>
                    <div class="buttons">
                        {#if !dirty && status.kind !== 'permission'}
                            <button type="button" class="btn" data-testid="test-connection" onclick={testConnection}>Test again</button>
                        {/if}
                        <button type="submit" class="btn primary" data-testid="save-server" disabled={!dirty && status.kind !== 'permission'}>
                            {status.kind === 'permission' && !dirty ? 'Connect' : 'Save & connect'}
                        </button>
                    </div>
                </div>
            </form>
        </section>

        <!-- Adding torrents -->
        <section class="card" aria-labelledby="adding-heading">
            <h2 id="adding-heading"><Icon name="plus" size={16} />Adding torrents</h2>
            <Toggle
                label="Send magnet links when clicked"
                description="Clicking a magnet link sends it to Transmission instead of opening your torrent app. Hold Ctrl, Shift, Alt or ⌘ while clicking to skip."
                testid="click-magnets"
                bind:checked={clickMagnets}
                onchange={(value) => setAllSitesOption('clickMagnets', value, () => (clickMagnets = false))}
            />
            <Toggle
                label="Download .torrent files in the browser"
                description="Sends the file instead of the link, using your browser's logins. Turn this on for private trackers. Magnet links are always sent as links."
                testid="send-torrent-file"
                bind:checked={sendTorrentFile}
                onchange={(value) => setAllSitesOption('sendTorrentFile', value, () => (sendTorrentFile = false))}
            />
            {#if permissionNote}
                <p class="note" role="alert">{permissionNote}</p>
            {/if}

            <div class="subsection">
                <h3>Download locations</h3>
                <p class="hint">Folders on the Transmission server. They appear under <em>Send to Transmission</em> in the right-click menu and when adding from the popup.</p>
                {#if locations.length}
                    <ul class="locations" data-testid="locations">
                        {#each locations as [label, directory], index (index)}
                            <li>
                                <Icon name="folder" size={15} />
                                <span class="loc-label">{label || directory}</span>
                                <span class="loc-dir mono">{directory}</span>
                                <button class="icon-btn small" aria-label="Remove {label || directory}" onclick={() => removeLocation(index)}>
                                    <Icon name="x" size={14} />
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
                <form class="add-location" onsubmit={addLocation}>
                    <label class="visually-hidden" for="loc-label">Name</label>
                    <input id="loc-label" class="input" data-testid="location-label" bind:value={newLabel} placeholder="Name (e.g. Movies)" />
                    <label class="visually-hidden" for="loc-dir">Folder on server</label>
                    <input id="loc-dir" class="input mono" data-testid="location-dir" bind:value={newDirectory} placeholder="/downloads/movies" spellcheck="false" />
                    <button class="btn" type="submit" data-testid="location-add" disabled={!newDirectory.trim()}>Add</button>
                </form>
            </div>
        </section>

        <!-- Notifications -->
        <section class="card" aria-labelledby="notifications-heading">
            <h2 id="notifications-heading"><Icon name="bell" size={16} />Notifications</h2>
            <Toggle
                label="Show notifications"
                description="When a torrent is added from the right-click menu and when a download finishes."
                testid="notifications"
                bind:checked={displayNotification}
                onchange={(value) => persist({ displayNotification: value })}
            />
            <div class="select-row" class:disabled={!displayNotification}>
                <label for="duration">Hide notifications after</label>
                <select
                    id="duration"
                    class="input"
                    bind:value={notificationDuration}
                    disabled={!displayNotification}
                    onchange={() => persist({ notificationDuration })}
                >
                    {#each durationOptions as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
            </div>
        </section>

        <!-- Updates -->
        <section class="card" aria-labelledby="updates-heading">
            <h2 id="updates-heading"><Icon name="refresh" size={16} />Updates</h2>
            <div class="select-row">
                <div>
                    <label for="refresh">Refresh the popup every</label>
                    <p class="hint">The toolbar badge and completion notifications update every 30 seconds or at this rate, whichever is slower.</p>
                </div>
                <select id="refresh" class="input" data-testid="refresh-rate" bind:value={refreshRate} onchange={() => persist({ refreshRate })}>
                    {#each refreshOptions as seconds (seconds)}
                        <option value={seconds}>{seconds} {seconds === 1 ? 'second' : 'seconds'}</option>
                    {/each}
                </select>
            </div>
        </section>
    {/if}

    <div class="toast" class:show={!!toast} role="status" data-testid="toast">{toast}</div>
</main>

<style>
    :global(body) {
        background: var(--surface);
        font-size: 14px;
    }

    main {
        max-width: 680px;
        margin: 0 auto;
        padding: 32px 20px 64px;
    }

    .page-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 24px;
    }

    h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 650;
    }

    .page-header p {
        margin: 2px 0 0;
    }

    .card {
        margin-bottom: 16px;
        padding: 20px 22px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: var(--bg);
    }

    h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 6px;
        font-size: 15px;
        font-weight: 600;
    }

    h2 :global(svg) {
        color: var(--text-muted);
    }

    h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
    }

    .field {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 6px;
        margin-top: 14px;
    }

    .field label {
        font-weight: 500;
    }

    .row {
        display: flex;
        gap: 12px;
    }

    .hint {
        margin: 0;
        color: var(--text-muted);
        font-size: 12.5px;
    }

    code,
    .mono {
        font-family: var(--font-mono);
        font-size: 12.5px;
    }

    .password {
        position: relative;
    }

    .password .input {
        padding-right: 36px;
    }

    .password .icon-btn {
        position: absolute;
        top: 4px;
        right: 4px;
    }

    .form-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
    }

    .status {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-height: 24px;
        font-size: 13px;
    }

    .pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
    }

    .pill.ok {
        background: var(--success-soft);
        color: var(--success);
    }

    .pill.warn {
        background: var(--warning-soft);
        color: var(--warning);
    }

    .pill.error {
        background: var(--danger-soft);
        color: var(--danger);
    }

    .buttons {
        display: flex;
        gap: 8px;
    }

    .note {
        margin: 4px 0 8px;
        padding: 8px 10px;
        border-radius: var(--radius);
        background: var(--warning-soft);
        color: var(--text);
        font-size: 13px;
    }

    .subsection {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
    }

    .locations {
        margin: 4px 0 0;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        list-style: none;
    }

    .locations li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 6px 6px 12px;
        color: var(--text-muted);
    }

    .locations li + li {
        border-top: 1px solid var(--border);
    }

    .loc-label {
        color: var(--text);
        font-weight: 500;
    }

    .loc-dir {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .add-location {
        display: grid;
        grid-template-columns: 1fr 1.6fr auto;
        gap: 8px;
    }

    .select-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 14px 0 4px;
    }

    .select-row label {
        font-weight: 500;
    }

    .select-row.disabled label {
        color: var(--text-faint);
    }

    .select-row select {
        width: auto;
        min-width: 180px;
    }

    .toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        padding: 8px 16px;
        border-radius: 999px;
        background: var(--text);
        color: var(--bg);
        font-weight: 500;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, 8px);
        transition: opacity 0.2s, transform 0.2s;
    }

    .toast.show {
        opacity: 1;
        transform: translate(-50%, 0);
    }

    @media (max-width: 560px) {
        .row,
        .select-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0;
        }

        .add-location {
            grid-template-columns: 1fr;
        }
    }
</style>
