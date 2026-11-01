<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from 'wxt/browser';
    import Icon from '@/components/Icon.svelte';
    import { DEFAULT_UNITS, describeTorrent, formatSpeed } from '@/utils/format';
    import {
        DEFAULTS,
        describeStatus,
        hasOrigins,
        originPattern,
        statusConstants,
        type BackgroundMessage,
        type DownloadLocation,
        type ListName,
        type RpcPayload,
        type SessionInfo,
        type SessionStats,
        type Settings,
        type TorrentMap,
        webInterfaceURL
    } from '@/utils/transmission';
    import AddTorrent from './AddTorrent.svelte';
    import ConnectionState from './ConnectionState.svelte';
    import TorrentRow, { type RowAction } from './TorrentRow.svelte';
    import { moves, moveTorrent } from './moves.svelte';

    interface PopupStorage extends Partial<Settings> {
        lastStatus?: number;
        rpc_version?: number;
        'session-info'?: SessionInfo;
        'session-stats'?: SessionStats;
        torrents?: TorrentMap;
    }

    const STORAGE_KEYS: (keyof PopupStorage)[] = [
        'lastStatus', 'rpcURL', 'webURL', 'rpc_version', 'session-info', 'session-stats',
        'selected_list', 'torrents', 'additional-paths', 'refreshRate'
    ];
    const FILTERS: { id: ListName; label: string }[] = [
        { id: 'all', label: 'All' },
        { id: 'download', label: 'Downloading' },
        { id: 'seed', label: 'Seeding' },
        { id: 'pause', label: 'Paused' }
    ];
    const SEARCH_THRESHOLD = 6;

    let data = $state<PopupStorage>({});
    let loaded = $state(false);
    let permitted = $state(true);
    let filter = $state<ListName>('all');
    let query = $state('');
    let adding = $state(false);

    const rpcURL = $derived(data.rpcURL || DEFAULTS.rpcURL);
    const host = $derived.by(() => {
        try {
            return new URL(rpcURL).hostname;
        } catch {
            return rpcURL;
        }
    });
    const S = $derived(statusConstants(data.rpc_version));
    const units = $derived({ ...DEFAULT_UNITS, ...(data['session-info']?.arguments.units ?? {}) });
    const altSpeed = $derived(!!data['session-info']?.arguments['alt-speed-enabled']);
    const supportsQueue = $derived((data.rpc_version ?? 0) >= 14);
    const locations = $derived<DownloadLocation[]>((data['additional-paths'] ?? []).filter(([, dir]) => dir));
    const defaultDir = $derived((data['session-info']?.arguments['download-dir'] as string | undefined) ?? '');
    const webURL = $derived(webInterfaceURL(data.webURL, data.rpcURL));

    const torrents = $derived(
        Object.values(data.torrents ?? {})
            .map((torrent) => ({ torrent, view: describeTorrent(torrent, S, units) }))
            .sort((a, b) => a.torrent.queuePosition - b.torrent.queuePosition)
    );

    function inFilter(state: string, list: ListName) {
        switch (list) {
            case 'download':
                return state === 'download' || (state === 'queued');
            case 'seed':
                return state === 'seed';
            case 'pause':
                return state === 'paused' || state === 'done';
            default:
                return true;
        }
    }

    const counts = $derived(
        Object.fromEntries(FILTERS.map(({ id }) => [id, torrents.filter((t) => inFilter(t.view.state, id)).length]))
    );
    const visible = $derived(
        torrents.filter(({ torrent, view }) =>
            inFilter(view.state, filter) &&
            (!query || torrent.name.toLowerCase().includes(query.trim().toLowerCase())))
    );

    const connection = $derived<'ok' | 'connecting' | 'permission' | 'error'>(
        !permitted ? 'permission' :
        data.lastStatus === 200 ? 'ok' :
        data.lastStatus === undefined ? 'connecting' : 'error'
    );

    const stats = $derived(data['session-stats']?.arguments);

    async function load() {
        data = await browser.storage.local.get(STORAGE_KEYS) as PopupStorage;
        if (!loaded) {
            filter = data.selected_list || 'all';
        }
        const pattern = originPattern(rpcURL);
        permitted = !pattern || await hasOrigins([pattern]);
        loaded = true;
    }

    function send(msg: BackgroundMessage) {
        return browser.runtime.sendMessage(msg).catch(() => {});
    }

    function rpc(payload: RpcPayload) {
        return send({ method: 'rpc-call', payload });
    }

    function onaction(id: number, action: RowAction) {
        const ids = [id];
        if (typeof action === 'object') {
            return moveTorrent(id, action.move, action.label);
        }
        switch (action) {
            case 'start': return rpc({ method: 'torrent-start', arguments: { ids } });
            case 'stop': return rpc({ method: 'torrent-stop', arguments: { ids } });
            case 'queue-up': return rpc({ method: 'queue-move-up', arguments: { ids } });
            case 'queue-down': return rpc({ method: 'queue-move-down', arguments: { ids } });
            case 'verify': return rpc({ method: 'torrent-verify', arguments: { ids } });
            case 'remove': return rpc({ method: 'torrent-remove', arguments: { ids } });
            case 'remove-data': return rpc({ method: 'torrent-remove', arguments: { ids, 'delete-local-data': true } });
        }
    }

    function setFilter(id: ListName) {
        filter = id;
        browser.storage.local.set({ selected_list: id });
    }

    function onFilterKey(event: KeyboardEvent) {
        const index = FILTERS.findIndex((f) => f.id === filter);
        let next = -1;
        if (event.key === 'ArrowRight') next = (index + 1) % FILTERS.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + FILTERS.length) % FILTERS.length;
        if (next >= 0) {
            event.preventDefault();
            setFilter(FILTERS[next]!.id);
            (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
        }
    }

    function grantAccess() {
        const pattern = originPattern(rpcURL);
        // the background refreshes when the permission is added
        if (pattern) browser.permissions.request({ origins: [pattern] }).then(load);
    }

    function openSettings() {
        browser.runtime.openOptionsPage();
        window.close();
    }

    onMount(() => {
        load().then(() => send({ method: 'update' }));

        const onChanged = (changes: Record<string, unknown>, area: string) => {
            if (area === 'local' && STORAGE_KEYS.some((key) => key in changes)) load();
        };
        browser.storage.onChanged.addListener(onChanged);
        browser.permissions.onAdded.addListener(load);

        let timer: ReturnType<typeof setInterval> | undefined;
        browser.storage.local.get('refreshRate').then(({ refreshRate }) => {
            const seconds = Math.max(1, Number(refreshRate) || DEFAULTS.refreshRate);
            timer = setInterval(() => send({ method: 'update' }), seconds * 1000);
        });

        return () => {
            clearInterval(timer);
            browser.storage.onChanged.removeListener(onChanged);
            browser.permissions.onAdded.removeListener(load);
        };
    });
</script>

<div class="app">
    <header>
        <img class="logo" src="/img/icon-small.png" alt="" width="22" height="22" />
        {#if connection === 'ok' && stats}
            <div class="totals" data-testid="totals" aria-label="Total speed">
                <span title="Total download speed"><Icon name="down" size={12} />{formatSpeed(stats.downloadSpeed, units)}</span>
                <span title="Total upload speed"><Icon name="up" size={12} />{formatSpeed(stats.uploadSpeed, units)}</span>
            </div>
        {:else}
            <span class="title">Transmission</span>
        {/if}
        <div class="spacer"></div>
        {#if connection === 'ok'}
            <button
                class="icon-btn"
                data-testid="toggle-add"
                aria-label="Add torrent"
                title="Add torrent"
                aria-expanded={adding}
                aria-pressed={adding}
                onclick={() => (adding = !adding)}
            ><Icon name="plus" size={18} /></button>
            <button
                class="icon-btn"
                data-testid="alt-speed"
                aria-label="Alternative speed limits"
                title={altSpeed ? 'Alternative speed limits are on' : 'Alternative speed limits are off'}
                aria-pressed={altSpeed}
                onclick={() => rpc({ method: 'session-set', arguments: { 'alt-speed-enabled': !altSpeed } })}
            ><Icon name="turtle" size={18} /></button>
        {/if}
        <a class="icon-btn" data-testid="web-ui" href={webURL} target="_blank" rel="noreferrer" aria-label="Open Transmission web interface" title="Open web interface">
            <Icon name="external" size={17} />
        </a>
        <button class="icon-btn" data-testid="settings" aria-label="Settings" title="Settings" onclick={openSettings}>
            <Icon name="settings" size={17} />
        </button>
    </header>

    {#if !loaded}
        <!-- avoid flashing a state before storage is read -->
    {:else if connection !== 'ok'}
        <ConnectionState
            kind={connection}
            url={rpcURL}
            {host}
            reason={data.lastStatus === undefined ? '' : describeStatus(data.lastStatus)}
            ongrant={grantAccess}
            onretry={() => send({ method: 'update' })}
            onsettings={openSettings}
        />
    {:else}
        {#if adding}
            <AddTorrent {locations} {defaultDir} onclose={() => (adding = false)} />
        {/if}

        <div class="filters">
            <div class="tabs" role="tablist" aria-label="Filter torrents" tabindex="-1" onkeydown={onFilterKey}>
                {#each FILTERS as f (f.id)}
                    <button
                        role="tab"
                        data-testid="filter-{f.id}"
                        aria-selected={filter === f.id}
                        tabindex={filter === f.id ? 0 : -1}
                        onclick={() => setFilter(f.id)}
                    >
                        {f.label}<span class="count">{counts[f.id]}</span>
                    </button>
                {/each}
            </div>
            {#if torrents.length > SEARCH_THRESHOLD}
                <label class="search">
                    <Icon name="search" size={14} />
                    <span class="visually-hidden">Search torrents</span>
                    <input type="search" bind:value={query} placeholder="Search" data-testid="search" />
                </label>
            {/if}
        </div>

        {#if visible.length}
            <ul class="list" data-testid="torrent-list">
                {#each visible as { torrent, view } (torrent.id)}
                    <TorrentRow {torrent} {view} {units} {supportsQueue} {locations} {defaultDir} move={moves[torrent.id]} onaction={(action) => onaction(torrent.id, action)} />
                {/each}
            </ul>
        {:else}
            <div class="empty" data-testid="empty">
                {#if torrents.length === 0}
                    <strong>No torrents yet</strong>
                    <p>Right-click a magnet or .torrent link and choose <em>Send to Transmission</em>, or add one with <Icon name="plus" size={12} />.</p>
                {:else if query}
                    <strong>No matches</strong>
                    <p>Nothing matches “{query}”.</p>
                {:else}
                    <strong>Nothing here</strong>
                    <p>No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} torrents.</p>
                {/if}
            </div>
        {/if}

        {#if torrents.length}
            <footer>
                <button class="btn small ghost" data-testid="resume-all" onclick={() => rpc({ method: 'torrent-start' })}>
                    <Icon name="play" size={12} />Resume all
                </button>
                <button class="btn small ghost" data-testid="pause-all" onclick={() => rpc({ method: 'torrent-stop' })}>
                    <Icon name="pause" size={12} />Pause all
                </button>
                <span class="summary">{torrents.length} {torrents.length === 1 ? 'torrent' : 'torrents'}</span>
            </footer>
        {/if}
    {/if}
</div>

<style>
    .app {
        display: flex;
        flex-direction: column;
        width: 420px;
        max-height: 580px;
    }

    header {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 8px 8px 8px 12px;
        border-bottom: 1px solid var(--border);
    }

    .logo {
        margin-right: 8px;
    }

    .title {
        font-weight: 600;
    }

    .totals {
        display: flex;
        gap: 12px;
        font-variant-numeric: tabular-nums;
        font-weight: 500;
    }

    .totals span {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    .spacer {
        flex: 1;
    }

    .filters {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border);
    }

    .tabs {
        display: flex;
        gap: 2px;
        padding: 2px;
        border-radius: var(--radius);
        background: var(--surface);
    }

    .tabs button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 26px;
        padding: 0 9px;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--text-muted);
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
    }

    .tabs button:hover {
        color: var(--text);
    }

    .tabs button[aria-selected="true"] {
        background: var(--bg);
        color: var(--text);
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
    }

    .count {
        min-width: 16px;
        padding: 0 4px;
        border-radius: 8px;
        background: var(--surface-active);
        color: var(--text-muted);
        font-size: 11px;
        text-align: center;
    }

    .search {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 4px;
        min-width: 0;
        height: 30px;
        padding: 0 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-faint);
    }

    .search:focus-within {
        border-color: var(--accent);
    }

    .search input {
        width: 100%;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: var(--text);
        font: inherit;
    }

    .list {
        flex: 1;
        margin: 0;
        padding: 0;
        overflow-y: auto;
    }

    .empty {
        padding: 36px 32px;
        color: var(--text-muted);
        text-align: center;
    }

    .empty strong {
        color: var(--text);
        font-size: 14px;
    }

    .empty p {
        margin: 6px 0 0;
    }

    footer {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 6px 8px;
        border-top: 1px solid var(--border);
    }

    footer .summary {
        margin-left: auto;
        padding-right: 6px;
        color: var(--text-faint);
        font-size: 12px;
    }
</style>
