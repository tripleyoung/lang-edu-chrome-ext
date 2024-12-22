import { Logger } from './logger';

const logger = Logger.getInstance();

logger.log('panel', 'Panel script loaded');

// 기본 UI 초기화
function initializeUI() {
    const content = document.getElementById('translationContent');
    if (content) {
        content.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto;">
                <div style="text-align: center; padding: 20px;">
                    <h2 style="color: #ffd700;">번역 패널</h2>
                    <p style="color: #999;">텍스트에 마우스를 올리면 번역 결과가 여기에 표시됩니다.</p>
                </div>
            </div>
        `;
        logger.log('panel', 'UI initialized');
    }
}

// 메시지 리스너 등록
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log('panel', 'Received message', message);
    
    if (message.type === 'UPDATE_TRANSLATION') {
        const content = document.getElementById('translationContent');
        if (content) {
            const { selectedText, translation } = message.data;
            content.innerHTML = `
                <div style="max-width: 1200px; margin: 0 auto;">
                    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                        <div style="flex: 1;">
                            <strong style="color: #ffd700; display: block; margin-bottom: 8px;">선택한 텍스트</strong>
                            <div class="translation-container">
                                ${selectedText}
                            </div>
                        </div>
                        <div style="flex: 1;">
                            <strong style="color: #66b3ff; display: block; margin-bottom: 8px;">번역</strong>
                            <div class="translation-container">
                                ${translation.translation}
                            </div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                        <div>
                            <strong style="color: #66ff66; display: block; margin-bottom: 8px;">문법 설명</strong>
                            <div class="translation-container">
                                ${translation.grammar}
                            </div>
                        </div>
                        <div>
                            <strong style="color: #ff6666; display: block; margin-bottom: 8px;">주요 단어/구문</strong>
                            <div class="translation-container">
                                ${translation.definition}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            logger.log('panel', 'Updated translation content');
        }
        sendResponse({ success: true });
    }
    return true;
});

// 초기화 실행
document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    logger.log('panel', 'Panel initialization complete');
});