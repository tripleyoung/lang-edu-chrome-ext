import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class FullModeService {
    private isTranslating: boolean = false;
    private translationElements: Set<HTMLElement> = new Set();
    private observer: MutationObserver | null = null;
    private periodicCheckInterval: number | null = null;

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
            
            this.startPeriodicCheck();
            
            logger.log('fullMode', 'Full mode translation completed');
        } catch (error) {
            logger.log('fullMode', 'Error in full translation mode', error);
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
        let processingTimeout: number | null = null;
        const pendingNodes = new Set<Text>();
        let isProcessing = false;

        const processNodes = async () => {
            if (!this.isTranslating || pendingNodes.size === 0 || isProcessing) return;

            try {
                isProcessing = true;
                const nodesToProcess = Array.from(pendingNodes);
                pendingNodes.clear();

                // 배치 처리
                const batchSize = 5;
                for (let i = 0; i < nodesToProcess.length; i += batchSize) {
                    const batch = nodesToProcess.slice(i, i + batchSize);
                    const validNodes = batch.filter(node => 
                        node.isConnected && 
                        !this.shouldSkipTextNode(node) &&
                        node.textContent?.trim().length &&
                        node.textContent?.trim().length > 1
                    );

                    if (validNodes.length > 0) {
                        await this.translateBatch(validNodes, 0);
                        // 각 배치 사이에 짧은 딜레이
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
            } finally {
                isProcessing = false;
                // 처리 중에 새로 추가된 노드가 있다면 다시 처리
                if (pendingNodes.size > 0) {
                    processingTimeout = window.setTimeout(() => {
                        processNodes();
                    }, 100) as unknown as number;
                }
            }
        };

        const addNodeForProcessing = (node: Text) => {
            if (node.isConnected && !this.shouldSkipTextNode(node)) {
                pendingNodes.add(node);
                if (processingTimeout) {
                    clearTimeout(processingTimeout);
                }
                processingTimeout = window.setTimeout(() => {
                    processNodes();
                }, 100) as unknown as number;
            }
        };

        // MutationObserver 설정
        this.observer = new MutationObserver((mutations) => {
            if (!this.isTranslating) return;

            mutations.forEach(mutation => {
                if (mutation.type === 'characterData' && 
                    mutation.target.nodeType === Node.TEXT_NODE) {
                    addNodeForProcessing(mutation.target as Text);
                }

                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            addNodeForProcessing(node as Text);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            // 새로 추가된 요소의 모든 텍스트 노드 처리
                            const walker = document.createTreeWalker(
                                node,
                                NodeFilter.SHOW_TEXT,
                                null
                            );

                            let textNode: Text | null;
                            while ((textNode = walker.nextNode() as Text | null) !== null) {
                                addNodeForProcessing(textNode);
                            }
                        }
                    });
                }
            });
        });

        // 옵저버 설정 강화
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });

        // 초기 페이지 스캔
        const scanPage = () => {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null
            );

            let textNode: Text | null;
            while ((textNode = walker.nextNode() as Text | null) !== null) {
                addNodeForProcessing(textNode);
            }
        };

        // 초기 스캔 실행
        scanPage();

        // 주기적으로 페이지 재스캔 (동적 콘텐츠 대응)
        setInterval(scanPage, 5000);
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
                    
                    // 마지막 문장이 구두점 없이 끝나는지 확인
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

        // 이미 번역된 요소는 건너뛰기
        if (parent.closest('.translation-inline-container')) {
            return NodeFilter.FILTER_REJECT;
        }

        const text = node.textContent?.trim();
        if (!text || text.length <= 1) {
            return NodeFilter.FILTER_REJECT;
        }

        // 무할 태그들
        const ignoredTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT'];
        if (ignoredTags.includes(parent.tagName) ||
            getComputedStyle(parent).display === 'none' || 
            getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
        }

        // 번역 대상이 될 수 있는 일반적인 컨테이너들
        const validContainers = [
            'P', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'LI', 'TD', 'TH', 'CAPTION', 'LABEL', 'FIGCAPTION',
            'ARTICLE', 'SECTION', 'MAIN', 'ASIDE', 'BLOCKQUOTE',
            'HEADER', 'FOOTER', 'NAV', 'DETAILS', 'SUMMARY'
        ];

        // 번역 대상이 될 수 있는 클래스나 속성들
        const validAttributes = [
            'article', 'content', 'text', 'description', 'body',
            'title', 'heading', 'paragraph', 'news', 'post',
            'story', 'message', 'comment'
        ];

        // BR 변 텍스트 처리
        const isBRContext = 
            parent.tagName === 'BR' || 
            Array.from(parent.childNodes).some(child => 
                child.nodeType === Node.ELEMENT_NODE && 
                (child as HTMLElement).tagName === 'BR'
            ) ||
            parent.previousSibling?.nodeType === Node.ELEMENT_NODE && 
            (parent.previousSibling as HTMLElement).tagName === 'BR' ||
            parent.nextSibling?.nodeType === Node.ELEMENT_NODE && 
            (parent.nextSibling as HTMLElement).tagName === 'BR';

        if (isBRContext) {
            return NodeFilter.FILTER_ACCEPT;
        }

        // 유효한 컨테이너 태그 체크
        if (validContainers.includes(parent.tagName)) {
            return NodeFilter.FILTER_ACCEPT;
        }

        // 유효한 속성이나 클래스 체크
        const classAndId = `${parent.className} ${parent.id}`.toLowerCase();
        if (validAttributes.some(attr => classAndId.includes(attr))) {
            return NodeFilter.FILTER_ACCEPT;
        }

        // 부모 요소들 중에 article이나 content 관련 요소가 있는지 체크
        const hasValidParent = parent.closest(validContainers.join(',')) !== null ||
            parent.closest('[class*="article"],[class*="content"],[class*="text"],[class*="body"]') !== null;

        if (hasValidParent) {
            return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_REJECT;
    }

    public disableFullMode(): void {
        this.isTranslating = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.periodicCheckInterval) {
            clearInterval(this.periodicCheckInterval);
            this.periodicCheckInterval = null;
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

        // 1. 이미 번역된 요소나 툴팁 체크
        if (parent.closest('.translation-inline-container') ||
            parent.closest('.word-tooltip') ||
            parent.closest('.word-tooltip-permanent') ||
            parent.closest('.word-highlight-full') ||
            parent.closest('.tooltip-content') ||
            parent.closest('form')) {  // form 전��를 제외
            return true;
        }

        // 2. form 관련 요소와 무시할 태그들 체크
        const ignoredTags = [
            'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE',
            'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
            'FIELDSET', 'LEGEND'
        ];

        let currentElement: HTMLElement | null = parent;
        while (currentElement) {
            if (ignoredTags.includes(currentElement.tagName)) {
                return true;
            }
            currentElement = currentElement.parentElement;
        }

        return this.shouldSkipElement(parent) || 
               parent.querySelector('.translation-inline-container') !== null;
    }

    private shouldSkipElement(element: HTMLElement): boolean {
        return element.tagName === 'SCRIPT' ||
            element.tagName === 'STYLE' ||
            element.tagName === 'NOSCRIPT' ||
            getComputedStyle(element).display === 'none' ||
            getComputedStyle(element).visibility === 'hidden';
    }

    private startPeriodicCheck(): void {
        if (this.periodicCheckInterval) {
            clearInterval(this.periodicCheckInterval);
        }

        const scanAndTranslate = () => {
            if (!this.isTranslating) return;

            // BR 태그 주변의 텍스트를 span으로 감싸서 처��
            const brElements = document.getElementsByTagName('br');
            for (let i = 0; i < brElements.length; i++) {
                const br = brElements[i];
                
                // 이전 텍스트 노드 처리
                if (br.previousSibling?.nodeType === Node.TEXT_NODE) {
                    const textNode = br.previousSibling as Text;
                    if (!this.shouldSkipTextNode(textNode)) {  // 필터링 추가
                        const text = textNode.textContent?.trim();
                        if (text && text.length > 1) {
                            const span = document.createElement('span');
                            span.textContent = text;
                            textNode.parentNode?.replaceChild(span, textNode);
                            this.processTextElement(span);
                        }
                    }
                }

                // 다음 텍스트 노드 처리
                if (br.nextSibling?.nodeType === Node.TEXT_NODE) {
                    const textNode = br.nextSibling as Text;
                    if (!this.shouldSkipTextNode(textNode)) {  // 필터링 추가
                        const text = textNode.textContent?.trim();
                        if (text && text.length > 1) {
                            const span = document.createElement('span');
                            span.textContent = text;
                            textNode.parentNode?.replaceChild(span, textNode);
                            this.processTextElement(span);
                        }
                    }
                }
            }

            // 나머지 일반 텍스트 노드 처리
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        if (this.shouldSkipTextNode(node as Text)) {  // shouldSkipTextNode 사용
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            const textNodes: Text[] = [];
            let node: Node | null;
            while ((node = walker.nextNode()) !== null) {
                textNodes.push(node as Text);
            }

            if (textNodes.length > 0) {
                this.translateBatch(textNodes, 0);
            }
        };

        // 초기 스캔
        scanAndTranslate();

        // 주기적으로 스캔
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
} 