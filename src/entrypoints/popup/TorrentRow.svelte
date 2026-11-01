<script lang="ts" module>
    export type RowAction = 'start' | 'stop' | 'queue-up' | 'queue-down' | 'verify' | 'remove' | 'remove-data';
</script>

<script lang="ts">
    import Icon from '@/components/Icon.svelte';
    import { formatSpeed, type TorrentView } from '@/utils/format';
    import type { Torrent, Units } from '@/utils/transmission';

    let {
        torrent,
        view,
        units,
        supportsQueue,
        onaction
    }: {
        torrent: Torrent;
        view: TorrentView;
        units: Units;
        supportsQueue: boolean;
        onaction: (action: RowAction) => void;
    } = $props();

    let menuOpen = $state(false);
    let confirming = $state(false);
    let menuEl = $state<HTMLElement>();
    let menuButton = $state<HTMLButtonElement>();

    const running = $derived(view.state !== 'paused' && view.state !== 'done' && view.state !== 'error');
    const showDown = $derived(view.state === 'download');
    const showUp = $derived(view.state === 'download' || view.state === 'seed');

    function act(action: RowAction) {
        menuOpen = false;
        confirming = false;
        onaction(action);
    }

    function openMenu() {
        menuOpen = !menuOpen;
        if (menuOpen) {
            queueMicrotask(() => menuEl?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
        }
    }

    function onMenuKey(event: KeyboardEvent) {
        const items = Array.from(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === 'Escape') {
            menuOpen = false;
            menuButton?.focus();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            items[(index + 1) % items.length]?.focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            items[(index - 1 + items.length) % items.length]?.focus();
        }
    }

    function onWindowClick(event: MouseEvent) {
        if (menuOpen && !menuEl?.contains(event.target as Node) && !menuButton?.contains(event.target as Node)) {
            menuOpen = false;
        }
    }
</script>

<svelte:window onclick={onWindowClick} />

<li class="row" data-testid="torrent" data-id={torrent.id} data-state={view.state}>
    <div class="top">
        <span class="name" title={torrent.name}>{torrent.name}</span>
        <div class="actions">
            {#if running}
                <button class="icon-btn small" data-testid="pause" aria-label="Pause {torrent.name}" title="Pause" onclick={() => act('stop')}>
                    <Icon name="pause" size={15} />
                </button>
            {:else}
                <button class="icon-btn small" data-testid="resume" aria-label="Resume {torrent.name}" title="Resume" onclick={() => act('start')}>
                    <Icon name="play" size={15} />
                </button>
            {/if}
            <div class="menu-wrap">
                <button
                    bind:this={menuButton}
                    class="icon-btn small"
                    data-testid="more"
                    aria-label="More actions for {torrent.name}"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onclick={openMenu}
                >
                    <Icon name="more" size={15} />
                </button>
                {#if menuOpen}
                    <div class="menu" role="menu" tabindex="-1" bind:this={menuEl} onkeydown={onMenuKey}>
                        {#if supportsQueue}
                            <button role="menuitem" onclick={() => act('queue-up')}><Icon name="chevronUp" size={14} />Move up in queue</button>
                            <button role="menuitem" onclick={() => act('queue-down')}><Icon name="chevronDown" size={14} />Move down in queue</button>
                        {/if}
                        <button role="menuitem" onclick={() => act('verify')}><Icon name="verify" size={14} />Verify local data</button>
                        <hr />
                        <button role="menuitem" class="danger" data-testid="remove" onclick={() => { menuOpen = false; confirming = true; }}>
                            <Icon name="trash" size={14} />Remove…
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div
        class="bar state-{view.state}"
        role="progressbar"
        aria-label="{view.label} progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(view.progress * 100)}
    >
        <div class="fill" style:width="{Math.max(0, Math.min(1, view.progress)) * 100}%"></div>
    </div>

    {#if confirming}
        <div class="confirm" role="group" aria-label="Confirm removal">
            <span>Remove this torrent?</span>
            <div class="confirm-actions">
                <button class="btn small ghost" onclick={() => (confirming = false)}>Cancel</button>
                <button class="btn small" data-testid="confirm-remove" onclick={() => act('remove')}>Remove</button>
                <button class="btn small danger" data-testid="confirm-remove-data" onclick={() => act('remove-data')}>Remove &amp; delete files</button>
            </div>
        </div>
    {:else}
        <div class="bottom">
            <span class="status">
                <span class="label state-{view.state}">{view.label}</span>
                {#if view.detail}<span class="detail"> · {view.detail}</span>{/if}
            </span>
            <span class="speeds">
                {#if showDown}<span title="Download speed"><Icon name="down" size={11} />{formatSpeed(torrent.rateDownload, units)}</span>{/if}
                {#if showUp}<span title="Upload speed"><Icon name="up" size={11} />{formatSpeed(torrent.rateUpload, units)}</span>{/if}
            </span>
        </div>
    {/if}
</li>

<style>
    .row {
        list-style: none;
        padding: 10px 14px 10px;
        border-bottom: 1px solid var(--border);
    }

    .row:hover {
        background: var(--surface);
    }

    .top {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .actions {
        display: flex;
        gap: 2px;
        margin-right: -6px;
    }

    .menu-wrap {
        position: relative;
    }

    .menu {
        position: absolute;
        z-index: 10;
        top: calc(100% + 4px);
        right: 0;
        min-width: 190px;
        padding: 4px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        box-shadow: var(--shadow-pop);
    }

    .menu button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 8px;
        border: none;
        border-radius: var(--radius-sm);
        background: none;
        color: var(--text);
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .menu button:hover,
    .menu button:focus-visible {
        outline: none;
        background: var(--surface-hover);
    }

    .menu button.danger {
        color: var(--danger);
    }

    .menu hr {
        margin: 4px 0;
        border: none;
        border-top: 1px solid var(--border);
    }

    .bar {
        height: 4px;
        margin: 7px 0 6px;
        overflow: hidden;
        border-radius: 2px;
        background: var(--track);
    }

    .fill {
        height: 100%;
        border-radius: 2px;
        background: var(--state-paused);
        transition: width 0.4s ease;
    }

    .bar.state-download .fill { background: var(--state-download); }
    .bar.state-seed .fill { background: var(--state-seed); }
    .bar.state-done .fill { background: var(--state-seed); opacity: 0.55; }
    .bar.state-check .fill { background: var(--state-check); }
    .bar.state-queued .fill { background: var(--state-queued); }
    .bar.state-error .fill { background: var(--state-error); }

    .bottom {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: var(--text-muted);
        font-size: 12px;
    }

    .status {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .label {
        font-weight: 500;
    }

    .label.state-download { color: var(--state-download); }
    .label.state-seed { color: var(--state-seed); }
    .label.state-check { color: var(--state-check); }
    .label.state-error { color: var(--state-error); }

    .speeds {
        display: flex;
        flex-shrink: 0;
        gap: 10px;
        font-variant-numeric: tabular-nums;
    }

    .speeds span {
        display: inline-flex;
        align-items: center;
        gap: 2px;
    }

    .confirm {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        background: var(--danger-soft);
        font-size: 12px;
    }

    .confirm-actions {
        display: flex;
        gap: 4px;
    }
</style>
