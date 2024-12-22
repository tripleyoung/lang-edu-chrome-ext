import { Logger } from './logger';

const logger = Logger.getInstance();

let translationPanel: chrome.windows.Window | null = null;

// 호버된 탭 추적을 위한 변수 추가
let lastActiveTabId: number | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log('background', 'Received message in background', { type: message.type, message });

    // 호널 열기 처리
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
                    createNewPanel(sendResponse, sender);
                }
            });
        } else {
            logger.log('background', 'Creating new panel');
            createNewPanel(sendResponse, sender);
        }
        return true;
    }

    // 호버 이벤트 처리
    if (message.type === 'SEND_TO_PANEL') {
        logger.log('background', 'Attempting to send translation data to panel');
        
        // 호버된 탭 ID 저장
        if (sender.tab?.id) {
            lastActiveTabId = sender.tab.id;
            logger.log('background', 'Updated last active tab', { tabId: lastActiveTabId });
        }

        // 패널로 메시지 전달
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

    // 읽기 모드 처리
    if (message.type === 'TOGGLE_READER_MODE') {
        logger.log('background', 'Processing TOGGLE_READER_MODE', { enabled: message.enabled });
        
        (async () => {
            try {
                // 마지막으로 호버된 탭 ID 사용
                const tabId = lastActiveTabId;
                logger.log('background', 'Using last active tab', { tabId });

                if (tabId) {
                    logger.log('background', 'Attempting to send message to content script');
                    
                    try {
                        await chrome.tabs.sendMessage(tabId, {
                            type: 'SET_READER_MODE',
                            enabled: message.enabled
                        });
                        logger.log('background', 'Message sent successfully');
                        sendResponse({ success: true });
                    } catch (error) {
                        logger.log('background', 'Failed to send message to content script', error);
                        sendResponse({ success: false });
                    }
                } else {
                    logger.log('background', 'No last active tab found');
                    sendResponse({ success: false });
                }
            } catch (error) {
                logger.log('background', 'Error in TOGGLE_READER_MODE handler', error);
                sendResponse({ success: false });
            }
        })();
        return true;
    }

    return true;
});

// 새 패널 생성 함수
async function createNewPanel(sendResponse: (response?: any) => void, sender: chrome.runtime.MessageSender) {
    try {
        const displays = await chrome.system.display.getInfo();
        const primaryDisplay = displays[0];
        
        // 패널 크기
        const panelWidth = 1000;
        const panelHeight = 400;
        
        // 화면 중앙 위치 계산
        const left = Math.round((primaryDisplay.bounds.width - panelWidth) / 2);
        const top = Math.round((primaryDisplay.bounds.height - panelHeight) / 2);

        chrome.windows.create({
            url: 'panel.html',
            type: 'popup',
            width: panelWidth,
            height: panelHeight,
            left: left,
            top: top
        }, (window) => {
            if (window) {
                translationPanel = window;
                // content script에 패널 창 참조 전달
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]?.id) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            type: 'PANEL_CREATED',
                            windowId: window.id
                        });
                    }
                });
                sendResponse({ success: true });
            } else {
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