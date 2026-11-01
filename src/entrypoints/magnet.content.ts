import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { BackgroundMessage } from '@/utils/transmission';

/*
    Sends plain left-clicks on magnet links to Transmission instead of the
    system handler. Registered by the background only while the "Send magnet
    links when clicked" option is enabled.
*/
export default defineContentScript({
    matches: ['http://*/*', 'https://*/*'],
    registration: 'runtime',
    runAt: 'document_start',
    allFrames: true,
    main() {
        document.addEventListener('click', (event) => {
            if (event.defaultPrevented || event.button !== 0 ||
                    event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
                return;
            }
            const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!link || !/^magnet:/i.test(link.href)) {
                return;
            }
            event.preventDefault();
            const msg: BackgroundMessage = { method: 'add-torrent', url: link.href };
            browser.runtime.sendMessage(msg);
        }, true);
    }
});
