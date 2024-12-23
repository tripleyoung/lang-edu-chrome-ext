import { Logger } from './logger';
import { TranslationService } from './services/TranslationService';
import { AudioService } from './services/AudioService';
import { TooltipService } from './services/TooltipService';
import { FullModeService } from './services/FullModeService';

const logger = Logger.getInstance();

export class TranslationExtension {
    private static instance: TranslationExtension | null = null;
    public static panelWindow: chrome.windows.Window | null = null;
    
    private translationService!: TranslationService;
    private audioService!: AudioService;
    private tooltipService!: TooltipService;
    private fullModeService!: FullModeService;
    
    private isEnabled: boolean = true;
    private debounceTimer: number | null = null;
    private debounceTime: number = 300;
    public usePanel: boolean = true;
    public useTooltip: boolean = false;
    public useFullMode: boolean = false;
    public useAudioFeature: boolean = false;
    public useWordTooltip: boolean = false;
    public autoOpenPanel: boolean = false;
    private isProcessing: boolean = false;
    private cleanupHandlers: Set<() => void> = new Set();
    private processingElement: HTMLElement | null = null;
    private lastProcessedTime: number = 0;
    private readonly PROCESS_DELAY = 500;

    constructor() {
        if (TranslationExtension.instance) {
            return TranslationExtension.instance;
        }

        TranslationExtension.instance = this;

        // 서비스 초기화 순서 중요
        this.translationService = new TranslationService();
        this.tooltipService = TooltipService.getInstance(this.translationService);
        this.audioService = AudioService.getInstance(this.translationService);
        this.fullModeService = new FullModeService(this.translationService);

        this.initialize();

        // 페이지 언로드 시 클린업
        window.addEventListener('unload', () => this.cleanup());
    }
        
    private async initialize(): Promise<void> {
        try {
            // 저장된 설정 불러오기
            const settings = await chrome.storage.sync.get([
                'usePanel',
                'useTooltip',
                'useFullMode',
                'useAudioFeature',
                'useWordTooltip',
                'autoOpenPanel'
            ]);

            this.usePanel = settings.usePanel ?? true;
            this.useTooltip = settings.useTooltip ?? false;
            this.useFullMode = settings.useFullMode ?? false;
            this.useAudioFeature = settings.useAudioFeature ?? false;
            this.useWordTooltip = settings.useWordTooltip ?? false;
            this.autoOpenPanel = settings.autoOpenPanel ?? false;

            // 이벤트 리스너 설정
            this.setupEventListeners();

            // 설정 변경 리스너 가
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'UPDATE_SETTINGS') {
                    // 비동기 처리를 위해 Promise를 반환
                    Promise.resolve().then(async () => {
                        try {
                            await this.updateSettings(message.settings);
                            sendResponse({ success: true });
                        } catch (error) {
                            logger.log('content', 'Error updating settings', error);
                            sendResponse({ success: false });
                        }
                    });
                    return true; // 비동기 응답을 위해 true 반환
                }
                return true;
            });

            // 기능 초기화
            if (this.useFullMode) {
                await this.fullModeService.applyFullMode();
            }
            if (this.autoOpenPanel) {
                await this.createTranslationBar();
            }
            if (this.useAudioFeature) {
                this.processTextElements();
            }

            logger.log('content', 'Extension initialized with settings', settings);
        } catch (error) {
            logger.log('content', 'Error initializing extension', error);
        }
    }

    private async updateSettings(settings: any): Promise<void> {
        try {
            logger.log('content', 'Updating settings', settings);

            const prevAudioFeature = this.useAudioFeature;
            const prevFullMode = this.useFullMode;

            // 새 설정 적용
            this.usePanel = settings.usePanel;
            this.useTooltip = settings.useTooltip;
            this.useFullMode = settings.useFullMode;
            this.useAudioFeature = settings.useAudioFeature;
            this.useWordTooltip = settings.useWordTooltip;

            // 전체 번역 모드 상태 변경 시
            if (this.useFullMode !== prevFullMode) {
                if (this.useFullMode) {
                    await this.fullModeService.applyFullMode();
                    // 전체 모드 적용 후 음성 기능이 활성화되어 있으면 음성 아이콘 추가
                    if (this.useAudioFeature) {
                        setTimeout(() => this.processTextElements(), 1000);
                    }
                } else {
                    this.fullModeService.disableFullMode();
                }
            }

            // 음성 기능 상태 변경 시
            if (this.useAudioFeature !== prevAudioFeature) {
                if (this.useAudioFeature) {
                    this.processTextElements();
                } else {
                    document.querySelectorAll('.translation-audio-container').forEach(container => {
                        const text = container.textContent;
                        const textNode = document.createTextNode(text || '');
                        container.parentNode?.replaceChild(textNode, container);
                    });
                }
            }

            logger.log('content', 'Settings updated successfully');
        } catch (error) {
            logger.log('content', 'Error updating settings', error);
        }
    }

    private processTextElements(): void {
        logger.log('content', 'Starting text elements processing', {
            useFullMode: this.useFullMode,
            useAudioFeature: this.useAudioFeature
        });
        
        // 전체 모드일 때는 original 텍스트에 직접 음성 아이콘 추가
        if (this.useFullMode) {
            const originals = document.querySelectorAll('.translation-inline-container .original');
            logger.log('content', 'Found original elements in full mode', {
                count: originals.length
            });

            originals.forEach(original => {
                if (original instanceof HTMLElement && original.textContent) {
                    logger.log('content', 'Adding audio button to original', {
                        text: original.textContent.substring(0, 50),
                        hasAudioButton: original.querySelector('.translation-audio-button') !== null
                    });
                    this.audioService.addAudioButtonToElement(original, original.textContent);
                }
            });
            return;
        }
        
        // 일반 모드일 때 기존 로직 실행
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    let text = node.textContent?.trim();

                    // 부모 요소의 모든 상위 요소 확인
                    const hasHiddenParent = parent?.closest('[style*="display: none"]');
                    
                    if (!parent) {
                        logger.log('content', 'Rejected: No parent element', { text });
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    if (parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE' || 
                        parent.tagName === 'NOSCRIPT') {
                        logger.log('content', 'Rejected: Script/Style tag', { tag: parent.tagName, text });
                        return NodeFilter.FILTER_REJECT;
                    }

                    // 전체 모드에서는 original 클래스를 가진 요소의 텍스트를 사용
                    const inlineContainer = parent.closest('.translation-inline-container');
                    if (inlineContainer) {
                        const originalText = inlineContainer.querySelector('.original')?.textContent;
                        if (originalText) {
                            text = originalText;
                        }
                    }
                    
                    if (parent.closest('.translation-audio-container')) {
                        logger.log('content', 'Rejected: Already processed', { text });
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // display: none 체크 개선
                    if (hasHiddenParent || getComputedStyle(parent).display === 'none') {
                        logger.log('content', 'Rejected: Hidden element', { text });
                        return NodeFilter.FILTER_REJECT;
                    }

                    // 텍스트가 비어있거나 공백만 있는 경우 제외
                    if (!text || text.length <= 1 || /^\s*$/.test(text)) {
                        logger.log('content', 'Rejected: Too short or empty', { text });
                        return NodeFilter.FILTER_REJECT;
                    }

                    logger.log('content', 'Accepted text node', { 
                        text,
                        parentTag: parent.tagName,
                        parentClass: parent.className
                    });
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let count = 0;
        let node;
        while (node = walker.nextNode()) {
            const textNode = node as Text;
            const text = textNode.textContent?.trim();
            if (text) {
                this.audioService.addAudioButton(textNode.parentElement!, text);
                count++;
            }
        }

        logger.log('content', 'Finished processing text elements', { processedCount: count });
    }

    private setupEventListeners(): void {
        // 디바운스된 processTextElements 함수 생성
        let processTimeout: number | null = null;
        const debouncedProcessElements = () => {
            if (processTimeout) {
                clearTimeout(processTimeout);
            }
            processTimeout = window.setTimeout(() => {
                if (this.useAudioFeature) {
                    this.processTextElements();
                }
            }, 1000);
        };

        // 초기 실행
        if (this.useAudioFeature) {
            this.processTextElements();
        }

        const handleMouseOver = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // 이미 처리된 요소는 건너뛰기
            if (target.closest('.translation-tooltip') || 
                target.closest('.translation-audio-container') ||
                target.closest('.translation-inline-container')) {
                return;
            }

            // 텍스트 요소 찾기 (수정된 부분)
            let textElement: HTMLElement | null = null;
            
            // 1. 직접 텍스트를 가진 요소인 경우
            if (this.hasDirectText(target)) {
                textElement = target;
            } 
            // 2. P 태그인 경우 특별 처리
            else if (target.tagName === 'P') {
                textElement = target;
            }
            // 3. 그 외의 경우 가장 가까운 텍스트 요소 찾기
            else {
                textElement = this.findClosestTextElement(target);
            }

            if (!textElement) return;

            // 디바운스 처리
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = window.setTimeout(async () => {
                try {
                    const text = this.getElementText(textElement!, e);
                    if (!text || text.length < 2) return;

                    // 음성 재생 모드
                    if (this.useAudioFeature) {
                        this.audioService.startHoverTimer(textElement!, text);
                    }

                    // 단어 툴팁 모드
                    if (this.useWordTooltip && /^[A-Za-z]+$/.test(text.trim())) {
                        await this.showWordTooltip(textElement!, text.trim());
                        return;
                    }

                    // 일반 툴팁 모드
                    if (this.useTooltip) {
                        await this.tooltipService.showTooltip(textElement!, text);
                    }

                    // 패널 리
                    // if (this.usePanel || this.autoOpenPanel) {
                    //     await this.sendTranslationToPanel(text);
                    // }
                } catch (error) {
                    logger.log('content', 'Error in mouseenter handler', error);
                }
            }, this.debounceTime);
        };

        // 이벤트 리스너 등록 (캡처링 페이즈 사용)
        document.body.addEventListener('mouseover', handleMouseOver, { 
            passive: true,
            capture: true
        });

        // 클린업 핸들러
        this.cleanupHandlers.add(() => {
            document.body.removeEventListener('mouseover', handleMouseOver, { capture: true });
        });
    }

    private cleanup(): void {
        this.isProcessing = false;
        this.processingElement = null;
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        document.querySelectorAll('.translation-tooltip').forEach(el => el.remove());
        this.cleanupHandlers.forEach(handler => handler());
        this.cleanupHandlers.clear();
    }

    // 대상 요소 유효성 검사를 위한 헬퍼 메서드
    private isValidTarget(target: HTMLElement): boolean {
        return !(
            target.closest('.translation-tooltip') || 
            target.hasAttribute('data-has-tooltip') ||
            target.closest('.translation-audio-container') ||
            target.closest('.translation-inline-container')
        );
    }

    private async createTranslationBar(): Promise<void> {
        try {
            if (TranslationExtension.panelWindow?.id) {
                try {
                    await chrome.windows.get(TranslationExtension.panelWindow.id);
                    return;
                } catch {
                    // 패이 존재하지 않으면 계속 진행
                }
            }

            await new Promise<void>((resolve) => {
                chrome.runtime.sendMessage({ type: 'OPEN_TRANSLATION_PANEL' }, (response) => {
                    if (response?.success) {
                        logger.log('content', 'Translation panel opened successfully');
                    } else {
                        logger.log('content', 'Failed to open translation panel');
                    }
                    resolve();
                });
            });
        } catch (error) {
            logger.log('content', 'Error creating translation panel', error);
        }
    }

    private async sendTranslationToPanel(text: string): Promise<void> {
        try {
            let translation = this.translationService.getCachedTranslation(text);
            if (!translation) {
                const sourceLang = await this.translationService.detectLanguage(text);
                const translatedText = await this.translationService.translateText(text, sourceLang);
                translation = {
                    translation: translatedText,
                    grammar: '',
                    definition: '',
                    words: [],
                    idioms: []
                };
                this.translationService.setCachedTranslation(text, translation);
            }

            if (!TranslationExtension.panelWindow?.id) {
                await this.createTranslationBar();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (TranslationExtension.panelWindow?.id) {
                chrome.runtime.sendMessage({
                    type: 'SEND_TO_PANEL',
                    data: { text, ...translation }
                });
                logger.log('content', 'Translation sent to panel', { text, translation });
            } else {
                logger.log('content', 'Panel window not found');
            }
        } catch (error) {
            logger.log('content', 'Failed to send translation to panel', error);
        }
    }

    private async showWordTooltip(element: HTMLElement, word: string): Promise<void> {
        try {
            logger.log('content', 'Attempting to show word tooltip', { word });

            if (!TranslationExtension.panelWindow?.id) {
                await this.createTranslationBar();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const wordInfo = await this.getDictionaryInfo(word);
            if (wordInfo && TranslationExtension.panelWindow?.id) {
                chrome.runtime.sendMessage({
                    type: 'SEND_WORD_INFO',
                    data: wordInfo
                });
            }
        } catch (error) {
            logger.log('content', 'Error showing word tooltip', { word, error });
        }
    }

    private async getDictionaryInfo(word: string): Promise<any> {
        try {
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
            if (!response.ok) return null;
            
            const data = await response.json();
            if (!data.length) return null;

            const entry = data[0];
            return {
                word: entry.word,
                phonetic: entry.phonetics.find((p: any) => p.text)?.text || '',
                audioUrl: entry.phonetics.find((p: any) => p.audio)?.audio || '',
                meanings: entry.meanings.map((meaning: any) => ({
                    partOfSpeech: meaning.partOfSpeech,
                    definitions: meaning.definitions.slice(0, 3),
                    examples: meaning.definitions
                        .filter((def: any) => def.example)
                        .map((def: any) => def.example)
                        .slice(0, 2)
                }))
            };
        } catch (error) {
            logger.log('content', 'Error fetching dictionary info', error);
            return null;
        }
    }

    private findClosestTextElement(element: HTMLElement): HTMLElement | null {
        const excludeTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INPUT', 'SELECT', 'TEXTAREA'];
        
        // BR 태그가 있는 경우 부모 요소를 반환
        if (element.querySelector('br') || element.tagName === 'BR') {
            const parent = element.parentElement;
            if (parent && !excludeTags.includes(parent.tagName)) {
                return parent;
            }
        }

        // 현재 요소가 직접 텍스트를 포함하고 있는지 확인
        if (this.hasDirectText(element) && !excludeTags.includes(element.tagName)) {
            return element;
        }

        // 부모 요소들을 순회하면서 텍스트를 포함한 가장 가까운 요소 찾기
        let current: HTMLElement | null = element;
        while (current) {
            if (excludeTags.includes(current.tagName)) return null;
            if (current.classList?.contains('translation-tooltip')) return null;
            if (current.classList?.contains('translation-container')) return null;

            if (this.hasDirectText(current)) {
                return current;
            }

            current = current.parentElement;
        }
        
        return null;
    }

    // 직접인 텍스트 노드를 가지고 있는지 확인하는 헬퍼 메서드
    private hasDirectText(element: HTMLElement): boolean {
        let hasText = false;
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                if (text && text.length > 0) {
                    hasText = true;
                    break;
                }
            }
        }
        return hasText;
    }

    private getElementText(element: HTMLElement, mouseEvent?: MouseEvent): string {
        logger.log('content', 'Getting element text input', { 
            element: element.tagName,
            fullText: element.textContent,
            mouseEvent: !!mouseEvent
        });

        // 전체 텍스트 내용 가져오기
        const fullText = element.textContent || '';
        return fullText.trim();
    }

    public async applyFullMode(): Promise<void> {
        try {
            logger.log('content', 'Starting full mode translation');
            
            // 기존 번역 제거
            document.querySelectorAll('.translation-inline-container').forEach(container => {
                const originalText = container.querySelector('.original')?.textContent || '';
                const textNode = document.createTextNode(originalText);
                container.parentNode?.replaceChild(textNode, container);
            });

            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;

                        try {
                            // 제외할 조건들 체크
                            if (parent.tagName === 'SCRIPT' || 
                                parent.tagName === 'STYLE' || 
                                parent.tagName === 'NOSCRIPT' ||
                                parent.closest('.translation-inline-container')) {
                                return NodeFilter.FILTER_REJECT;
                            }

                            // 요소가 문서에 실제로 존재하는지 확인
                            if (!document.contains(parent)) {
                                return NodeFilter.FILTER_REJECT;
                            }

                            // 숨겨진 요소 체크
                            const style = window.getComputedStyle(parent);
                            if (style.display === 'none' || style.visibility === 'hidden') {
                                return NodeFilter.FILTER_REJECT;
                            }

                            const text = node.textContent?.trim();
                            return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                        } catch (error) {
                            logger.log('fullMode', 'Error in acceptNode', { error });
                            return NodeFilter.FILTER_REJECT;
                        }
                    }
                }
            );

            logger.log('content', 'Walking through text nodes');
            let node;
            let count = 0;
            const promises: Promise<void>[] = [];

            while (node = walker.nextNode()) {
                const textNode = node as Text;
                const text = textNode.textContent?.trim() || '';
                if (!text) continue;

                promises.push((async () => {
                    try {
                        const sourceLang = await this.translationService.detectLanguage(text);
                        const translation = await this.translationService.translateText(text, sourceLang);
                        
                        if (text.toLowerCase() === translation.toLowerCase()) return;

                        const container = document.createElement('span');
                        container.className = 'translation-inline-container';
                        container.innerHTML = `
                            <span class="original">${text}</span>
                            <span class="translation" style="color: #2196F3; font-size: 0.9em; display: block;">${translation}</span>
                        `;
                        if (textNode.parentNode) {
                            textNode.parentNode.replaceChild(container, textNode);
                            count++;
                        }
                    } catch (error) {
                        logger.log('content', 'Error translating text node', { text, error });
                    }
                })());
            }

            await Promise.all(promises);
            logger.log('content', 'Full mode translation completed', { translatedNodes: count });
        } catch (error) {
            logger.log('content', 'Error in full translation mode', error);
            throw error;
        }
    }
}

// 초기화
        new TranslationExtension();