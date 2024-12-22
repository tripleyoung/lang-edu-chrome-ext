import { TranslationResponse, ClaudeResponse, TextGroup } from './types';
import { CONFIG } from './config';

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

            const data = await response.json() as ClaudeResponse;
            const parsedResponse = JSON.parse(data.content[0].text) as TranslationResponse;
            
            if (data.usage) {
                this.totalTokensUsed += data.usage.input_tokens + data.usage.output_tokens;
                this.updateTokenCounter();
            }
            
            return parsedResponse;
        } catch (error) {
            console.error('Translation API error:', error);
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

        // 각 텍스트 요소에 이벤트 리스너 추가
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
                        console.log('Color change failed, but continuing with translation');
                    }

                    // 텍스트 내용 가져오기
                    const text = Array.from(htmlEl.childNodes)
                        .filter(node => node.nodeType === Node.TEXT_NODE)
                        .map(node => node.textContent?.trim())
                        .filter(text => text && text.length > 0)
                        .join(' ');

                    if (text && this.translationBar) {
                        // 먼저 선택한 텍스트를 보여줌
                        this.translationBar.innerHTML = `
                            <div style="max-width: 1200px; margin: 0 auto;">
                                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                                    <div style="flex: 1;">
                                        <strong style="color: #ffd700; display: block; margin-bottom: 8px;">선택한 텍스트</strong>
                                        <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px; color: #ffffff; font-size: 16px; line-height: 1.5;">
                                            ${text}
                                        </div>
                                    </div>
                                    <div style="flex: 1;">
                                        <strong style="color: #66b3ff; display: block; margin-bottom: 8px;">번역</strong>
                                        <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px; color: #ffffff; font-size: 16px; line-height: 1.5;">
                                            번역 중...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                        this.showPanel();

                        try {
                            const translation = await this.fetchTranslationAndGrammar(text);
                            
                            // 번역 결과로 업데이트
                            this.translationBar.innerHTML = `
                                <div style="max-width: 1200px; margin: 0 auto;">
                                    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                                        <div style="flex: 1;">
                                            <strong style="color: #ffd700; display: block; margin-bottom: 8px;">선택한 텍스트</strong>
                                            <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px; color: #ffffff; font-size: 16px; line-height: 1.5;">
                                                ${text}
                                            </div>
                                        </div>
                                        <div style="flex: 1;">
                                            <strong style="color: #66b3ff; display: block; margin-bottom: 8px;">번역</strong>
                                            <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px; color: #ffffff; font-size: 16px; line-height: 1.5;">
                                                ${translation.translation}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; color: white;">
                                        <div>
                                            <strong style="color: #66ff66; display: block; margin-bottom: 8px;">문법 설명</strong>
                                            <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px;">
                                                ${translation.grammar}
                                            </div>
                                        </div>
                                        <div>
                                            <strong style="color: #ff6666; display: block; margin-bottom: 8px;">주요 단어/구문</strong>
                                            <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px;">
                                                ${translation.definition}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        } catch (error) {
                            // 번역 실패 시에도 원본 텍스트는 유지
                            this.translationBar.innerHTML = `
                                <div style="max-width: 1200px; margin: 0 auto;">
                                    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                                        <div style="flex: 1;">
                                            <strong style="color: #ffd700; display: block; margin-bottom: 8px;">선택한 텍스트</strong>
                                            <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px; color: #ffffff; font-size: 16px; line-height: 1.5;">
                                                ${text}
                                            </div>
                                        </div>
                                        <div style="flex: 1;">
                                            <strong style="color: #ff6666; display: block; margin-bottom: 8px;">번역 실패</strong>
                                            <div style="background: rgba(255, 255, 255, 0.15); padding: 15px; border-radius: 8px; color: #ff6666;">
                                                번역 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }
                } catch (error) {
                    console.error('Error:', error);
                }
            });

            htmlEl.addEventListener('mouseleave', () => {
                if (originalColor) {
                    htmlEl.style.color = originalColor;
                }
                this.hidePanel();
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

    private createTranslationBar(): void {
        // 이미 열린 패널이 있으면 재사용
        if (TranslationExtension.panelWindow && !TranslationExtension.panelWindow.closed) {
            TranslationExtension.panelWindow.focus();
            this.translationBar = TranslationExtension.panelWindow.document.getElementById('translationContent') as HTMLDivElement;
            return;
        }

        // 새 패널 생성
        TranslationExtension.panelWindow = window.open('', 'translationPanel', `
            width=800,
            height=400,
            left=${window.screen.width - 820},
            top=${window.screen.height - 450},
            resizable=yes,
            scrollbars=yes,
            status=no,
            location=no,
            toolbar=no,
            menubar=no
        `);

        if (!TranslationExtension.panelWindow) {
            console.error('팝업이 차단되었습니다.');
            return;
        }

        // 패널 윈도우 스타일링
        TranslationExtension.panelWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>번역 패널</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        background: rgb(33, 33, 33);
                        color: white;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    }
                    .translation-bar {
                        height: 100%;
                        overflow-y: auto;
                    }
                </style>
            </head>
            <body>
                <div id="translationContent"></div>
            </body>
            </html>
        `);

        this.translationBar = TranslationExtension.panelWindow.document.getElementById('translationContent') as HTMLDivElement;

        // 윈도우 닫힐 때 정리
        TranslationExtension.panelWindow.onbeforeunload = () => {
            this.translationBar = null;
            TranslationExtension.panelWindow = null;
        };

        // 페이지 언로드 시 패널도 닫기
        window.addEventListener('unload', () => {
            if (TranslationExtension.panelWindow && !TranslationExtension.panelWindow.closed) {
                TranslationExtension.panelWindow.close();
            }
        });
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
}

// 확 프로그램 인스턴스 생성
new TranslationExtension(); 