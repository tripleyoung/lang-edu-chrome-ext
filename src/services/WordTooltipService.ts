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

    private createTooltip(word: string, translation: string, sourceLang: string): HTMLElement {
        const tooltip = document.createElement('div');
        tooltip.className = 'word-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-content">
                <span class="translation">${translation}</span>
                <div class="tooltip-controls">
                    <button class="audio-button" title="Play pronunciation">
                        <svg width="14" height="14" viewBox="0 0 32 32">
                            <path d="M16 8 L12 12 L8 12 L8 20 L12 20 L16 24 L16 8z M20 12 Q22 16 20 20 M23 9 Q27 16 23 23"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="close-button" title="Close">×</button>
                </div>
            </div>
        `;

        // 스타일 적용 - position 제거 (showWordTooltip에서 설정)
        tooltip.style.cssText = `
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
            z-index: 2147483647;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            white-space: nowrap;
        `;

        // 컨텐츠 스타일
        const content = tooltip.querySelector('.tooltip-content') as HTMLElement;
        if (content) {
            content.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                flex-direction: row;
                white-space: nowrap;
            `;
        }

        // 컨트롤 스타일
        const controls = tooltip.querySelector('.tooltip-controls') as HTMLElement;
        if (controls) {
            controls.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                margin-left: 4px;
            `;
        }

        // 버튼 스타일
        tooltip.querySelectorAll('button').forEach(button => {
            button.style.cssText = `
                background: none;
                border: none;
                padding: 2px;
                cursor: pointer;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.7;
                transition: opacity 0.2s;
            `;
        });

        // 이벤트 리스너 추가
        const audioButton = tooltip.querySelector('.audio-button') as HTMLButtonElement;
        const closeButton = tooltip.querySelector('.close-button') as HTMLButtonElement;

        audioButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await this.audioService.playText(word, sourceLang);
            } catch (error) {
                logger.log('wordTooltip', 'Error playing audio', { word, error });
            }
        });

        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeTooltips();
        });

        return tooltip;
    }

    private removeTooltips(): void {
        this.currentTooltips.forEach(tooltip => {
            tooltip.element.remove();
        });
        this.currentTooltips = [];
    }

    public cleanup(): void {
        this.removeTooltips();
    }

    public disable(): void {
        document.querySelectorAll('.word-highlight, .word-tooltip').forEach(el => el.remove());
    }

    public enable(): void {
        // 활성화 로직
    }
} 