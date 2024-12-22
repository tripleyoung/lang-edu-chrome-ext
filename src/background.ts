import { Logger } from './logger';

const logger = Logger.getInstance();

let translationPanel: chrome.windows.Window | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log('background', 'Received message', { type: message.type });

    if (message.type === 'OPEN_TRANSLATION_PANEL') {
        // 기존 패널이 있는지 확인
        if (translationPanel && translationPanel.id) {
            // 윈도우가 실제로 존재하는지 확인
            chrome.windows.get(translationPanel.id, (window) => {
                if (window) {
                    logger.log('background', 'Focusing existing panel');
                    // 기존 패널이 있으면 포커스
                    chrome.windows.update(translationPanel!.id!, { 
                        focused: true,
                        drawAttention: true
                    });
                    sendResponse({ success: true });
                } else {
                    logger.log('background', 'Creating new panel (existing window not found)');
                    createNewPanel(sendResponse);
                }
            });
        } else {
            logger.log('background', 'Creating new panel');
            createNewPanel(sendResponse);
        }
        return true;
    }

    if (message.type === 'SEND_TO_PANEL') {
        logger.log('background', 'Attempting to send translation data to panel');
        if (translationPanel?.tabs?.[0]?.id) {
            try {
                chrome.tabs.sendMessage(translationPanel.tabs[0].id, {
                    type: 'UPDATE_TRANSLATION',
                    data: message.data
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        logger.log('background', 'Failed to send to panel', chrome.runtime.lastError);
                        sendResponse({ success: false });
                    } else {
                        logger.log('background', 'Successfully sent to panel', response);
                        sendResponse({ success: true });
                    }
                });
            } catch (error) {
                logger.log('background', 'Error sending to panel', error);
                sendResponse({ success: false });
            }
        } else {
            logger.log('background', 'No valid panel tab found');
            sendResponse({ success: false });
        }
        return true;
    }
    return true;
});

// 새 패널 생성 함수
async function createNewPanel(sendResponse: (response?: any) => void) {
    try {
        const displays = await chrome.system.display.getInfo();
        const primaryDisplay = displays[0];
        
        logger.log('background', 'Creating new window for panel');
        chrome.windows.create({
            url: 'panel.html',
            type: 'popup',
            width: 800,
            height: 400,
            left: Math.max(0, primaryDisplay.bounds.width - 820),
            top: Math.max(0, primaryDisplay.bounds.height - 450),
            focused: true
        }, (window) => {
            if (window) {
                translationPanel = window;
                logger.log('background', 'Panel window created', { windowId: window.id });
                sendResponse({ success: true });
            } else {
                logger.log('background', 'Failed to create panel window');
                sendResponse({ success: false });
            }
        });
    } catch (error) {
        logger.log('background', 'Error in createNewPanel', error);
        sendResponse({ success: false });
    }
}

// 패널이 닫힐 때 정리
chrome.windows.onRemoved.addListener((windowId) => {
    if (translationPanel && translationPanel.id === windowId) {
        logger.log('background', 'Panel window closed', { windowId });
        translationPanel = null;
    }
}); 