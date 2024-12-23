import { TranslationResponse, ClaudeResponse, TextGroup, DictionaryEntry } from './types';
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
        extensionInstance.setReaderMode(message.enabled);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'UPDATE_TRANSLATION') {
        extensionInstance.sendTranslationToPanel(message.data.selectedText);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'UPDATE_SETTINGS') {
        extensionInstance.usePanel = message.settings.usePanel;
        extensionInstance.useTooltip = message.settings.useTooltip;
        extensionInstance.useFullMode = message.settings.useFullMode;
        extensionInstance.useAudioFeature = message.settings.useAudioFeature;
        
        if (message.settings.useFullMode) {
            extensionInstance.applyFullMode();
        }
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'PANEL_CREATED') {
        chrome.windows.get(message.windowId, (window) => {
            TranslationExtension.panelWindow = window;
            sendResponse({ success: true });
        });
        return true;
    }

    return true;
});

interface WordPhonetic {
    text?: string;
    audio?: string;
}

interface WordMeaning {
    partOfSpeech: string;
    definitions: Array<{
        definition: string;
        example?: string;
    }>;
}

class TranslationExtension {
    private static instance: TranslationExtension | null = null;
    public static panelWindow: chrome.windows.Window | null = null;
    
    private isEnabled: boolean = true;
    private isProcessing: boolean = false;
    private observer: MutationObserver | null = null;
    private processTimeout: number | null = null;
    private translationBar: HTMLDivElement | null = null;
    private debounceTimer: number | null = null;
    private isReaderMode: boolean = false;
    private eventListeners: Map<HTMLElement, Function> = new Map();  // 이벤트 리스너 저장용
    private fullPageContent: string = '';  // 전체 텍스트 저장용
    private showInTooltip: boolean = false;  // 추가
    public usePanel: boolean = true;
    public useTooltip: boolean = false;
    public useFullMode: boolean = false;
    public useAudioFeature: boolean = false;  // 추가
    private translationCache: Map<string, TranslationResponse> = new Map();  // 타입 수정
    private dictionaryCache: Map<string, any> = new Map();      // 사전 캐시
    private debounceTime: number = 300;  // 디바운스 시간 증가
    public autoOpenPanel: boolean = false;  // 자동 오픈 모드 추가
    public useWordTooltip: boolean = false;  // 단어 툴팁 모드 추가

    constructor() {
        if (TranslationExtension.instance) {
            return TranslationExtension.instance;
        }
        TranslationExtension.instance = this;
        extensionInstance = this;  // 전역 변수에 인스턴스 저장
        this.initialize();
        
        // 저장된 설정 불러오기
        chrome.storage.sync.get(['usePanel', 'useTooltip', 'useFullMode', 'autoOpenPanel', 'useWordTooltip'], (result) => {
            this.usePanel = result.usePanel ?? true;
            this.useTooltip = result.useTooltip ?? false;
            this.useFullMode = result.useFullMode ?? false;
            this.autoOpenPanel = result.autoOpenPanel ?? false;
            this.useWordTooltip = result.useWordTooltip ?? false;
            
            // 전체 모드가 활성화되어 있으면 즉시 적용
            if (this.useFullMode) {
                this.applyFullMode();
            }
            
            // 자동 픈 모드가 성화되어 있으면 패널 생성
            if (this.autoOpenPanel) {
                this.createTranslationBar();
            }
        });
    }

    private async initialize(): Promise<void> {
        console.log('Initializing translation extension...');
        
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

    private async fetchTranslationAndGrammar(text: string): Promise<TranslationResponse> {
        try {
            const sourceLang = await this.detectLanguage(text);
            const translation = await this.translateText(text, sourceLang);
            
            return {
                translation,
                grammar: '',
                definition: '',
                words: [],
                idioms: []
            };
        } catch (error) {
            logger.log('content', 'Translation API error', error);
            throw error;
        }
    }

    public processTextElements(): void {
        if (!this.isEnabled) return;

        // 설정 확인
        chrome.storage.sync.get(['useAudioFeature'], (result) => {
            if (!result.useAudioFeature) {
                // 음성 기능이 비활성화된 경우에만 버튼 제거
                document.querySelectorAll('.translation-audio-button').forEach(btn => btn.remove());
                return;
            }

            // 텍스트 요소들을 아서 음성 버튼 추가 (이미 버튼이 있는 경우 건너뛰기)
            const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th');
            textElements.forEach(element => {
                if (!element.querySelector('.translation-audio-button')) {  // 이미 버튼이 있으면 건너뛰기
                    const text = this.getElementText(element as HTMLElement);
                    if (text && text.length > 2) {
                        this.addAudioButton(element as HTMLElement, text);
                    }
                }
            });
        });

        // 기존의 이벤트 위임 코드 유지
        document.body.removeEventListener('mouseover', this.handleMouseOver);
        document.body.addEventListener('mouseover', this.handleMouseOver);
    }

    private async addAudioButton(element: HTMLElement, text: string): Promise<void> {
        if (element.querySelector('.translation-audio-button')) return;

        try {
            const sourceLang = await this.detectLanguage(text);
            const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
            const nativeLang = settings.nativeLanguage || 'ko';
            const learningLang = settings.learningLanguage || 'en';

            // 번역된 텍스트를 미리 가져와 캐시에 저장
            let translatedText = '';
            if (sourceLang === nativeLang) {
                translatedText = await this.translateText(text, learningLang);
                // 캐시에 저장
                this.translationCache.set(text, {
                    translation: translatedText,
                    grammar: '',
                    definition: '',
                    words: [],
                    idioms: []
                });
            }

            const button = document.createElement('button');
            button.className = 'translation-audio-button';
            button.innerHTML = '🔊';
            button.style.cssText = `
                background: none;
                border: none;
                color: #4a9eff;
                cursor: pointer;
                padding: 2px 6px;
                font-size: 14px;
                opacity: 0.7;
                transition: opacity 0.3s;
                vertical-align: middle;
                margin-left: 4px;
            `;

            button.addEventListener('mouseover', () => button.style.opacity = '1');
            button.addEventListener('mouseout', () => button.style.opacity = '0.7');

            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    let textToSpeak = text;
                    let langToUse = sourceLang;

                    if (sourceLang === nativeLang) {
                        // 캐시된 번역 확인
                        let translatedText = '';
                        const cached = this.translationCache.get(text);
                        if (cached) {
                            translatedText = cached.translation;
                        } else {
                            // 캐시에 없으면 새로 번역
                            translatedText = await this.translateText(text, learningLang);
                            // 번역 결과 캐시에 저장
                            this.translationCache.set(text, {
                                translation: translatedText,
                                grammar: '',
                                definition: '',
                                words: [],
                                idioms: []
                            });
                        }
                        textToSpeak = translatedText;
                        langToUse = learningLang;
                    }

                    const speechLang = langToUse === 'en' ? 'en-US' : 
                                      langToUse === 'ko' ? 'ko-KR' : 
                                      langToUse === 'ja' ? 'ja-JP' : 'en-US';

                    // 더 자세한 로그 추가
                    logger.log('content', 'Playing audio', { 
                        originalText: text,
                        translatedText: textToSpeak, 
                        originalLang: sourceLang,
                        targetLang: langToUse,
                        speechLang: speechLang,
                        isNative: sourceLang === nativeLang
                    });

                    const utterance = new SpeechSynthesisUtterance(textToSpeak);
                    utterance.lang = speechLang;
                    speechSynthesis.speak(utterance);
                } catch (error) {
                    logger.log('content', 'Error playing audio', error);
                }
            });

            element.appendChild(button);
        } catch (error) {
            logger.log('content', 'Error adding audio button', error);
        }
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
                    target.classList?.contains('translation-container')) {
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
            // 패널이 이미 존재하는지 확인
            if (TranslationExtension.panelWindow?.id) {
                try {
                    await chrome.windows.get(TranslationExtension.panelWindow.id);
                    return; // 패널이 존재하�� 리턴
                } catch {
                    // 패널이 존재하지 않으면 계속 진행
                }
            }

            // 새 패널 생성 요청
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

    // 패널 표시/숨김 메서드 추가
    private async showPanel(): Promise<void> {
        if (TranslationExtension.panelWindow?.id) {
            try {
                await chrome.windows.get(TranslationExtension.panelWindow.id);
                chrome.windows.update(TranslationExtension.panelWindow.id, { 
                    focused: true,
                    drawAttention: true 
                });
            } catch {
                // 창이 존재하지 않으면 다시 생성
                this.createTranslationBar();
            }
        }
    }

    private hidePanel(): void {
        // 마우스가 벗어날 때는 패널을 숨기지 않음
        // 사용자가 직접 닫거나 이지를 떠날 때만 닫힘
        return;
    }

    public async sendTranslationToPanel(text: string): Promise<void> {
        try {
            let translation = this.translationCache.get(text);
            if (!translation) {
                const sourceLang = await this.detectLanguage(text);
                const translatedText = await this.translateText(text, sourceLang);
                const words = await this.analyzeWords(text);
                
                translation = {
                    translation: translatedText,
                    grammar: '',
                    definition: '',
                    words,
                    idioms: []
                };
                this.translationCache.set(text, translation);
            }

            // 패널이 없으면 생성
            if (!TranslationExtension.panelWindow?.id) {
                await this.createTranslationBar();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 패널이 있는지 다시 확인
            if (TranslationExtension.panelWindow?.id) {
                await chrome.tabs.sendMessage(TranslationExtension.panelWindow.id, {
                    type: 'TRANSLATION_RESULT',
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

    public setReaderMode(enabled: boolean): void {
        this.isReaderMode = enabled;
        logger.log('content', `Reader mode ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            // 페이지 텍스트만 변경하고 번역 패널은 그대로 유지
            this.updatePageLayout();
        } else {
            // 페이지 새로고으로 원 상태로 복구
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

                // 원 텍스트 (왼)
                const originalDiv = document.createElement('div');
                originalDiv.textContent = originalText;
                originalDiv.style.cssText = `
                    color: ${originalStyles.color};
                    font-family: ${originalStyles.fontFamily};
                    font-weight: ${originalStyles.fontWeight};
                `;

                // 텍스트 (오른쪽)
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

    private async googleTranslate(text: string, targetLang: string): Promise<string> {
        try {
            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
            );
            const data = await response.json();
            return data[0][0][0];
        } catch (error) {
            logger.log('content', 'Google translation failed', error);
            throw error;
        }
    }

    public setTranslationDisplay(showInTooltip: boolean): void {
        this.showInTooltip = showInTooltip;
        
        // 모든 기존 이벤트 리스너 제거 후 다시 등록
        this.eventListeners.forEach((listener, element) => {
            element.removeEventListener('mouseenter', listener as any);
        });
        this.eventListeners.clear();
        
        // 텍스트 요소 시 처리
        this.processTextElements();
        logger.log('content', `Translation display mode set to ${showInTooltip ? 'tooltip' : 'panel'}`);
    }

    public async applyFullMode(): Promise<void> {
        try {
            // TreeWalker를 사용하여 모든 텍스트 노드를 찾음
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // 스크립트, 스타일, 숨겨진 요소 등은 제외
                        const parent = node.parentElement;
                        if (!parent || 
                            parent.tagName === 'SCRIPT' || 
                            parent.tagName === 'STYLE' || 
                            parent.tagName === 'NOSCRIPT' ||
                            parent.classList.contains('translation-container') ||
                            getComputedStyle(parent).display === 'none' || 
                            getComputedStyle(parent).visibility === 'hidden') {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // 의미 있는 텍스트만 선택
                        const text = node.textContent?.trim();
                        return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                }
            );

            let node;
            const translationPromises: Promise<void>[] = [];

            while (node = walker.nextNode()) {
                const textNode = node as Text;
                const originalText = textNode.textContent?.trim() || '';

                // 각 텍스트 노드에 대한 번역 작업을 Promise 배열에 추가
                translationPromises.push(
                    (async () => {
                        try {
                            const sourceLang = await this.detectLanguage(originalText);
                            const translation = await this.translateText(originalText, sourceLang);

                            // 원문과 번역이 같으면 건너뛰기
                            if (originalText.toLowerCase() === translation.toLowerCase()) {
                                return;
                            }

                            // 번역된 텍스트를 표시할 컨테이너 생성
                            const container = document.createElement('span');
                            container.className = 'translation-inline-container';
                            container.style.cssText = `
                                position: relative;
                                display: inline;
                            `;

                            // 원본 텍스트 span
                            const originalSpan = document.createElement('span');
                            originalSpan.textContent = originalText;
                            originalSpan.className = 'translation-original';

                            // 번역 텍스트 span
                            const translationSpan = document.createElement('span');
                            translationSpan.textContent = translation;
                            translationSpan.className = 'translation-text';
                            translationSpan.style.cssText = `
                                display: block;
                                color: #2196F3;
                                font-size: 0.9em;
                                margin-top: 2px;
                                font-style: italic;
                            `;

                            container.appendChild(originalSpan);
                            container.appendChild(translationSpan);

                            // 원본 텍스트 노드를 새로운 컨테이너로 교체
                            textNode.parentNode?.replaceChild(container, textNode);

                        } catch (error) {
                            logger.log('content', 'Translation failed for text node', {
                                text: originalText,
                                error
                            });
                        }
                    })()
                );
            }

            // 모든 번역 작업이 완료될 때까지 대기
            await Promise.all(translationPromises);
            logger.log('content', 'Full translation mode completed');

        } catch (error) {
            logger.log('content', 'Error in full translation mode', error);
        }
    }

    // 전체 번역 모드 해제 메서드 추가
    public disableFullMode(): void {
        // translation-inline-container 클래스를 가진 모든 요소를 찾아서
        // 원본 텍스트로 복원
        document.querySelectorAll('.translation-inline-container').forEach(container => {
            const originalText = container.querySelector('.translation-original')?.textContent || '';
            const textNode = document.createTextNode(originalText);
            container.parentNode?.replaceChild(textNode, container);
        });
        logger.log('content', 'Full translation mode disabled');
    }

    private async analyzeWords(text: string): Promise<TranslationResponse['words']> {
        // 텍스트를 단어로 리
        const words = text.match(/\b[A-Za-z]+\b/g) || [];
        const uniqueWords = [...new Set(words)];
        const results: TranslationResponse['words'] = [];

        // 각 단어에 대해 사전 색
        for (const word of uniqueWords) {
            try {
                const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
                if (!response.ok) continue;

                const data: DictionaryEntry[] = await response.json();
                if (!data.length) continue;

                const entry = data[0];
                results.push({
                    word: entry.word,
                    phonetic: entry.phonetics.find(p => p.text)?.text,
                    audioUrl: entry.phonetics.find(p => p.audio)?.audio,
                    meanings: entry.meanings.map(meaning => ({
                        partOfSpeech: meaning.partOfSpeech,
                        definitions: meaning.definitions,
                        synonyms: meaning.synonyms,
                        antonyms: meaning.antonyms
                    }))
                });
            } catch (error) {
                logger.log('content', `Failed to fetch dictionary data for word: ${word}`, error);
            }
        }

        return results;
    }

    // 텍스트 추출 함수
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

    // 툴팁 표시 함수
    private showTooltip(element: HTMLElement, text: string, translation: TranslationResponse): void {
        // 기존 툴팁들 모두 제거
        document.querySelectorAll('.translation-tooltip').forEach(tooltip => tooltip.remove());

        if (element.hasAttribute('data-has-tooltip')) {
            return;
        }

        const tooltipDiv = document.createElement('div');
        tooltipDiv.className = 'translation-tooltip';
        tooltipDiv.textContent = translation.translation;  // 번역된 텍스트만 표시

        // 툴팁 스타일 설정
        tooltipDiv.style.cssText = `
            position: absolute;
            left: ${element.getBoundingClientRect().left + window.scrollX}px;
            top: ${element.getBoundingClientRect().bottom + window.scrollY}px;
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px;
            border-radius: 4px;
            z-index: 2147483647;
            font-size: 14px;
        `;

        document.body.appendChild(tooltipDiv);
        element.setAttribute('data-has-tooltip', 'true');

        const removeTooltip = () => {
            tooltipDiv.remove();
            element.removeEventListener('mouseleave', removeTooltip);
            element.removeAttribute('data-has-tooltip');
        };

        element.addEventListener('mouseleave', removeTooltip);
    }

    // 패널 표시 최적화
    private async showTranslationPanel(text: string): Promise<void> {
        try {
            if (!TranslationExtension.panelWindow?.id) {
                await this.createTranslationBar();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            await this.sendTranslationToPanel(text);
        } catch (error) {
            logger.log('content', 'Error showing translation panel', error);
        }
    }

    // 이벤트 위임 핸더
    private handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // 텍스트 노드를 포함 가장 가까운 유효한 요소 찾기
        const textElement = this.findClosestTextElement(target);
        if (!textElement) return;

        const text = this.getElementText(textElement);
        if (!text || text.length < 2) return;

        this.mouseEnterHandler(textElement, text);
    };

    // 텍스트를 포함한 가장 가까운 유효한 소 찾기
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

    private mouseEnterHandler = async (element: HTMLElement, text: string) => {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = window.setTimeout(async () => {
            try {
                // 단어 툴팁 모드인 경우
                if (this.useWordTooltip && /^[A-Za-z]+$/.test(text.trim())) {
                    await this.showWordTooltip(element, text.trim());
                    return;
                }

                // 패널이 없으면 먼저 생성
                if (!TranslationExtension.panelWindow?.id) {
                    await this.createTranslationBar();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                let translation = this.translationCache.get(text);
                if (!translation) {
                    const sourceLang = await this.detectLanguage(text);
                    const translatedText = await this.translateText(text, sourceLang);
                    translation = {
                        translation: translatedText,
                        grammar: '',
                        definition: '',
                        words: [],
                        idioms: []
                    };
                    this.translationCache.set(text, translation);
                }

                if (this.useTooltip) {
                    this.showTooltip(element, text, translation);
                }

                if (this.useAudioFeature) {
                    this.addAudioButton(element, text);
                }
                
                if (this.usePanel || this.autoOpenPanel) {
                    await this.sendTranslationToPanel(text);
                }
            } catch (error) {
                logger.log('content', 'Error in mouseenter handler', error);
            }
        }, this.debounceTime);
    };

    private async translateText(text: string, sourceLang: string): Promise<string> {
        try {
            const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
            const nativeLang = settings.nativeLanguage || 'ko';
            const learningLang = settings.learningLanguage || 'en';

            // 원본 텍스트의 언어가 학습 언어와 같으면 모국어로 번역
            // 그렇지 않으면 학습 언어로 번역
            const targetLang = sourceLang === learningLang ? nativeLang : learningLang;

            const translation = await this.googleTranslate(text, targetLang);
            return translation;
        } catch (error) {
            logger.log('content', 'Translation error', error);
            return text;
        }
    }

    private async detectLanguage(text: string): Promise<string> {
        try {
            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`
            );
            const data = await response.json();
            return data[2] || 'en';
        } catch (error) {
            return 'en';
        }
    }

    private async showWordTooltip(element: HTMLElement, word: string): Promise<void> {
        try {
            logger.log('content', 'Attempting to show word tooltip', { word });

            // 패널이 없으면 먼저 생성
            if (!TranslationExtension.panelWindow?.id) {
                await this.createTranslationBar();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 캐시된 단어 정보 확인
            let wordInfo = this.dictionaryCache.get(word.toLowerCase());
            
            if (!wordInfo) {
                logger.log('content', 'Fetching word info from API', { word });
                // 사전 API 호출
                const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
                if (!response.ok) {
                    logger.log('content', 'API request failed', { word, status: response.status });
                    return;
                }
                
                const data = await response.json();
                if (!data.length) return;
                
                wordInfo = data[0];
                this.dictionaryCache.set(word.toLowerCase(), wordInfo);
            }

            // 패널로 단어 정보 전송
            if (TranslationExtension.panelWindow?.id) {
                const wordData = {
                    word: word,
                    phonetic: wordInfo.phonetics.find((p: WordPhonetic) => p.text)?.text || '',
                    audioUrl: wordInfo.phonetics.find((p: WordPhonetic) => p.audio)?.audio || '',
                    meanings: wordInfo.meanings.map((meaning: WordMeaning) => ({
                        partOfSpeech: meaning.partOfSpeech,
                        definitions: meaning.definitions.slice(0, 3),
                        examples: meaning.definitions
                            .filter(def => def.example)
                            .map(def => def.example)
                            .slice(0, 2)
                    }))
                };

                logger.log('content', 'Sending word info to panel', { wordData });
                chrome.runtime.sendMessage({
                    type: 'SEND_WORD_INFO',
                    data: wordData
                });
            }
        } catch (error) {
            logger.log('content', 'Error showing word tooltip', { word, error });
        }
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