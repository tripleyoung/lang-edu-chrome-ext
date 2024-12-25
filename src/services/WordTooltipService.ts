import { Logger } from '../logger';
import { TranslationService } from './TranslationService';
import { AudioService } from './AudioService';

const logger = Logger.getInstance();

interface WordTooltip {
    element: HTMLElement;
    word: string;
    translation: string;
}

export class WordTooltipService {
    private static instance: WordTooltipService | null = null;
    private currentTooltips: WordTooltip[] = [];
    private isProcessing: boolean = false;
    private useWordTooltip: boolean = false;

    private constructor(
        private translationService: TranslationService,
        private audioService: AudioService
    ) {}

    public static getInstance(
        translationService: TranslationService,
        audioService: AudioService
    ): WordTooltipService {
        if (!WordTooltipService.instance) {
            WordTooltipService.instance = new WordTooltipService(translationService, audioService);
        }
        return WordTooltipService.instance;
    }

    async showWordTooltip(element: HTMLElement, word: string, context: string): Promise<void> {
        try {
            if (this.isProcessing) return;
            this.isProcessing = true;

            // 기존 툴팁 제거
            this.removeTooltips();

            // 설정 가져오기
            const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
            const nativeLang = settings.nativeLanguage || 'ko';
            const learningLang = settings.learningLanguage || 'en';

            // 단어의 언어 감지
            const sourceLang = await this.translationService.detectLanguage(word);
            
            // 모국어인 경우 학습 언어로, 그 외의 경우 모국어로 번역
            const targetLang = sourceLang === nativeLang ? learningLang : nativeLang;
            
            // 단어 직접 번역 (문맥 번역 대신 단어 자체를 번역)
            const translation = await this.translationService.translateText(word, sourceLang);

            // 툴팁 생성 및 표시
            const tooltip = this.createTooltip(word, translation, sourceLang);
            tooltip.style.position = 'fixed';
            tooltip.style.visibility = 'hidden';
            document.body.appendChild(tooltip);

            // element는 이미 오버레이 요소임
            const overlayRect = element.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            // viewport 기준으로 위치 설정
            tooltip.style.left = `${overlayRect.left + (overlayRect.width / 2) - (tooltipRect.width / 2)}px`;
            tooltip.style.top = `${overlayRect.top - tooltipRect.height - 8}px`;
            tooltip.style.visibility = 'visible';

            this.currentTooltips.push({
                element: tooltip,
                word,
                translation
            });

        } catch (error) {
            logger.log('wordTooltip', 'Error showing word tooltip', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async playWordAudio(word: string, sourceLang: string): Promise<void> {
        try {
            // 설정 확인
            const settings = await chrome.storage.sync.get(['useAudioFeature', 'nativeLanguage', 'learningLanguage']);
            if (!settings.useAudioFeature) {
                logger.log('wordTooltip', 'Audio feature is disabled');
                return;
            }

            // AudioService 초기화 및 재생
            await this.audioService.enable();
            await this.audioService.initialize();
            
            // 원본 언어가 학습 언어면 그대로 재생, 아니면 번역 후 재생
            const learningLang = settings.learningLanguage || 'en';
            const nativeLang = settings.nativeLanguage || 'ko';
            
            if (sourceLang === learningLang) {
                await this.audioService.playText(word, learningLang);
            } else {
                // 학습 언어로 번역 후 재생
                const translation = await this.translationService.translateText(word, sourceLang);
                await this.audioService.playText(translation, learningLang);
            }
            
            logger.log('wordTooltip', 'Playing word audio', { 
                word, 
                sourceLang,
                targetLang: learningLang 
            });
        } catch (error) {
            logger.log('wordTooltip', 'Error playing word audio', { word, error });
        }
    }

    private createTooltip(word: string, translation: string, sourceLang: string): HTMLElement {
        const tooltip = document.createElement('div');
        tooltip.className = 'word-tooltip';
        
        // 버튼에 data-* 속성 추가
        tooltip.innerHTML = `
            <div class="tooltip-content" style="display: flex; align-items: center; gap: 4px;">
                <span class="translation" style="margin-right: 4px;">${translation}</span>
                <div class="tooltip-controls" style="display: flex; align-items: center;">
                    <button type="button" id="word-audio-btn" class="audio-button">
                        <svg width="16" height="16" viewBox="0 0 32 32" style="display: block;">
                            <circle cx="16" cy="16" r="14" fill="rgba(255,255,255,0.1)"/>
                            <path d="M16 8 L12 12 L8 12 L8 20 L12 20 L16 24 L16 8z M20 12 Q22 16 20 20 M23 9 Q27 16 23 23"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button type="button" id="word-close-btn" class="close-button" style="padding: 0 4px;">×</button>
                </div>
            </div>
        `;

        // 툴팁 스타일
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
            z-index: 2147483647;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            white-space: nowrap;
            pointer-events: all;
            user-select: none;
        `;

        // 버튼 스타일 적용
        const audioBtn = tooltip.querySelector('#word-audio-btn') as HTMLButtonElement;
        const closeBtn = tooltip.querySelector('#word-close-btn') as HTMLButtonElement;

        [audioBtn, closeBtn].forEach(btn => {
            if (!btn) return;
            btn.style.cssText = `
                background: none;
                border: none;
                padding: 4px;
                margin: 0;
                cursor: pointer !important;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
                transition: opacity 0.2s;
                pointer-events: all !important;
            `;
        });

        // 오디오 버튼 이벤트
        if (audioBtn) {
            logger.log('wordTooltip', 'Registering audio button event');
            
            audioBtn.addEventListener('mousedown', async (e) => {
                logger.log('wordTooltip', 'Audio button mousedown');
                e.preventDefault();
                e.stopPropagation();
                try {
                    await this.playWordAudio(word, sourceLang);
                    logger.log('wordTooltip', 'Audio playback completed');
                } catch (error) {
                    logger.log('wordTooltip', 'Audio playback error', error);
                }
            });
        }

        // 닫기 버튼 이벤트
        if (closeBtn) {
            logger.log('wordTooltip', 'Registering close button event');
            closeBtn.addEventListener('mousedown', (e) => {
                logger.log('wordTooltip', 'Close button mousedown');
                e.preventDefault();
                e.stopPropagation();
                this.removeTooltips();
            });
        }

        return tooltip;
    }

    private removeTooltips(): void {
        this.currentTooltips.forEach(tooltip => {
            // 이벤트 리스너 정리
            const audioBtn = tooltip.element.querySelector('#word-audio-btn') as HTMLButtonElement;
            const closeBtn = tooltip.element.querySelector('#word-close-btn') as HTMLButtonElement;
            
            if (audioBtn) {
                audioBtn.onclick = null;
                logger.log('wordTooltip', 'Audio button event removed');
            }
            
            if (closeBtn) {
                closeBtn.onclick = null;
                logger.log('wordTooltip', 'Close button event removed');
            }

            tooltip.element.remove();
        });
        this.currentTooltips = [];
    }

    public cleanup(): void {
        this.removeTooltips();
    }

    public disable(): void {
        // 기존 이벤트 리스너 정리
        this.currentTooltips.forEach(tooltip => {
            const audioBtn = tooltip.element.querySelector('#word-audio-btn') as HTMLButtonElement;
            const closeBtn = tooltip.element.querySelector('#word-close-btn') as HTMLButtonElement;
            
            if (audioBtn) audioBtn.onclick = null;
            if (closeBtn) closeBtn.onclick = null;
        });

        // 요소 제거
        document.querySelectorAll('.word-highlight').forEach(el => el.remove());
        document.querySelectorAll('.word-tooltip').forEach(el => el.remove());
        
        this.currentTooltips = [];
        this.useWordTooltip = false;  // 비활성화 상태 설정
    }

    public enable(): void {
        this.useWordTooltip = true;  // 활성화 상태 설정
        
        // AudioService 초기화
        this.audioService.initialize().catch(error => {
            logger.log('wordTooltip', 'Failed to initialize audio service', error);
        });

        // 문서 전체에 대해 이벤트 리스너 설정
        document.body.querySelectorAll('p, span, div').forEach(element => {
            this.setupWordTooltipListeners(element as HTMLElement);
        });

        // 새로 추가되는 요소들을 위한 MutationObserver 설정
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.setupWordTooltipListeners(node as HTMLElement);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        logger.log('wordTooltip', 'Word tooltip service enabled');
    }

    private setupWordTooltipListeners(element: HTMLElement): void {
        element.addEventListener('click', async (e) => {
            logger.log('wordTooltip', 'Element clicked, checking for word');
            
            if (!this.useWordTooltip) {
                logger.log('wordTooltip', 'Word tooltip is disabled');
                return;
            }
            
            const target = e.target as HTMLElement;
            // 툴팁 내부의 버튼 클릭은 무시
            if (target.tagName === 'BUTTON' || target.closest('button')) {
                logger.log('wordTooltip', 'Button clicked, skipping word tooltip logic');
                return;
            }

            // 툴팁 내부 클릭은 무시
            if (target.closest('.word-tooltip')) {
                logger.log('wordTooltip', 'Clicked inside tooltip, ignoring');
                return;
            }

            const clickedWord = this.getWordAtPosition(target, e);
            if (clickedWord) {
                logger.log('wordTooltip', 'Found word at position', { word: clickedWord.word });
                const context = this.getElementText(target);
                await this.showWordTooltip(clickedWord.element, clickedWord.word, context);
                e.stopPropagation();
            } else {
                logger.log('wordTooltip', 'No word found at click position');
            }
        });
    }

    public getWordAtPosition(element: HTMLElement, event: MouseEvent): { word: string, element: HTMLElement } | null {
        try {
            // 이전 오버레이만 제거 (툴팁은 유지)
            document.querySelectorAll('.word-highlight').forEach(el => el.remove());

            const text = element.textContent || '';
            const words = text.match(/\b\w+\b/g);
            if (!words) return null;

            const range = document.createRange();
            let pos = 0;

            for (const word of words) {
                const wordStart = text.indexOf(word, pos);
                if (wordStart === -1) continue;

                range.setStart(element.firstChild!, wordStart);
                range.setEnd(element.firstChild!, wordStart + word.length);

                const rect = range.getBoundingClientRect();
                if (event.clientX >= rect.left && event.clientX <= rect.right &&
                    event.clientY >= rect.top && event.clientY <= rect.bottom) {
                    
                    // 같은 단어에 대한 툴팁이 이미 있다면 오버레이만 업데이트
                    const existingTooltip = document.querySelector('.word-tooltip') as HTMLElement;
                    if (existingTooltip && existingTooltip.getAttribute('data-word') === word) {
                        const overlay = document.createElement('span');
                        overlay.className = 'word-highlight';
                        overlay.style.cssText = `
                            position: fixed;
                            left: ${rect.left}px;
                            top: ${rect.top}px;
                            width: ${rect.width}px;
                            height: ${rect.height}px;
                            background-color: rgba(255, 255, 0, 0.1);
                            pointer-events: none;
                            z-index: 2147483646;
                            color: transparent;
                            user-select: none;
                        `;
                        
                        document.body.appendChild(overlay);
                        return { word, element: overlay };
                    }

                    // 다른 단어로 호버했을 때만 이전 툴팁 제거
                    this.removeTooltips();
                    
                    const overlay = document.createElement('span');
                    overlay.className = 'word-highlight';
                    overlay.style.cssText = `
                        position: fixed;
                        left: ${rect.left}px;
                        top: ${rect.top}px;
                        width: ${rect.width}px;
                        height: ${rect.height}px;
                        background-color: rgba(255, 255, 0, 0.1);
                        pointer-events: none;
                        z-index: 2147483646;
                        color: transparent;
                        user-select: none;
                    `;
                    
                    document.body.appendChild(overlay);
                    return { word, element: overlay };
                }
                
                pos = wordStart + word.length;
            }
        } catch (error) {
            logger.log('wordTooltip', 'Error in getWordAtPosition', error);
        }

        return null;
    }

    private getElementText(element: HTMLElement): string {
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent?.trim())
            .filter(text => text && text.length > 0)
            .join(' ');
    }

    public setUseWordTooltip(value: boolean): void {
        this.useWordTooltip = value;
    }
} 