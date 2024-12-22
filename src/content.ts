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

    return true;
});

class TranslationExtension {
    private static instance: TranslationExtension | null = null;
    private static panelWindow: Window | null = null;
    
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

    constructor() {
        if (TranslationExtension.instance) {
            return TranslationExtension.instance;
        }
        TranslationExtension.instance = this;
        extensionInstance = this;  // 전역 변수에 인스턴스 저장
        this.initialize();
        this.createTranslationBar();
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
        if (!this.isEnabled) return;  // 읽기 모드와 상관없이 호버 가능하도록

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
                        // 색상 변경 시도
                        try {
                            originalColor = window.getComputedStyle(htmlEl).color;
                            htmlEl.style.color = '#ff6b00';
                            htmlEl.style.transition = 'color 0.3s ease';
                        } catch (e) {
                            logger.log('content', 'Color change failed', e);
                        }

                        // 텍스트 추출 및 번역 패널로 전송 (읽기 모드와 상관없이)
                        const text = Array.from(htmlEl.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE)
                            .map(node => node.textContent?.trim())
                            .filter(text => text && text.length > 0)
                            .join(' ');

                        if (text) {
                            await this.createTranslationBar();
                            this.showPanel();

                            try {
                                const translation = await this.fetchTranslationAndGrammar(text);
                                await this.sendTranslationToPanel(text, translation);
                            } catch (error) {
                                await this.sendTranslationToPanel(text);
                                logger.log('content', 'Translation failed', error);
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
            htmlEl.addEventListener('mouseleave', () => {
                if (originalColor) {
                    htmlEl.style.color = originalColor;
                }
            });

            element.setAttribute('data-translation-processed', 'true');
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
        // 이미 패널이 있으면 새로 생성하지 않음
        if (TranslationExtension.panelWindow && !TranslationExtension.panelWindow.closed) {
            return;
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
    private showPanel(): void {
        if (TranslationExtension.panelWindow && TranslationExtension.panelWindow.closed) {
            // 패널이 닫혔다면 다시 생성
            this.createTranslationBar();
        } else if (TranslationExtension.panelWindow) {
            TranslationExtension.panelWindow.focus();
        }
    }

    private hidePanel(): void {
        // 마우스가 벗어났을 때는 패널을 숨기지 않음
        // 사용자가 직접 닫거나 페이지를 떠날 때만 닫힘
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
            // 페이지의 텍스트만 변경하고 번역 패널은 그대로 유지
            this.updatePageLayout();
        } else {
            // 페이지 새로고침으로 원래 상태로 복구
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

                // 원본 텍스트 (왼쪽)
                const originalDiv = document.createElement('div');
                originalDiv.textContent = originalText;
                originalDiv.style.cssText = `
                    color: ${originalStyles.color};
                    font-family: ${originalStyles.fontFamily};
                    font-weight: ${originalStyles.fontWeight};
                `;

                // 번역 텍스트 (오른쪽)
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