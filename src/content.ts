import { TranslationResponse, ClaudeResponse, TextGroup } from './types';
import { CONFIG } from './config';

class TranslationExtension {
    private isEnabled: boolean = true;
    private isProcessing: boolean = false;
    private totalTokensUsed: number = 0;
    private observer: MutationObserver | null = null;
    private processTimeout: number | null = null;

    constructor() {
        this.initialize();
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
                        content: `Analyze the following text. Translate it to Korean, explain its grammar structure, and provide definitions for key words or phrases.
                        
Original text: "${text}"

Please respond in the following JSON format only:
{
    "translation": "[Korean translation]",
    "grammar": "[Grammar explanation in Korean]",
    "definition": "[Key words/phrases explanation in Korean]"
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

        // 선택자 범위 확장 - BBC 뉴스 관련 선택자 추가
        const textElements = Array.from(document.querySelectorAll(
            'p, article, div > p, .article-content, .post-content, main p, section p, ' + 
            'div[class*="text"], div[class*="content"], div[class*="body"], ' +
            'div > div:not([class]), div > span, div > text, ' +
            // BBC 뉴스 관련 선택자
            '[data-component="text-block"], ' +
            'article p, ' +
            '.article__body-content p, ' +
            '.story-body__inner p, ' +
            '.article-body p'
        )).filter(el => {
            // 이미 처리된 요소 제외
            if (el.hasAttribute('data-translation-processed')) return false;
            if (el.closest('.translation-container')) return false;
            
            // 텍스트 내용 확인 - 최소 길이 조정
            const text = el.textContent?.trim() || '';
            if (text.length < 5) return false;  // 더 짧은 텍스트도 포함하도록 수정
            
            // 이미지 캡션이나 메타데이터는 제외
            if (el.closest('figcaption, .metadata, .tags, .byline')) return false;

            // React 관련 요소 제외
            if (el.closest('[class*="react"],[id*="react"],[data-reactroot],[id="root"],[id="__next"]')) {
                return false;
            }

            // 특정 요소 제외
            const invalidParents = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
            if (invalidParents.includes(el.tagName) || el.closest(invalidParents.join(','))) {
                return false;
            }

            // 숨겨진 요소 제외
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
            }

            // 실제 텍스트 컨텐츠가 있는지 확인
            const hasText = Array.from(el.childNodes).some(node => {
                if (node.nodeType !== Node.TEXT_NODE) return false;
                const text = node.textContent;
                return text != null && text.trim().length > 0;
            });

            return hasText;
        });

        const groups = this.groupTextElements(textElements);
        
        groups.forEach(group => {
            try {
                const container = this.createGroupContainer(group.elements);
                group.commonParent.appendChild(container);
                group.elements.forEach(element => {
                    element.setAttribute('data-translation-processed', 'true');
                });
            } catch (error) {
                console.error('Failed to process group:', error);
            }
        });
    }

    private groupTextElements(elements: Element[]): TextGroup[] {
        const groups: TextGroup[] = [];
        const maxDistance = 50; // 문단 간격 기준 (픽셀)

        // 요소들을 위치 기준으로 정렬
        const sortedElements = elements.slice().sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectA.top - rectB.top;
        });

        let currentGroup: Element[] = [];
        let lastRect: DOMRect | null = null;

        sortedElements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            
            // 새로운 그룹 시작 조건:
            // 1. 첫 요소
            // 2. 이전 요소와의 거리가 maxDistance보다 큼
            // 3. 부모 구조가 다름
            if (!lastRect || 
                Math.abs(rect.top - lastRect.bottom) > maxDistance || 
                !this.haveSameParentStructure(currentGroup[0], element)) {
                
                if (currentGroup.length > 0) {
                    groups.push({
                        elements: currentGroup,
                        commonParent: this.findCommonParent(currentGroup),
                        distance: maxDistance
                    });
                }
                currentGroup = [element];
            } else {
                currentGroup.push(element);
            }

            lastRect = rect;
        });

        // 마지막 그룹 처리
        if (currentGroup.length > 0) {
            groups.push({
                elements: currentGroup,
                commonParent: this.findCommonParent(currentGroup),
                distance: maxDistance
            });
        }

        return groups;
    }

    private findCommonParent(elements: Element[]): Element {
        let parent = elements[0].parentElement;
        while (parent) {
            if (elements.every(el => parent?.contains(el))) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return document.body;
    }

    private haveSameParentStructure(el1: Element | undefined, el2: Element): boolean {
        if (!el1) return false;

        const getParentPath = (el: Element): string[] => {
            const path: string[] = [];
            let current = el.parentElement;
            while (current && current !== document.body) {
                path.push(current.tagName + (current.className ? `.${current.className}` : ''));
                current = current.parentElement;
            }
            return path;
        };

        const path1 = getParentPath(el1);
        const path2 = getParentPath(el2);

        // 가장 가까운 3단계의 부모만 비교
        const relevantLength = Math.min(3, path1.length, path2.length);
        return path1.slice(0, relevantLength).join('|') === path2.slice(0, relevantLength).join('|');
    }

    private createGroupContainer(elements: Element[]): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'translation-container translation-group';
        container.style.cssText = `
            margin: 20px 0;
            padding: 20px;
            border: 2px solid transparent;
            border-radius: 8px;
            background: transparent;
            transition: all 0.3s ease;
        `;

        // 원본 텍스트 영역
        const textDiv = document.createElement('div');
        textDiv.className = 'original-text';
        textDiv.textContent = elements.map(el => el.textContent?.trim()).join('\n\n');
        textDiv.style.cssText = `
            padding: 15px;
            border-radius: 4px;
            font-size: 16px;
            line-height: 1.6;
            white-space: pre-wrap;
        `;

        // 번역 결과 영역
        const translationResult = document.createElement('div');
        translationResult.className = 'translation-result';
        translationResult.style.display = 'none';

        // 호버 효과 추가
        container.addEventListener('mouseenter', () => {
            container.style.borderColor = '#007bff';
            container.style.boxShadow = '0 0 0 1px #007bff';
        });

        container.addEventListener('mouseleave', () => {
            container.style.borderColor = 'transparent';
            container.style.boxShadow = 'none';
        });

        // 클릭 이벤트 추가
        container.addEventListener('click', async () => {
            if (translationResult.style.display === 'block') {
                translationResult.style.display = 'none';
                return;
            }

            try {
                const text = textDiv.textContent || '';
                const translation = await this.fetchTranslationAndGrammar(text);
                
                translationResult.innerHTML = `
                    <div style="margin-top: 15px;">
                        <div style="margin-bottom: 15px;">
                            <strong style="color: #007bff;">번역:</strong>
                            <div style="margin-top: 5px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                                ${translation.translation}
                            </div>
                        </div>
                        <div style="margin-bottom: 15px;">
                            <strong style="color: #28a745;">문법 설명:</strong>
                            <div style="margin-top: 5px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                                ${translation.grammar}
                            </div>
                        </div>
                        <div>
                            <strong style="color: #dc3545;">주요 단어/구문:</strong>
                            <div style="margin-top: 5px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                                ${translation.definition}
                            </div>
                        </div>
                    </div>
                `;
                translationResult.style.display = 'block';
            } catch (error) {
                console.error('Translation error:', error);
                translationResult.innerHTML = `
                    <div style="color: #dc3545; padding: 10px; margin-top: 10px; background: #f8d7da; border-radius: 4px;">
                        번역 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}
                    </div>
                `;
                translationResult.style.display = 'block';
            }
        });

        container.appendChild(textDiv);
        container.appendChild(translationResult);

        return container;
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
}

// 확장 프로그램 인스턴스 생성
new TranslationExtension(); 