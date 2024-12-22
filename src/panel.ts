// 패널 초기화 시 메시지 리스너 등록
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Panel received message:', message);  // 디버깅용
    if (message.type === 'UPDATE_TRANSLATION') {
        const content = document.getElementById('translationContent');
        if (content) {
            content.innerHTML = message.html;
        }
        sendResponse({ success: true });
    }
    return true;  // 비동기 응답을 위해 true 반환
}); 