import { Logger } from './logger';

const logger = Logger.getInstance();

let translationPanel: chrome.windows.Window | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log('background', 'Received message', message);

    if (message.type === 'OPEN_TRANSLATION_PANEL') {
        try {
            chrome.windows.create({
                url: chrome.runtime.getURL('panel.html'),
                type: 'popup',
                width: 400,
                height: 600,
                top: 20,
                left: window.screen.availWidth - 420,
            }, (window) => {
                if (!window) {
                    logger.log('background', 'Failed to create panel window');
                    sendResponse({ success: false });
                    return;
                }

                translationPanel = window;
                logger.log('background', 'Panel window created', window.id);

                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const activeTab = tabs[0];
                    if (activeTab?.id) {
                        chrome.tabs.sendMessage(activeTab.id, {
                            type: 'PANEL_CREATED',
                            windowId: window.id
                        });
                    }
                });

                sendResponse({ success: true });
            });
        } catch (error) {
            logger.log('background', 'Error creating panel', error);
            sendResponse({ success: false });
        }
        return true;
    }
    return false;
});

// 패널이 닫힐 때 처리
chrome.windows.onRemoved.addListener((windowId) => {
    if (translationPanel?.id === windowId) {
        translationPanel = null;
    }
}); 