<script lang="ts">
    import { browser } from 'wxt/browser';
    import Icon from '@/components/Icon.svelte';
    import { samePath, type AddTorrentResult, type BackgroundMessage, type DownloadLocation } from '@/utils/transmission';

    let {
        locations,
        defaultDir,
        onclose
    }: { locations: DownloadLocation[]; defaultDir: string; onclose: () => void } = $props();

    let url = $state('');
    let location = $state('');
    let busy = $state(false);
    let result = $state<AddTorrentResult | null>(null);
    let moved = $state('');

    // Already in Transmission, but somewhere other than where it was sent.
    const moveTarget = $derived(
        result?.existing && result.requestedDir && !samePath(result.existing.downloadDir, result.requestedDir)
            ? result.requestedDir
            : ''
    );

    function locationName(dir: string) {
        const match = locations.find(([, directory]) => samePath(directory, dir));
        if (match) return match[0] || match[1];
        return samePath(dir, defaultDir) ? 'default location' : dir;
    }

    async function moveExisting() {
        if (!result?.existing || !moveTarget) return;
        const target = moveTarget;
        const msg: BackgroundMessage = {
            method: 'rpc-call',
            payload: { method: 'torrent-set-location', arguments: { ids: [result.existing.id], location: target, move: true } }
        };
        const reply = await browser.runtime.sendMessage(msg).catch(() => null) as { status?: number; data?: { result?: string } } | null;
        if (reply?.status === 200 && reply.data?.result === 'success') {
            moved = target;
            result = { ok: true, title: 'Moving to ' + locationName(target), message: result.existing.name };
        } else {
            result = { ok: false, title: 'Couldn\'t move the torrent', message: reply?.data?.result ?? 'Transmission didn\'t respond.' };
        }
    }
    let input = $state<HTMLInputElement>();

    $effect(() => {
        input?.focus();
    });

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        const link = url.trim();
        if (!link || busy) return;
        busy = true;
        result = null;
        moved = '';
        const msg: BackgroundMessage = { method: 'add-torrent', url: link, downloadDir: location || undefined };
        try {
            result = await browser.runtime.sendMessage(msg) as AddTorrentResult;
        } catch {
            result = { ok: false, title: 'Something went wrong', message: 'Try again.' };
        }
        busy = false;
        if (result.ok) {
            url = '';
        }
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onclose();
        }
    }
</script>

<form class="add" data-testid="add-form" onsubmit={submit}>
    <div class="fields">
        <label class="visually-hidden" for="add-url">Magnet link or .torrent URL</label>
        <input
            id="add-url"
            class="input"
            data-testid="add-url"
            bind:this={input}
            bind:value={url}
            {onkeydown}
            placeholder="Paste a magnet link or .torrent URL"
            autocomplete="off"
            spellcheck="false"
        />
        <button class="btn primary" type="submit" data-testid="add-submit" disabled={!url.trim() || busy}>
            {busy ? 'Adding…' : 'Add'}
        </button>
    </div>
    {#if locations.length}
        <label class="location">
            <Icon name="folder" size={14} />
            <span class="visually-hidden">Download location</span>
            <select class="input" bind:value={location} data-testid="add-location">
                <option value="">Default location</option>
                {#each locations as [label, directory] (directory)}
                    <option value={directory}>{label || directory}</option>
                {/each}
            </select>
        </label>
    {/if}
    {#if result}
        <p class="result" class:ok={result.ok} role="status" data-testid="add-result">
            <Icon name={result.ok ? 'check' : 'alert'} size={14} />
            <span><strong>{result.title}</strong>{#if result.message}<span class="msg"> {result.message}</span>{/if}</span>
        </p>
        {#if moveTarget && !moved}
            <div class="move">
                <button type="button" class="btn small" data-testid="move-existing" onclick={moveExisting}>
                    <Icon name="folder" size={13} />Move to {locationName(moveTarget)}
                </button>
                <span class="muted">Moves the files on the server.</span>
            </div>
        {/if}
    {/if}
</form>

<style>
    .add {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 14px 12px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
    }

    .fields {
        display: flex;
        gap: 6px;
    }

    .fields .btn {
        height: 34px;
    }

    .location {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-muted);
    }

    .location select {
        height: 30px;
    }

    .result {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 0;
        color: var(--danger);
        font-size: 12px;
    }

    .result.ok {
        color: var(--success);
    }

    .result :global(svg) {
        flex-shrink: 0;
        margin-top: 1px;
    }

    .move {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    }

    .msg {
        display: block;
        color: var(--text-muted);
        word-break: break-word;
    }
</style>
