<script lang="ts">
    import Icon from '@/components/Icon.svelte';

    let {
        kind,
        url,
        host,
        reason,
        ongrant,
        onretry,
        onsettings
    }: {
        kind: 'connecting' | 'permission' | 'error';
        url: string;
        host: string;
        reason: string;
        ongrant: () => void;
        onretry: () => void;
        onsettings: () => void;
    } = $props();
</script>

<section class="state" data-testid="connection-{kind}" aria-live="polite">
    {#if kind === 'connecting'}
        <div class="spinner" aria-hidden="true"></div>
        <h2>Connecting to Transmission…</h2>
        <p class="url">{url}</p>
    {:else if kind === 'permission'}
        <div class="badge"><Icon name="lock" size={22} /></div>
        <h2>Allow access to your server</h2>
        <p>The extension needs permission to talk to Transmission at <strong>{host}</strong>.</p>
        <div class="buttons">
            <button class="btn primary" data-testid="grant-access" onclick={ongrant}>Allow access to {host}</button>
            <button class="btn ghost" onclick={onsettings}>Change server</button>
        </div>
    {:else}
        <div class="badge error"><Icon name="alert" size={22} /></div>
        <h2>Can't reach Transmission</h2>
        <p class="url">{url}</p>
        <p class="reason" data-testid="connection-reason">{reason}</p>
        <div class="buttons">
            <button class="btn primary" onclick={onretry}><Icon name="refresh" size={14} />Try again</button>
            <button class="btn" data-testid="open-settings" onclick={onsettings}>Settings</button>
        </div>
    {/if}
</section>

<style>
    .state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 36px 28px 32px;
        text-align: center;
    }

    h2 {
        margin: 12px 0 6px;
        font-size: 15px;
        font-weight: 600;
    }

    p {
        margin: 0 0 4px;
        color: var(--text-muted);
    }

    .url {
        max-width: 100%;
        overflow: hidden;
        font-family: var(--font-mono);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .reason {
        color: var(--danger);
    }

    .badge {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--accent-soft);
        color: var(--accent);
    }

    .badge.error {
        background: var(--danger-soft);
        color: var(--danger);
    }

    .buttons {
        display: flex;
        gap: 8px;
        margin-top: 16px;
    }

    .spinner {
        width: 28px;
        height: 28px;
        border: 3px solid var(--track);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
