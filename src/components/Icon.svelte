<script lang="ts" module>
    type Shape = { tag: 'path' | 'circle' | 'rect' } & Record<string, string>;

    // 24x24 stroke icons, as SVG elements (no innerHTML).
    const ICONS = {
        plus: [{ tag: 'path', d: 'M12 5v14M5 12h14' }],
        pause: [{ tag: 'rect', x: '6', y: '5', width: '4', height: '14', rx: '1' }, { tag: 'rect', x: '14', y: '5', width: '4', height: '14', rx: '1' }],
        play: [{ tag: 'path', d: 'M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z' }],
        more: [{ tag: 'circle', cx: '12', cy: '5', r: '1.2' }, { tag: 'circle', cx: '12', cy: '12', r: '1.2' }, { tag: 'circle', cx: '12', cy: '19', r: '1.2' }],
        settings: [{ tag: 'circle', cx: '12', cy: '12', r: '3' }, { tag: 'path', d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z' }],
        external: [{ tag: 'path', d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }],
        turtle: [{ tag: 'path', d: 'M3 15a7 6 0 0 1 14 0z' }, { tag: 'path', d: 'M17 13.5h2.5a1.5 1.5 0 0 0 0-3H18M6 15v2.5M14 15v2.5M7 11.5h6' }],
        down: [{ tag: 'path', d: 'M12 5v14M6 13l6 6 6-6' }],
        up: [{ tag: 'path', d: 'M12 19V5M6 11l6-6 6 6' }],
        trash: [{ tag: 'path', d: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }],
        x: [{ tag: 'path', d: 'M6 6l12 12M18 6 6 18' }],
        check: [{ tag: 'path', d: 'M5 12.5 10 17.5 19 7' }],
        alert: [{ tag: 'path', d: 'M12 9v4M12 17h.01' }, { tag: 'path', d: 'M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }],
        search: [{ tag: 'circle', cx: '11', cy: '11', r: '6.5' }, { tag: 'path', d: 'm20 20-4.3-4.3' }],
        refresh: [{ tag: 'path', d: 'M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4' }],
        chevronUp: [{ tag: 'path', d: 'm6 15 6-6 6 6' }],
        chevronDown: [{ tag: 'path', d: 'm6 9 6 6 6-6' }],
        folder: [{ tag: 'path', d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
        lock: [{ tag: 'rect', x: '5', y: '11', width: '14', height: '9', rx: '2' }, { tag: 'path', d: 'M8 11V8a4 4 0 0 1 8 0v3' }],
        eye: [{ tag: 'path', d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }, { tag: 'circle', cx: '12', cy: '12', r: '3' }],
        eyeOff: [{ tag: 'path', d: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2' }],
        verify: [{ tag: 'path', d: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z' }, { tag: 'path', d: 'm9 12 2 2 4-4' }],
        bell: [{ tag: 'path', d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }, { tag: 'path', d: 'M10.3 21a1.9 1.9 0 0 0 3.4 0' }],
        server: [{ tag: 'rect', x: '3', y: '4', width: '18', height: '7', rx: '2' }, { tag: 'rect', x: '3', y: '13', width: '18', height: '7', rx: '2' }, { tag: 'path', d: 'M7 7.5h.01M7 16.5h.01' }]
    } satisfies Record<string, Shape[]>;

    export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
    let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
>
    {#each ICONS[name] as { tag, ...attrs }, i (i)}
        <svelte:element this={tag} {...attrs} />
    {/each}
</svg>
