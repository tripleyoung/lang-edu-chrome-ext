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

    constructor() {
        if (TranslationExtension.instance) {
            return TranslationExtension.instance;
        }

        TranslationExtension.instance = this;

        // 서비스 초기화 순서 중요
        this.translationService = new TranslationService();
        this.tooltipService = new TooltipService(this.translationService);
        this.audioService = new AudioService(this.translationService);
        this.fullModeService = new FullModeService(this.translationService);

        this.initialize();
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

            // 설정 변경 리스너 추가
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
        document.body.addEventListener('mouseover', this.handleMouseOver);
    }

    private handleMouseOver = async (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const textElement = this.findClosestTextElement(target);
        if (!textElement) return;

        const text = this.getElementText(textElement);
        if (!text || text.length < 2) return;

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = window.setTimeout(async () => {
            try {
                // 단어 툴팁 모드
                if (this.useWordTooltip && /^[A-Za-z]+$/.test(text.trim())) {
                    await this.showWordTooltip(textElement, text.trim());
                    return;
                }

                // 일반 툴팁 모드
                if (this.useTooltip) {
                    await this.tooltipService.showTooltip(textElement, text);
                }

                // 음성 기능
                if (this.useAudioFeature) {
                    this.audioService.addAudioButton(textElement, text);
                }

                // 패널 기능
                if (this.usePanel || this.autoOpenPanel) {
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
                    await this.sendTranslationToPanel(text);
                }
            } catch (error) {
                logger.log('content', 'Error in mouseenter handler', error);
            }
        }, this.debounceTime);
    };

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

    private getElementText(element: HTMLElement): string {
        let text = '';
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const nodeText = node.textContent?.trim();
                if (nodeText) text += nodeText + ' ';
            }
        });
        return text.trim();
    }

    private findClosestTextElement(element: HTMLElement): HTMLElement | null {
        const excludeTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INPUT', 'SELECT', 'TEXTAREA'];
        
        let current: HTMLElement | null = element;
        while (current) {
            if (excludeTags.includes(current.tagName)) return null;
            if (current.classList?.contains('translation-tooltip')) return null;
            if (current.classList?.contains('translation-container')) return null;
            
            const text = this.getElementText(current);
            if (text && text.length > 0) return current;
            
            current = current.parentElement;
        }
        
        return null;
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

    // ... 나머지 메서드들 ...
}

// 초기화
        new TranslationExtension();