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
        this.audioService = new AudioService(this.translationService);
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
            const prevAudioFeature = this.useAudioFeature;
            
            // 새 설정 적용
            this.usePanel = settings.usePanel;
            this.useTooltip = settings.useTooltip;
            this.useFullMode = settings.useFullMode;
            this.useAudioFeature = settings.useAudioFeature;
            this.useWordTooltip = settings.useWordTooltip;

            // 음성 기능 상태 변경 시
            if (this.useAudioFeature !== prevAudioFeature) {
                if (this.useAudioFeature) {
                    await this.audioService.initialize();
                    this.processTextElements();
                } else {
                    this.audioService.cleanup();
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
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent || 
                        parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE' || 
                        parent.tagName === 'NOSCRIPT' ||
                        parent.closest('.translation-audio-container') ||
                        getComputedStyle(parent).display === 'none') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    const text = node.textContent?.trim();
                    return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            const textNode = node as Text;
            const text = textNode.textContent?.trim();
            if (text) {
                this.audioService.addAudioButton(textNode.parentElement!, text);
            }
        }
    }

    private setupEventListeners(): void {
        let hoverTimer: number | null = null;
        let timerUI: HTMLElement | null = null;

        const createTimerUI = (x: number, y: number) => {
            timerUI = document.createElement('div');
            timerUI.className = 'audio-timer';
            timerUI.innerHTML = `
                <svg width="32" height="32" viewBox="0 0 32 32">
                    <!-- 배경 원 -->
                    <circle
                        cx="16"
                        cy="16"
                        r="15"
                        fill="rgba(0, 0, 0, 0.7)"
                        stroke="none"
                    />
                    <!-- 프로그레스 원 -->
                    <circle
                        cx="16"
                        cy="16"
                        r="14"
                        fill="none"
                        stroke="#4a9eff"
                        stroke-width="2"
                        stroke-dasharray="87.96459430051421"
                        stroke-dashoffset="87.96459430051421"
                        transform="rotate(-90 16 16)"
                    >
                        <animate
                            attributeName="stroke-dashoffset"
                            from="87.96459430051421"
                            to="0"
                            dur="2s"
                            fill="freeze"
                        />
                    </circle>
                    <!-- 음성 아이콘 -->
                    <path
                        d="M16 8 L12 12 L8 12 L8 20 L12 20 L16 24 L16 8z M20 12 Q22 16 20 20 M23 9 Q27 16 23 23"
                        fill="none"
                        stroke="#ffffff"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            `;
            timerUI.style.cssText = `
                position: fixed;
                left: ${x + 10}px;
                top: ${y + 10}px;
                z-index: 2147483647;
                pointer-events: none;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            `;
            document.body.appendChild(timerUI);
            return timerUI;
        };

        const handleMouseOver = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.translation-tooltip') || 
                target.closest('.translation-audio-container') ||
                target.closest('.translation-inline-container')) {
                return;
            }

            let textElement = this.findClosestTextElement(target);
            if (!textElement) return;

            // 2초 타이머 시작
            if (this.useAudioFeature) {
                if (!timerUI) {
                    timerUI = createTimerUI(e.clientX, e.clientY);
                }

                hoverTimer = window.setTimeout(async () => {
                    try {
                        const text = this.getElementText(textElement!, e);
                        if (text) {
                            const sourceLang = await this.translationService.detectLanguage(text);
                            logger.log('content', 'Playing audio', { text, lang: sourceLang });
                            await this.audioService.playText(text, sourceLang);
                        }
                    } catch (error) {
                        logger.log('content', 'Error playing audio', error);
                    } finally {
                        timerUI?.remove();
                        timerUI = null;
                    }
                }, 2000);
            }

            // 기존 툴팁 로직...
        };

        const handleMouseOut = () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            if (timerUI) {
                timerUI.remove();
                timerUI = null;
            }
        };

        document.body.addEventListener('mouseover', handleMouseOver, { passive: true });
        document.body.addEventListener('mouseout', handleMouseOut, { passive: true });
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
                    // 패널이 존재하지 않으면 계속 진행
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

    // 직접적인 텍스트 노드를 가지고 있는지 확인하는 헬퍼 메서드
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
        // BR 태그가 있는 경우 현재 마우스가 위치한 텍스트 블록만 반환
        if (element.querySelector('br') || element.tagName === 'BR') {
            const textBlocks: string[] = [];
            let currentBlock = '';

            // 각 노드를 순회하면서 BR 태그를 기준으로 텍스트 블록 분리
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent?.trim();
                    if (text) {
                        currentBlock += text + ' ';
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
                    if (currentBlock) {
                        textBlocks.push(currentBlock.trim());
                        currentBlock = '';
                    }
                }
            });

            if (currentBlock) {
                textBlocks.push(currentBlock.trim());
            }

            // 마우스 위치에 있는 텍스트 블록 찾기
            if (mouseEvent) {
                for (const block of textBlocks) {
                    const range = document.createRange();
                    const textNode = Array.from(element.childNodes).find(
                        node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes(block)
                    );

                    if (textNode) {
                        range.selectNodeContents(textNode);
                        const rect = range.getBoundingClientRect();
                        if (rect.top <= mouseEvent.clientY && mouseEvent.clientY <= rect.bottom) {
                            return block;
                        }
                    }
                }
            }

            // 모든 블록을 하나의 문자열로 합침
            return textBlocks.join(' ');
        }

        // 일반적인 텍스트 처리 - 모든 텍스트 노드의 내용을 합침
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent?.trim())
            .filter(text => text && text.length > 0)
            .join(' ');
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
                        if (!parent || 
                            parent.tagName === 'SCRIPT' || 
                            parent.tagName === 'STYLE' || 
                            parent.tagName === 'NOSCRIPT' ||
                            parent.closest('.translation-inline-container') || // 이미 처리된 요소 제외
                            getComputedStyle(parent).display === 'none' || 
                            getComputedStyle(parent).visibility === 'hidden') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        const text = node.textContent?.trim();
                        return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
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