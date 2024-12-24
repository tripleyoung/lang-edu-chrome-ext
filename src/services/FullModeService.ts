import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class FullModeService {
    private isTranslating: boolean = false;
    private translationElements: Set<HTMLElement> = new Set();
    private observer: MutationObserver | null = null;
    private periodicCheckInterval: number | null = null;

    constructor(private translationService: TranslationService) {}

    public async applyFullMode(): Promise<void> {
        try {
            // 이전 상태 완전히 정리
            this.disableFullMode();
            
            this.isTranslating = true;
            logger.log('fullMode', 'Starting full mode translation');
            
            // 기존 번역 제거
            this.removeExistingTranslations();

            // 일반 텍스트 노드 처리
            await this.translateAllTextNodes();
            
            // 페이지 변경 감지 설정
            this.setupPageObserver();
            
            // 주기적 체크 시작
            this.startPeriodicCheck();

            logger.log('fullMode', 'Full mode applied successfully');
        } catch (error) {
            this.isTranslating = false;
            logger.log('fullMode', 'Error applying full mode', error);
            throw error;
        }
    }

    private cleanup(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.removeExistingTranslations();
        this.translationElements.clear();
    }

    private setupPageObserver(): void {
        if (this.observer) {
            return;
        }

        this.observer = new MutationObserver((mutations) => {
            if (!this.isTranslating) return;

            let shouldTranslate = false;
            const newTextNodes: Text[] = [];

            mutations.forEach(mutation => {
                // 1. 직접적인 텍스트 노드 변경 감지
                if (mutation.type === 'characterData') {
                    const textNode = mutation.target as Text;
                    if (this.filterTextNode(textNode) === NodeFilter.FILTER_ACCEPT) {
                        newTextNodes.push(textNode);
                    }
                }

                // 2. DOM 구조 변경 감지
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 새로 추가된 요소 내의 모든 텍스트 노드 수집
                        const walker = document.createTreeWalker(
                            node,
                            NodeFilter.SHOW_TEXT,
                            { acceptNode: (n) => this.filterTextNode(n) }
                        );

                        let textNode;
                        while ((textNode = walker.nextNode())) {
                            newTextNodes.push(textNode as Text);
                        }
                        shouldTranslate = true;
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        if (this.filterTextNode(node) === NodeFilter.FILTER_ACCEPT) {
                            newTextNodes.push(node as Text);
                            shouldTranslate = true;
                        }
                    }
                });
            });

            if (shouldTranslate && newTextNodes.length > 0) {
                logger.log('fullMode', 'New content detected', {
                    nodesCount: newTextNodes.length,
                    mutations: mutations.length
                });
                
                // 약간의 지연을 두어 DOM이 완전히 로드되도록 함
                setTimeout(() => {
                    this.translateBatch(newTextNodes, 0).catch(error => {
                        logger.log('fullMode', 'Error translating new content', error);
                    });
                }, 100);
            }
        });

        // 더 세밀한 변경 감지를 위한 옵션
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });

        // 초기 스캔 수행
        this.scanForMissedContent();
    }

    private async translateBatch(textNodes: Text[], startIndex: number): Promise<void> {
        try {
            const batchSize = 5;
            const endIndex = Math.min(startIndex + batchSize, textNodes.length);
            const currentBatch = textNodes.slice(startIndex, endIndex);

            await Promise.all(currentBatch.map(async (textNode) => {
                try {
                    const text = textNode.textContent?.trim() || '';
                    if (!text) return;

                    // 구두점으로 끝나는 문장들 찾기
                    const completeSentences = text.match(/[^.!?]+[.!?]+/g) || [];
                    
                    // 마지막 문장이 구두점 없이 끝는지 확인
                    const lastPart = text.replace(/.*[.!?]\s*/g, '').trim();
                    
                    // 최종 문장 배열 구성
                    const sentences = lastPart ? [...completeSentences, lastPart] : completeSentences;

                    logger.log('fullMode', 'Split sentences for translation', { 
                        completeSentences,
                        lastPart,
                        sentences 
                    });

                    const translations = await Promise.all(
                        sentences.map(async (sentence) => {
                            const sourceLang = await this.translationService.detectLanguage(sentence.trim());
                            return this.translationService.translateText(sentence.trim(), sourceLang);
                        })
                    );

                    if (textNode.parentNode) {
                        const container = document.createElement('span');
                        container.className = 'translation-inline-container';
                        container.innerHTML = `
                            <span class="original">${text}</span>
                            <span class="translation" style="color: #2196F3; font-size: 0.9em; display: block;">
                                ${translations.join(' ')}
                            </span>
                        `;
                        textNode.parentNode.replaceChild(container, textNode);
                    }
                } catch (error) {
                    logger.log('fullMode', 'Error processing text node', { error });
                }
            }));

            // 다음 배치 처리
            if (endIndex < textNodes.length && this.isTranslating) {
                setTimeout(() => this.translateBatch(textNodes, endIndex), 100);
            }
        } catch (error) {
            logger.log('fullMode', 'Error in batch translation', error);
        }
    }

    private removeExistingTranslations(): void {
        document.querySelectorAll('.translation-inline-container').forEach(container => {
            const originalText = container.querySelector('.original')?.textContent || '';
            const textNode = document.createTextNode(originalText);
            container.parentNode?.replaceChild(textNode, container);
            this.translationElements.delete(container as HTMLElement);
        });
    }

    private async translateAllTextNodes(): Promise<void> {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => this.filterTextNode(node)
            }
        );

        const batchSize = 10;
        const promises: Promise<void>[] = [];
        let count = 0;
        let batch: Text[] = [];

        let currentNode = walker.nextNode();
        while (currentNode) {
            const textNode = currentNode as Text;
            const text = textNode.textContent?.trim();
            if (text && text.length > 0) {
                batch.push(textNode);
                if (batch.length >= batchSize) {
                    promises.push(this.translateBatch(batch, count));
                    batch = [];
                }
            }
            currentNode = walker.nextNode();
        }

        if (batch.length > 0) {
            promises.push(this.translateBatch(batch, count));
        }

        await Promise.all(promises);
        logger.log('fullMode', 'Translation completed', { translatedNodes: count });
    }

    private filterTextNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        try {
            // 1. 이미 번역된 요소나 툴팁 체크
            if (parent.closest('.translation-inline-container') ||
                parent.closest('.word-tooltip') ||
                parent.closest('.word-tooltip-permanent') ||
                parent.closest('.word-highlight-full') ||
                parent.closest('.word-highlight') ||
                parent.closest('.tooltip-content') ||
                parent.closest('form') ||
                parent.querySelector('.translation-inline-container')) {
                return NodeFilter.FILTER_REJECT;
            }

            // 2. form 관련 요소와 무시할 태그들 체크
            const ignoredTags = [
                'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE',
                'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
                'FIELDSET', 'LEGEND'
            ];

            let currentElement: HTMLElement | null = parent;
            while (currentElement) {
                if (ignoredTags.includes(currentElement.tagName) ||
                    getComputedStyle(currentElement).display === 'none' || 
                    getComputedStyle(currentElement).visibility === 'hidden') {
                    return NodeFilter.FILTER_REJECT;
                }
                currentElement = currentElement.parentElement;
            }

            // 3. 텍스트 내용 체크
            const text = node.textContent?.trim();
            if (!text || text.length <= 1) {
                return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
        } catch (error) {
            logger.log('fullMode', 'Error in filterTextNode', error);
            return NodeFilter.FILTER_REJECT;
        }
    }

    public disableFullMode(): void {
        try {
            this.isTranslating = false;
            
            // Observer 정리
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            // 주기적 체크 정리
            if (this.periodicCheckInterval) {
                clearInterval(this.periodicCheckInterval);
                this.periodicCheckInterval = null;
            }

            // 모든 번역 요소 제거
            this.removeExistingTranslations();
            
            // Set 정리
            this.translationElements.clear();

            // 추가적인 정리
            document.querySelectorAll('.translation-inline-container').forEach(el => {
                const text = el.querySelector('.original')?.textContent || el.textContent;
                if (text) {
                    const textNode = document.createTextNode(text);
                    el.parentNode?.replaceChild(textNode, el);
                }
            });

            logger.log('fullMode', 'Full mode disabled and cleaned up');
        } catch (error) {
            logger.log('fullMode', 'Error during full mode cleanup', error);
        }
    }

    private async processTextNode(textNode: Text): Promise<void> {
        try {
            if (this.filterTextNode(textNode) === NodeFilter.FILTER_REJECT) return;

            const text = textNode.textContent?.trim() || '';
            if (!text || text.length < 2) return;

            const batch = [textNode];
            await this.translateBatch(batch, 0);
        } catch (error) {
            logger.log('fullMode', 'Error processing text node', error);
        }
    }

    private startPeriodicCheck(): void {
        if (this.periodicCheckInterval) {
            clearInterval(this.periodicCheckInterval);
            this.periodicCheckInterval = null;
        }

        const scanAndTranslate = async () => {
            if (!this.isTranslating) return;

            try {
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    { acceptNode: (node) => this.filterTextNode(node) }
                );

                const textNodes: Text[] = [];
                let node: Node | null;
                while ((node = walker.nextNode()) !== null) {
                    textNodes.push(node as Text);
                }

                if (textNodes.length > 0) {
                    await this.translateBatch(textNodes, 0);
                }
            } catch (error) {
                logger.log('fullMode', 'Error in periodic check', error);
            }
        };

        // 초기 스캔 즉시 실행
        scanAndTranslate();

        // 주기적 스캔 설정
        this.periodicCheckInterval = window.setInterval(scanAndTranslate, 2000);
    }

    // BR 태그 주변 텍스트를 처리하기 위한 새로운 메서드
    private async processTextElement(element: HTMLElement): Promise<void> {
        const text = element.textContent?.trim();
        if (!text || text.length <= 1) return;

        try {
            const sourceLang = await this.translationService.detectLanguage(text);
            const translation = await this.translationService.translateText(text, sourceLang);
            
            if (text.toLowerCase() === translation.toLowerCase()) return;

            const container = document.createElement('span');
            container.className = 'translation-inline-container';
            container.innerHTML = `
                <span class="original" style="display: block; font-size: ${getComputedStyle(element).fontSize}; font-weight: 400; color: rgb(32, 34, 36);">${text}</span>
                <span class="translation" style="display: block; color: #2196F3; font-size: calc(${getComputedStyle(element).fontSize} * 0.9); font-style: italic; margin-top: 4px;">${translation}</span>
            `;

            element.parentNode?.replaceChild(container, element);
            this.translationElements.add(container);
        } catch (error) {
            logger.log('fullMode', 'Error processing text element', error);
        }
    }

    // 놓친 컨텐츠를 찾아서 번역
    private scanForMissedContent(): void {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            { acceptNode: (node) => this.filterTextNode(node) }
        );

        const missedNodes: Text[] = [];
        let node;
        while ((node = walker.nextNode())) {
            const textNode = node as Text;
            const parent = textNode.parentElement;
            
            // 이미 번역된 컨텐츠가 아닌 경우에만 추가
            if (parent && !parent.closest('.translation-inline-container')) {
                missedNodes.push(textNode);
            }
        }

        if (missedNodes.length > 0) {
            logger.log('fullMode', 'Found missed content', { count: missedNodes.length });
            this.translateBatch(missedNodes, 0).catch(error => {
                logger.log('fullMode', 'Error translating missed content', error);
            });
        }
    }
} 