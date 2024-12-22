import { TranslationResponse, ClaudeResponse, TextGroup } from './types';
import { CONFIG } from './config';
import { Logger } from './logger';

const logger = Logger.getInstance();

class TranslationExtension {
    private static instance: TranslationExtension | null = null;
    private static panelWindow: Window | null = null;
    
    private isEnabled: boolean = true;
    private isProcessing: boolean = false;
    private totalTokensUsed: number = 0;
    private observer: MutationObserver | null = null;
    private processTimeout: number | null = null;
    private translationBar: HTMLDivElement | null = null;

    constructor() {
        if (TranslationExtension.instance) {
            return TranslationExtension.instance;
        }
        TranslationExtension.instance = this;
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
                <div>사용된 토큰: ${this.totalTokensUsed}</div>
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

    private processTextElements(): void {
        if (!this.isEnabled) return;

        const textElements = Array.from(document.querySelectorAll('*')).filter(el => {
            // 이미 처리된 요소 제외
            if (el.hasAttribute('data-translation-processed')) return false;
            if (el.closest('.translation-container')) return false;

            // 제외할 태그들
            const excludeTags = [
                'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INPUT', 
                'SELECT', 'TEXTAREA', 'HEAD', 'META', 'LINK', 'TITLE',
                'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO'
            ];
            if (excludeTags.includes(el.tagName)) return false;

            // 직접적인 스트 노드 확인
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

            htmlEl.addEventListener('mouseenter', async () => {
                try {
                    // 색상 변경 시도
                    try {
                        originalColor = window.getComputedStyle(htmlEl).color;
                        htmlEl.style.color = '#ff6b00';
                        htmlEl.style.transition = 'color 0.3s ease';
                    } catch (e) {
                        logger.log('content', 'Color change failed', e);
                    }

                    // 텍스트 내용 가져오기
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
            });

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
        try {
            const response = await chrome.runtime.sendMessage({ type: 'OPEN_TRANSLATION_PANEL' });
            if (!response || !response.success) {
                console.error('Failed to open translation panel');
            }
        } catch (error) {
            console.error('Error opening translation panel:', error);
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

    private async sendTranslationToPanel(text: string, translation?: TranslationResponse): Promise<void> {
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
}

// 확 프로그램 인스턴스 생성
new TranslationExtension(); 