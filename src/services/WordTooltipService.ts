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
            const targetLang = settings.nativeLanguage || 'ko';  // 번역될 언어 (기본값: 한국어)
            const sourceLang = settings.learningLanguage || 'en'; // 원본 언어 (기본값: 영어)

            let translation = '';

            try {
                // 1. 문맥에서 단어 번역 시도
                const contextTranslation = await this.translationService.translateText(context, sourceLang);
                const words = context.toLowerCase().split(/\s+/);
                const translations = contextTranslation.split(/\s+/);
                const wordIndex = words.indexOf(word.toLowerCase());

                if (wordIndex >= 0 && wordIndex < translations.length) {
                    // 문맥에서 찾은 번역
                    translation = translations[wordIndex];
                } else {
                    // 단어 자체 번역
                    translation = await this.translationService.translateText(word, sourceLang);
                }
            } catch (error) {
                // 번역 실패 시 단어 자체 번역 시도
                translation = await this.translationService.translateText(word, sourceLang);
            }

            // 2. 툴팁 생성 및 표시
            const tooltip = this.createTooltip(word, translation);
            const rect = element.getBoundingClientRect();
            
            // 툴팁 위치 계산 (단어 위에 중앙 정렬)
            tooltip.style.visibility = 'hidden';
            document.body.appendChild(tooltip);
            const tooltipRect = tooltip.getBoundingClientRect();
            
            const centerX = rect.left + (rect.width / 2);
            tooltip.style.left = `${centerX - (tooltipRect.width / 2) + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - tooltipRect.height - 8}px`;
            tooltip.style.visibility = 'visible';

            this.currentTooltips.push({
                element: tooltip,
                word,
                translation
            });

        } catch (error) {
            logger.log('wordTooltip', 'Error showing word tooltip', { word, error });
        } finally {
            this.isProcessing = false;
        }
    }

    private createTooltip(word: string, translation: string): HTMLElement {
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

        // 스타일 적용
        tooltip.style.cssText = `
            position: absolute;
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
                await this.audioService.playText(word, 'en');
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
} 