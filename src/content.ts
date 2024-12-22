import { TranslationResponse, ClaudeResponse, TextGroup } from './types';
import { CONFIG } from './config';
import { Logger } from './logger';

const logger = Logger.getInstance();

// content.ts 파일 상단에 전역 리스너 추가
let extensionInstance: TranslationExtension | null = null;

// 전역 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.log('content', 'Received message in global listener', message);

    if (!extensionInstance) {
        logger.log('content', 'Extension instance not ready');
        return false;
    }

    if (message.type === 'SET_READER_MODE') {
        // 읽기 모드 설정만 하고 패널은 건드리지 않음
        extensionInstance.setReaderMode(message.enabled);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'UPDATE_TRANSLATION') {
        extensionInstance.sendTranslationToPanel(message.data.selectedText, message.data.translation);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'UPDATE_SETTINGS') {
        extensionInstance.usePanel = message.settings.usePanel;
        extensionInstance.useTooltip = message.settings.useTooltip;
        extensionInstance.useFullMode = message.settings.useFullMode;
        
        if (message.settings.useFullMode) {
            extensionInstance.applyFullMode();
        } else {
            window.location.reload();  // 전체 모드 비활성화 시 페이지 새로고침
        }
        return true;
    }

    if (message.type === 'PANEL_CREATED') {
        chrome.windows.get(message.windowId, (window) => {
            TranslationExtension.panelWindow = window;
        });
        return true;
    }

    return true;
});

class TranslationExtension {
    private static instance: TranslationExtension | null = null;
    public static panelWindow: chrome.windows.Window | null = null;
    
    private isEnabled: boolean = true;
    private isProcessing: boolean = false;
    private totalTokensUsed: number = 0;
    private observer: MutationObserver | null = null;
    private processTimeout: number | null = null;
    private translationBar: HTMLDivElement | null = null;
    private debounceTimer: number | null = null;
    private isReaderMode: boolean = false;
    private eventListeners: Map<HTMLElement, Function> = new Map();  // 이벤트 리스너 저장용
    private fullPageContent: string = '';  // 전체 텍스트 저장용
    private showInTooltip: boolean = false;  // 추가
    public usePanel: boolean = true;
    public useTooltip: boolean = false;
    public useFullMode: boolean = false;

    constructor() {
        if (TranslationExtension.instance) {
            return TranslationExtension.instance;
        }
        TranslationExtension.instance = this;
        extensionInstance = this;  // 전역 변수에 인스턴스 저장
        this.initialize();
        
        // 저장된 설정 불러오기
        chrome.storage.sync.get(['usePanel', 'useTooltip', 'useFullMode'], (result) => {
            this.usePanel = result.usePanel ?? true;
            this.useTooltip = result.useTooltip ?? false;
            this.useFullMode = result.useFullMode ?? false;
            
            // 전체 모드가 활성화되어 있으면 즉시 적용
            if (this.useFullMode) {
                this.applyFullMode();
            }
        });
    }

    private async initialize(): Promise<void> {
        console.log('Initializing translation extension...');
        
        if (!document.getElementById('token-counter')) {
            this.createTokenCounter();
        }
        
        if (!this.isReactApp()) {
            this.processTextElements();
            this.setupObserver();
        }

        // 5초 후 재실행
        setTimeout(() => this.processTextElements(), 5000);
    }

    private isReactApp(): boolean {
        return !!(document.querySelector('#__next') || document.querySelector('#root'));
    }

    private createTokenCounter(): void {
        const counter = document.createElement('div');
        counter.id = 'token-counter';
        counter.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 10000;
        `;
        document.body.appendChild(counter);
        this.updateTokenCounter();
    }

    private updateTokenCounter(): void {
        const counter = document.getElementById('token-counter');
        if (counter) {
            counter.innerHTML = `
                <div>용된 토큰: ${this.totalTokensUsed}</div>
                <div>예상 비용: $${(this.totalTokensUsed * 0.00000163).toFixed(4)}</div>
            `;
        }
    }

    private async fetchTranslationAndGrammar(text: string): Promise<TranslationResponse> {
        try {
            const targetLanguage = await chrome.storage.sync.get('targetLanguage');
            const targetLang = targetLanguage.targetLanguage || 'ko';

            logger.log('content', 'Fetching translation', { text, targetLang });

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.CLAUDE_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 1000,
                    messages: [{
                        role: 'user',
                        content: `Detect the language of the following text and translate it to ${targetLang}. Then analyze its grammar structure and provide definitions for key words or phrases.
                        
Original text: "${text}"

Please respond in the following JSON format only:
{
    "translation": "[Translation to ${targetLang}]",
    "grammar": "[Grammar explanation in ${targetLang}]",
    "definition": "[Key words/phrases explanation in ${targetLang}]"
}`
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as ClaudeResponse;
            logger.log('content', 'Received translation response');

            const parsedResponse = JSON.parse(data.content[0].text) as TranslationResponse;
            
            if (data.usage) {
                this.totalTokensUsed += data.usage.input_tokens + data.usage.output_tokens;
                this.updateTokenCounter();
            }
            
            return parsedResponse;
        } catch (error) {
            logger.log('content', 'Translation API error', error);
            throw error;
        }
    }

    public processTextElements(): void {
        if (!this.isEnabled) return;  // 읽기 모드와 상관이 호버 가능하도록

        const textElements = Array.from(document.querySelectorAll('*')).filter(el => {
            // 이미 처리된 요소 제외
            if (el.hasAttribute('data-translation-processed')) return false;
            if (el.closest('.translation-container')) return false;
            if (el.closest('.reader-mode-container')) return false;  // 읽기 모드 컨테이너는 제외

            // 제외할 태그들
            const excludeTags = [
                'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INPUT', 
                'SELECT', 'TEXTAREA', 'HEAD', 'META', 'LINK', 'TITLE',
                'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO'
            ];
            if (excludeTags.includes(el.tagName)) return false;

            // 직접적인 스트리밍 노드 확인
            const hasText = Array.from(el.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .some(node => {
                    const text = node.textContent?.trim() || '';
                    return text.length >= 2 && !/^[\s\d\W]+$/.test(text);
                });

            return hasText;
        });

        textElements.forEach(element => {
            const htmlEl = element as HTMLElement;
            let originalColor = '';

            const mouseEnterHandler = async () => {
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }

                this.debounceTimer = window.setTimeout(async () => {
                    try {
                        const text = Array.from(htmlEl.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE)
                            .map(node => node.textContent?.trim())
                            .filter(text => text && text.length > 0)
                            .join(' ');

                        if (text) {
                            const translation = await this.googleTranslate(text);

                            if (this.useTooltip) {
                                // 툴팁 모드
                                const tooltipDiv = document.createElement('div');
                                tooltipDiv.className = 'translation-tooltip';
                                tooltipDiv.style.cssText = `
                                    position: absolute;
                                    top: 100%;
                                    left: 0;
                                    right: 0;
                                    width: 100%;
                                    background-color: rgba(0, 0, 0, 0.8);
                                    color: white;
                                    padding: 8px 12px;
                                    border-radius: 4px;
                                    font-size: 0.9em;
                                    z-index: 1000;
                                    white-space: pre-wrap;
                                    margin-top: 5px;
                                    box-sizing: border-box;
                                `;
                                tooltipDiv.textContent = translation;
                                htmlEl.style.position = 'relative';
                                htmlEl.appendChild(tooltipDiv);

                                const mouseLeaveHandler = () => {
                                    tooltipDiv.remove();
                                    htmlEl.removeEventListener('mouseleave', mouseLeaveHandler);
                                };
                                htmlEl.addEventListener('mouseleave', mouseLeaveHandler);
                            } else if (this.usePanel) {
                                // 패널 모드
                                await this.createTranslationBar();  // 먼저 패널 생성
                                await this.showPanel();  // 패널 표시
                                await this.sendTranslationToPanel(text, {  // 번역 전송
                                    translation: translation,
                                    grammar: '',
                                    definition: '',
                                    words: [],
                                    idioms: []
                                });
                            }
                        }
                    } catch (error) {
                        logger.log('content', 'Error in mouseenter handler', error);
                    }
                }, 100);
            };

            // 이벤트 리스너 저장
            this.eventListeners.set(htmlEl, mouseEnterHandler);
            htmlEl.addEventListener('mouseenter', mouseEnterHandler);
        });
    }

    private setupObserver(): void {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            const validMutations = mutations.filter(mutation => {
                const target = mutation.target as Element;
                
                if (target.closest('[class*="react"],[id*="react"],[data-reactroot],[id="root"],[id="__next"]')) {
                    return false;
                }
                
                if (target.closest('.translation-container') || 
                    target.classList?.contains('translation-container') ||
                    target.id === 'token-counter') {
                    return false;
                }
                
                return mutation.addedNodes.length > 0;
            });
            
            if (validMutations.length > 0) {
                if (this.processTimeout) {
                    clearTimeout(this.processTimeout);
                }
                this.processTimeout = window.setTimeout(() => {
                    this.processTextElements();
                }, 1000);
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }

    private async createTranslationBar(): Promise<void> {
        if (TranslationExtension.panelWindow?.id) {
            try {
                await chrome.windows.get(TranslationExtension.panelWindow.id);
                return; // 창이 존재하면 리턴
            } catch {
                // 창이 존재하지 않으면 계속 진행
            }
        }
        try {
            const response = await chrome.runtime.sendMessage({ type: 'OPEN_TRANSLATION_PANEL' });
            if (!response || !response.success) {
                logger.log('content', 'Failed to open translation panel');
            }
        } catch (error) {
            logger.log('content', 'Error opening translation panel', error);
        }
    }

    // 패널 표시/숨김 메서드 추가
    private async showPanel(): Promise<void> {
        if (TranslationExtension.panelWindow?.id) {
            try {
                await chrome.windows.get(TranslationExtension.panelWindow.id);
                chrome.windows.update(TranslationExtension.panelWindow.id, { 
                    focused: true,
                    drawAttention: true 
                });
            } catch {
                // 창이 존재하지 않으면 다시 생성
                this.createTranslationBar();
            }
        }
    }

    private hidePanel(): void {
        // 마우스가 벗어날 때는 패널을 숨기지 않음
        // 사용자가 직접 닫거나 이지를 떠날 때만 닫힘
        return;
    }

    public async sendTranslationToPanel(text: string, translation?: TranslationResponse): Promise<void> {
        try {
            logger.log('content', 'Sending to panel', { text });
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_TO_PANEL',
                data: {
                    selectedText: text,
                    translation: translation || {
                        translation: '번역 실패',
                        grammar: '문법 분석 실패',
                        definition: '정의 분석 실패',
                        words: [],
                        idioms: []
                    }
                }
            });
            logger.log('content', 'Send response', response);
        } catch (error) {
            logger.log('content', 'Error sending to panel', error);
        }
    }

    public setReaderMode(enabled: boolean): void {
        this.isReaderMode = enabled;
        logger.log('content', `Reader mode ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            // 페이지 텍스트만 변경하고 번역 패널은 그대로 유지
            this.updatePageLayout();
        } else {
            // 페이지 새로고으로 원 상태로 복구
            window.location.reload();
        }
    }

    private async updatePageLayout(): Promise<void> {
        try {
            // 텍스트 요소 처리
            const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th'))
                .filter(el => {
                    const text = el.textContent?.trim();
                    return text && text.length > 0 && getComputedStyle(el).display !== 'none';
                });

            for (const element of textElements) {
                const originalText = element.textContent?.trim() || '';
                if (originalText.length < 2) continue;

                const originalStyles = window.getComputedStyle(element);
                
                const container = document.createElement('div');
                container.className = 'reader-mode-container';
                container.style.cssText = `
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin: ${originalStyles.margin};
                    padding: ${originalStyles.padding};
                    font-size: ${originalStyles.fontSize};
                    line-height: ${originalStyles.lineHeight};
                `;

                // 원 텍스트 (왼)
                const originalDiv = document.createElement('div');
                originalDiv.textContent = originalText;
                originalDiv.style.cssText = `
                    color: ${originalStyles.color};
                    font-family: ${originalStyles.fontFamily};
                    font-weight: ${originalStyles.fontWeight};
                `;

                // ��� 텍스트 (오른쪽)
                const translationDiv = document.createElement('div');
                translationDiv.style.cssText = `
                    color: #666;
                    font-family: ${originalStyles.fontFamily};
                    font-style: italic;
                `;
                translationDiv.textContent = '번역 중...';

                container.appendChild(originalDiv);
                container.appendChild(translationDiv);
                element.replaceWith(container);

                // Google Translate API 호출
                try {
                    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(originalText)}`);
                    const data = await response.json();
                    if (data && data[0] && data[0][0]) {
                        translationDiv.textContent = data[0][0][0];
                    }
                } catch (error) {
                    translationDiv.textContent = '번역 실패';
                    logger.log('content', 'Translation failed', error);
                }
            }

            logger.log('content', 'Page layout updated with translations');
        } catch (error) {
            logger.log('content', 'Error updating page layout', error);
        }
    }

    private getVisibleText(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent?.trim() || '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const element = node as HTMLElement;
        if (getComputedStyle(element).display === 'none' || 
            getComputedStyle(element).visibility === 'hidden') {
            return '';
        }

        const texts: string[] = [];
        element.childNodes.forEach(child => {
            const text = this.getVisibleText(child);
            if (text) texts.push(text);
        });

        return texts.join(' ');
    }

    public getPageContent(): string {
        const mainContent = this.getVisibleText(document.body);
        return mainContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n\n');
    }

    public setFullPageContent(content: string): void {
        this.fullPageContent = content;
        logger.log('content', 'Full page content saved', { length: content.length });
    }

    private async googleTranslate(text: string): Promise<string> {
        try {
            // 저장된 타겟 언어 가져오기
            const { targetLanguage } = await chrome.storage.sync.get('targetLanguage');
            const tl = targetLanguage || 'ko';  // 기본값은 한국어
            
            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`
            );
            const data = await response.json();
            return data[0][0][0];
        } catch (error) {
            logger.log('content', 'Google translation failed', error);
            throw error;
        }
    }

    public setTranslationDisplay(showInTooltip: boolean): void {
        this.showInTooltip = showInTooltip;
        
        // 모든 기존 이벤트 리스너 제거 후 다시 등록
        this.eventListeners.forEach((listener, element) => {
            element.removeEventListener('mouseenter', listener as any);
        });
        this.eventListeners.clear();
        
        // 텍스트 요소 시 처리
        this.processTextElements();
        logger.log('content', `Translation display mode set to ${showInTooltip ? 'tooltip' : 'panel'}`);
    }

    public async applyFullMode(): Promise<void> {
        const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th'))
            .filter(el => {
                const text = el.textContent?.trim();
                return text && text.length > 0 && getComputedStyle(el).display !== 'none';
            });

        for (const element of textElements) {
            const originalText = element.textContent?.trim() || '';
            if (originalText.length < 2) continue;

            try {
                const translation = await this.googleTranslate(originalText);
                
                // 원문과 번역문이 동일한 경우 건너뛰기
                if (originalText.toLowerCase() === translation.toLowerCase()) {
                    continue;
                }
                
                const container = document.createElement('div');
                container.className = 'translation-full-mode';
                container.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    margin: ${getComputedStyle(element).margin};
                `;

                // 원본 요소의 스타일을 복사
                const originalElement = element.cloneNode(true) as HTMLElement;
                
                // 번역 요소 생성
                const translationElement = document.createElement('div');
                translationElement.textContent = translation;
                translationElement.style.cssText = `
                    color: #ff6b00;
                    font-style: italic;
                    font-size: 0.9em;
                `;

                container.appendChild(originalElement);
                container.appendChild(translationElement);
                element.replaceWith(container);
            } catch (error) {
                logger.log('content', 'Translation failed for element', error);
            }
        }
    }
}

// content.ts 파일 상단에 즉시 실행 함수 추가
(async function init() {
    try {
        // DOM이 준비될 때까지 대기
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        logger.log('content', 'Initializing extension');
        new TranslationExtension();
        logger.log('content', 'Extension initialized');
    } catch (error) {
        logger.log('content', 'Failed to initialize extension', error);
    }
})(); 