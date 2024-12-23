import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class FullModeService {
    private isTranslating: boolean = false;
    private translationElements: Set<HTMLElement> = new Set();
    private observer: MutationObserver | null = null;

    constructor(private translationService: TranslationService) {}

    async applyFullMode(): Promise<void> {
        try {
            if (this.isTranslating) {
                logger.log('fullMode', 'Translation already in progress');
                return;
            }

            this.isTranslating = true;
            logger.log('fullMode', 'Starting full mode translation');
            
            this.cleanup();
            
            this.setupPageObserver();
            
            await this.translateAllTextNodes();
            
            logger.log('fullMode', 'Full mode translation completed');
        } catch (error) {
            logger.log('fullMode', 'Error in full translation mode', error);
            throw error;
        } finally {
            this.isTranslating = false;
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
        this.observer = new MutationObserver((mutations) => {
            if (!this.isTranslating) return;

            const processQueue = new Set<Text>();

            mutations.forEach(mutation => {
                // 텍스트 노드 변경 감지
                if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
                    processQueue.add(mutation.target as Text);
                }
                
                // 새로운 노드 추가 감지
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            processQueue.add(node as Text);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            // 새로 추가된 요소 내의 모든 텍스트 노드 수집
                            const walker = document.createTreeWalker(
                                node,
                                NodeFilter.SHOW_TEXT,
                                {
                                    acceptNode: (textNode) => this.filterTextNode(textNode)
                                }
                            );

                            let textNode;
                            while (textNode = walker.nextNode()) {
                                processQueue.add(textNode as Text);
                            }
                        }
                    });
                }
            });

            // 수집된 모든 텍스트 노드 처리
            if (processQueue.size > 0) {
                setTimeout(() => {
                    this.translateBatch(Array.from(processQueue), 0);
                }, 100);
            }
        });

        // 옵저버 설정
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });
    }

    private async translateBatch(nodes: Text[], count: number): Promise<void> {
        for (const textNode of nodes) {
            try {
                if (!textNode.parentNode || !textNode.textContent) continue;
                if (this.shouldSkipTextNode(textNode)) continue;

                const text = textNode.textContent.trim();
                if (!text || text.length < 2) continue;

                // 이미 번역된 요소인지 다시 한번 확인
                const existingContainer = textNode.parentElement?.closest('.translation-inline-container');
                if (existingContainer) continue;

                const sourceLang = await this.translationService.detectLanguage(text);
                const translation = await this.translationService.translateText(text, sourceLang);
                
                if (text.toLowerCase() === translation.toLowerCase()) continue;

                // 번역 컨테이너 생성 및 적용
                const container = this.createTranslationContainer(text, translation, textNode.parentElement!);
                
                if (textNode.parentNode) {
                    textNode.parentNode.replaceChild(container, textNode);
                    this.translationElements.add(container);
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                logger.log('fullMode', 'Error translating text node', { text: textNode.textContent, error });
            }
        }
    }

    private createTranslationContainer(originalText: string, translatedText: string, parentElement: HTMLElement): HTMLElement {
        const computedStyle = window.getComputedStyle(parentElement);
        
        const container = document.createElement('span');
        container.className = 'translation-inline-container';
        container.style.cssText = `
            display: block;
            font-family: ${computedStyle.fontFamily};
            line-height: ${computedStyle.lineHeight};
            margin: ${computedStyle.margin};
            padding: ${computedStyle.padding};
        `;

        const originalSpan = document.createElement('span');
        originalSpan.className = 'original';
        originalSpan.textContent = originalText;
        originalSpan.style.cssText = `
            display: block;
            font-size: ${computedStyle.fontSize};
            font-weight: ${computedStyle.fontWeight};
            color: ${computedStyle.color};
        `;

        const translationSpan = document.createElement('span');
        translationSpan.className = 'translation';
        translationSpan.textContent = translatedText;
        translationSpan.style.cssText = `
            display: block;
            color: #2196F3;
            font-size: calc(${computedStyle.fontSize} * 0.9);
            font-style: italic;
            margin-top: 4px;
        `;

        container.appendChild(originalSpan);
        container.appendChild(translationSpan);

        return container;
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
        let node;
        let count = 0;
        let batch: Text[] = [];

        while (node = walker.nextNode()) {
            const textNode = node as Text;
            const text = textNode.textContent?.trim() || '';
            if (!text) continue;

            batch.push(textNode);
            if (batch.length >= batchSize) {
                promises.push(this.translateBatch(batch, count));
                batch = [];
            }
        }

        if (batch.length > 0) {
            promises.push(this.translateBatch(batch, count));
        }

        await Promise.all(promises);
        logger.log('fullMode', 'Translation completed', { translatedNodes: count });
    }

    private filterTextNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent || 
            parent.tagName === 'SCRIPT' || 
            parent.tagName === 'STYLE' || 
            parent.tagName === 'NOSCRIPT' ||
            parent.closest('.translation-inline-container') ||
            getComputedStyle(parent).display === 'none' || 
            getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent?.trim();
        return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }

    public disableFullMode(): void {
        this.isTranslating = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.removeExistingTranslations();
        this.translationElements.clear();
        logger.log('fullMode', 'Full mode disabled');
    }

    private async processTextNode(textNode: Text): Promise<void> {
        try {
            if (this.shouldSkipTextNode(textNode)) return;

            const text = textNode.textContent?.trim() || '';
            if (!text || text.length < 2) return;

            const batch = [textNode];
            await this.translateBatch(batch, 0);
        } catch (error) {
            logger.log('fullMode', 'Error processing text node', error);
        }
    }

    private shouldSkipTextNode(node: Text): boolean {
        const parent = node.parentElement;
        if (!parent) return true;

        return this.shouldSkipElement(parent) || 
               parent.closest('.translation-inline-container') !== null ||
               parent.querySelector('.translation-inline-container') !== null;
    }

    private shouldSkipElement(element: HTMLElement): boolean {
        return element.tagName === 'SCRIPT' ||
            element.tagName === 'STYLE' ||
            element.tagName === 'NOSCRIPT' ||
            getComputedStyle(element).display === 'none' ||
            getComputedStyle(element).visibility === 'hidden';
    }
} 