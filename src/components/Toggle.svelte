<script lang="ts">
    import type { Snippet } from 'svelte';

    let {
        checked = $bindable(false),
        label,
        description,
        disabled = false,
        testid,
        onchange
    }: {
        checked?: boolean;
        label: string;
        description?: Snippet | string;
        disabled?: boolean;
        testid?: string;
        onchange?: (checked: boolean) => void;
    } = $props();

    const id = 'toggle-' + Math.random().toString(36).slice(2);
</script>

<div class="toggle" class:disabled>
    <div class="text">
        <label for={id}>{label}</label>
        {#if description}
            <p id="{id}-desc">
                {#if typeof description === 'string'}{description}{:else}{@render description()}{/if}
            </p>
        {/if}
    </div>
    <input
        {id}
        type="checkbox"
        role="switch"
        data-testid={testid}
        aria-describedby={description ? id + '-desc' : undefined}
        bind:checked
        {disabled}
        onchange={() => onchange?.(checked)}
    />
</div>

<style>
    .toggle {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 14px 0;
    }

    .toggle + :global(.toggle) {
        border-top: 1px solid var(--border);
    }

    .toggle.disabled label {
        color: var(--text-faint);
    }

    label {
        font-weight: 500;
        cursor: pointer;
    }

    p {
        margin: 3px 0 0;
        color: var(--text-muted);
        font-size: 12.5px;
    }

    input {
        position: relative;
        flex-shrink: 0;
        width: 36px;
        height: 20px;
        margin: 1px 0 0;
        border-radius: 10px;
        background: var(--border-strong);
        cursor: pointer;
        transition: background-color 0.15s;
        appearance: none;
    }

    input::after {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
        content: "";
        transition: transform 0.15s;
    }

    input:checked {
        background: var(--accent);
    }

    input:checked::after {
        transform: translateX(16px);
    }

    input:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
