import { Logger } from './logger';

const logger = Logger.getInstance();

let translationPanel: chrome.windows.Window | null = null;

async function createNewPanel(sendResponse: (response?: any) => void, sender: chrome.runtime.MessageSender) {
    try {
        // 이미 패널이 존재하는지 확인
        if (translationPanel?.id) {
            try {
                // 기존 패널 포커스
                await chrome.windows.update(translationPanel.id, {
                    focused: true,
                    drawAttention: true
                });
                logger.log('background', 'Focused existing panel', { windowId: translationPanel.id });
                sendResponse({ success: true });
                return;
            } catch (error) {
                // 기존 패널이 없으면 translationPanel 초기화
                logger.log('background', 'Existing panel not found, resetting', error);
                translationPanel = null;
            }
        }

        const displays = await chrome.system.display.getInfo();
        const primaryDisplay = displays[0];
        
        const panelWidth = 1000;
        const panelHeight = 400;
        const left = Math.round((primaryDisplay.bounds.width - panelWidth) / 2);
        const top = Math.round((primaryDisplay.bounds.height - panelHeight) / 2);

        const panelUrl = chrome.runtime.getURL('panel.html');
        logger.log('background', 'Creating new panel', { panelUrl });

        chrome.windows.create({
            url: panelUrl,
            type: 'popup',
            width: panelWidth,
            height: panelHeight,
            left: left,
            top: top
        }, (window) => {
            if (window) {
                translationPanel = window;
                logger.log('background', 'Panel created successfully', { windowId: window.id });
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log('background', 'Received message', message);

    if (message.type === 'OPEN_TRANSLATION_PANEL') {
        createNewPanel(sendResponse, sender);
        return true;
    }

    // 단어 정보 전달 처리 추가
    if (message.type === 'SEND_WORD_INFO') {
        if (translationPanel?.tabs?.[0]?.id) {
            try {
                chrome.tabs.sendMessage(translationPanel.tabs[0].id, {
                    type: 'WORD_INFO',
                    data: message.data
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        logger.log('background', 'Failed to send word info to panel', chrome.runtime.lastError);
                        sendResponse({ success: false });
                    } else {
                        logger.log('background', 'Successfully sent word info to panel', response);
                        sendResponse({ success: true });
                    }
                });
            } catch (error) {
                logger.log('background', 'Error sending word info to panel', error);
                sendResponse({ success: false });
            }
        } else {
            logger.log('background', 'No valid panel tab found for word info');
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