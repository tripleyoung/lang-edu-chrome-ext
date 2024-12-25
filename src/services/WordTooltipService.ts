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
    private checkInterval: number | null = null;
    private lastCheckedWord: string | null = null;
    private lastMousePosition = { x: 0, y: 0 };

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

            // element는 이미 오버레이 요청임
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
        this.useWordTooltip = false;
        
        // 주기적 체크 중지
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        // 마우스 위치 추적 중지
        document.removeEventListener('mousemove', this.updateMousePosition.bind(this));

        // 요소 제거
        document.querySelectorAll('.word-highlight').forEach(el => el.remove());
        document.querySelectorAll('.word-tooltip').forEach(el => el.remove());
        
        this.currentTooltips = [];
        this.lastCheckedWord = null;
    }

    public enable(): void {
        this.useWordTooltip = true;
        
        // AudioService 초기화
        this.audioService.initialize().catch(error => {
            logger.log('wordTooltip', 'Failed to initialize audio service', error);
        });

        // 마우스 위치 추적 시작
        document.addEventListener('mousemove', this.updateMousePosition.bind(this));
        
        // 주기적 체크 시작
        this.startChecking();

        logger.log('wordTooltip', 'Word tooltip service enabled');
    }

    private updateMousePosition(e: MouseEvent): void {
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
    }

    private startChecking(): void {
        if (this.checkInterval) return;

        this.checkInterval = window.setInterval(() => {
            if (!this.useWordTooltip) return;

            const elementFromPoint = document.elementFromPoint(
                this.lastMousePosition.x,
                this.lastMousePosition.y
            );

            if (!elementFromPoint) return;

            // NodeList를 Array로 변환
            const overlays = Array.from(document.querySelectorAll('.word-highlight'));
            for (const overlay of overlays) {
                const rect = overlay.getBoundingClientRect();
                if (this.lastMousePosition.x >= rect.left && 
                    this.lastMousePosition.x <= rect.right &&
                    this.lastMousePosition.y >= rect.top && 
                    this.lastMousePosition.y <= rect.bottom) {
                    
                    const word = overlay.getAttribute('data-word');
                    if (word && word !== this.lastCheckedWord) {
                        this.lastCheckedWord = word;
                        const context = this.getElementText(elementFromPoint as HTMLElement);
                        this.showWordTooltip(overlay as HTMLElement, word, context);
                    }
                    break;
                }
            }
        }, 100);
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
            // 이전 오버레이 제거
            document.querySelectorAll('.word-highlight').forEach(el => el.remove());

            // 마우스 포인터 아래의 텍스트 노드 찾기
            const elementFromPoint = document.elementFromPoint(event.clientX, event.clientY);
            if (!elementFromPoint) return null;

            // 텍스트 노드 찾기
            const textNode = Array.from(elementFromPoint.childNodes)
                .find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) as Text;

            if (!textNode) return null;

            const text = textNode.textContent || '';
            const words = text.split(/\s+/).filter(word => word.length > 0);
            const range = document.createRange();
            let hoveredWord = null;
            let hoveredOverlay = null;

            // 모든 단어에 오버레이 생성
            words.forEach(word => {
                const start = text.indexOf(word);
                range.setStart(textNode, start);
                range.setEnd(textNode, start + word.length);
                const rect = range.getBoundingClientRect();

                const overlay = this.createOverlay(rect);
                overlay.setAttribute('data-word', word);
                document.body.appendChild(overlay);

                // 현재 마우스 위치의 단어 확인
                if (event.clientX >= rect.left && event.clientX <= rect.right &&
                    event.clientY >= rect.top && event.clientY <= rect.bottom) {
                    hoveredWord = word;
                    hoveredOverlay = overlay;
                }
            });

            if (hoveredWord && hoveredOverlay) {
                return { word: hoveredWord, element: hoveredOverlay };
            }
        } catch (error) {
            logger.log('wordTooltip', 'Error in getWordAtPosition', error);
        }

        return null;
    }

    private getTextNodeAtPoint(x: number, y: number): { node: Text, offset: number } | null {
        const range = document.createRange();
        const textNodes: Text[] = [];
        
        // 모든 텍스트 노드 수집
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node as Text);
        }

        // 마우스 위치에 있는 텍스트 노드 찾기
        for (const textNode of textNodes) {
            range.selectNodeContents(textNode);
            const rects = range.getClientRects();
            
            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                if (x >= rect.left && x <= rect.right && 
                    y >= rect.top && y <= rect.bottom) {
                    
                    // 텍스트 노드 내에의 오프셋 계산
                    const offset = this.getOffsetAtPoint(textNode, x - rect.left);
                    return { node: textNode, offset };
                }
            }
        }

        return null;
    }

    private getOffsetAtPoint(node: Text, x: number): number {
        const range = document.createRange();
        const text = node.textContent || '';
        let low = 0;
        let high = text.length;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            range.setStart(node, 0);
            range.setEnd(node, mid);
            const rect = range.getBoundingClientRect();

            if (x > rect.width) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low;
    }

    private createOverlay(rect: DOMRect): HTMLElement {
        const overlay = document.createElement('span');
        overlay.className = 'word-highlight';
        overlay.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            background-color: rgba(255, 255, 0, 0.1);
            z-index: 2147483646;
            color: transparent;
            user-select: none;
            cursor: pointer;
            transition: background-color 0.2s;
        `;

        // 호버 효과 추가
        overlay.addEventListener('mouseenter', () => {
            overlay.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
        });

        overlay.addEventListener('mouseleave', () => {
            overlay.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
        });

        return overlay;
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