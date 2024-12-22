let translationPanel: chrome.windows.Window | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_TRANSLATION_PANEL') {
        // 기존 패널이 있는지 확인
        if (translationPanel && translationPanel.id) {
            // 윈도우가 실제로 존재하는지 확인
            chrome.windows.get(translationPanel.id, (window) => {
                if (window) {
                    // 기존 패널이 있으면 포커스
                    chrome.windows.update(translationPanel!.id!, { 
                        focused: true,
                        drawAttention: true
                    });
                    sendResponse({ success: true });
                } else {
                    // 윈도우가 없으면 새로 생성
                    createNewPanel(sendResponse);
                }
            });
        } else {
            createNewPanel(sendResponse);
        }
        return true;
    }

    if (message.type === 'SEND_TO_PANEL') {
        if (translationPanel?.tabs?.[0]?.id) {
            try {
                console.log('Sending message to panel:', message.html);  // 디버깅용
                chrome.tabs.sendMessage(translationPanel.tabs[0].id, {
                    type: 'UPDATE_TRANSLATION',
                    html: message.html
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending message:', chrome.runtime.lastError);
                        sendResponse({ success: false });
                    } else {
                        console.log('Message sent successfully:', response);
                        sendResponse({ success: true });
                    }
                });
            } catch (error) {
                console.error('Error sending message:', error);
                sendResponse({ success: false });
            }
        } else {
            console.error('No valid panel tab found');
            sendResponse({ success: false });
        }
        return true;
    }
    return true;
});

// 새 패널 생성 함수
function createNewPanel(sendResponse: (response?: any) => void) {
    chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays[0];
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
                // 패널이 생성된 후 초기 설정
                if (window.tabs && window.tabs[0]) {
                    chrome.scripting.executeScript({
                        target: { tabId: window.tabs[0].id! },
                        func: () => {
                            // 패널 초기화 코드
                            chrome.runtime.onMessage.addListener((msg, sender, response) => {
                                if (msg.type === 'UPDATE_TRANSLATION') {
                                    const content = document.getElementById('translationContent');
                                    if (content) {
                                        content.innerHTML = msg.html;
                                    }
                                    response({ success: true });
                                }
                            });
                        }
                    });
                }
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false });
            }
        });
    });
}

// 패널이 닫힐 때 정리
chrome.windows.onRemoved.addListener((windowId) => {
    if (translationPanel && translationPanel.id === windowId) {
        translationPanel = null;
    }
}); 