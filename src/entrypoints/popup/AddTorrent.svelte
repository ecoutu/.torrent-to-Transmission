<script lang="ts">
    import { browser } from 'wxt/browser';
    import Icon from '@/components/Icon.svelte';
    import type { AddTorrentResult, BackgroundMessage, DownloadLocation } from '@/utils/transmission';

    let { locations, onclose }: { locations: DownloadLocation[]; onclose: () => void } = $props();

    let url = $state('');
    let location = $state('');
    let busy = $state(false);
    let result = $state<AddTorrentResult | null>(null);
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

    .msg {
        color: var(--text-muted);
        word-break: break-word;
    }
</style>
