import { Logger } from '../logger';
import { TranslationService } from './TranslationService';
import { TranslationResponse } from '../types';

const logger = Logger.getInstance();

export class TooltipService {
    private static instance: TooltipService | null = null;
    private currentTooltip: HTMLElement | null = null;
    private currentElement: HTMLElement | null = null;
    private isProcessing: boolean = false;
    private tooltipDebounceTimer: number | null = null;
    private isEnabled: boolean = true;

    private constructor(private translationService: TranslationService) {
        window.addEventListener('scroll', () => this.removeTooltip(), { passive: true });
        window.addEventListener('unload', () => this.cleanup());
        
        // mouseover 이벤트 리스너 제거
        // document.addEventListener('mouseover', (e) => {
        //     const target = e.target as HTMLElement;
        //     if (this.currentTooltip && 
        //         !this.currentTooltip.contains(target) && 
        //         !this.currentElement?.contains(target) &&
        //         !target.closest('.translation-tooltip')) {
        //         this.removeTooltip();
        //     }
        // });
    }

    public static getInstance(translationService: TranslationService): TooltipService {
        if (!TooltipService.instance) {
            TooltipService.instance = new TooltipService(translationService);
        }
        return TooltipService.instance;
    }



    async showTooltip(element: HTMLElement, text: string): Promise<void> {
        try {
            // 이미 처리 중이면 무시
            if (this.isProcessing) return;
            
            // 같은 요소에 대한 툴팁이면 유지
            if (this.currentElement === element) return;

            try {
                this.isProcessing = true;

                // 디바운스 처리
                if (this.tooltipDebounceTimer) {
                    clearTimeout(this.tooltipDebounceTimer);
                }

                this.tooltipDebounceTimer = window.setTimeout(async () => {
                    this.removeTooltip();
                    
                    const cleanText = text.trim();
                    if (!cleanText || cleanText.length <= 1) return;

                    // 구두점으로 끝나는 문장들 찾기
                    const completeSentences = cleanText.match(/[^.!?]+[.!?]+/g) || [];
                    
                    // 마지막 문장이 구두점 없이 끝나는지 확인
                    const lastPart = cleanText.replace(/.*[.!?]\s*/g, '').trim();
                    
                    // 최종 문장 배열 구성
                    const sentences = lastPart ? [...completeSentences, lastPart] : completeSentences;

                    logger.log('tooltip', 'Split sentences', { 
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

                    // 처리 중에 다른 툴팁이 생성되었으면 중단
                    if (this.currentTooltip) return;

                    const tooltip = document.createElement('div');
                    tooltip.className = 'translation-tooltip translation-inline-container';
                    tooltip.innerHTML = `<div class="tooltip-content" style="white-space: pre-line;">${translations.join(' ')}</div>`;

                    const elementRect = element.getBoundingClientRect();
                    tooltip.style.cssText = `
                        position: fixed;
                        visibility: hidden;
                        background-color: rgba(0, 0, 0, 0.9);
                        color: white;
                        padding: 8px 12px;
                        border-radius: 4px;
                        z-index: 2147483647;
                        font-size: 14px;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        line-height: 1.4;
                        min-width: ${elementRect.width}px;
                        max-width: ${Math.max(elementRect.width, 300)}px;
                        white-space: pre-wrap;
                        word-break: break-word;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                        backdrop-filter: blur(4px);
                        pointer-events: auto;
                        user-select: text;
                        opacity: 0;
                        transition: opacity 0.15s ease-in-out;
                    `;

                    document.body.appendChild(tooltip);

                    const updateTooltipPosition = () => {
                        const rect = element.getBoundingClientRect();
                        const tooltipRect = tooltip.getBoundingClientRect();
                        
                        let left = rect.left;
                        if (left + tooltipRect.width > window.innerWidth) {
                            left = window.innerWidth - tooltipRect.width - 10;
                        }
                        
                        tooltip.style.left = `${left}px`;
                        tooltip.style.top = `${rect.bottom + 5}px`;
                        tooltip.style.visibility = 'visible';
                        requestAnimationFrame(() => {
                            tooltip.style.opacity = '1';
                        });
                    };

                    updateTooltipPosition();
                    
                    this.currentTooltip = tooltip;
                    this.currentElement = element;
                }, 200); // 200ms 디바운스

            } catch (error) {
                logger.log('tooltip', 'Error showing tooltip', error);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private removeTooltip(): void {
        if (this.tooltipDebounceTimer) {
            clearTimeout(this.tooltipDebounceTimer);
            this.tooltipDebounceTimer = null;
        }

        // 이전 툴팁이 있으면 즉시 제거
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
            this.currentElement = null;
        }
    }

    public cleanup(): void {
        this.removeTooltip();
    }

    public enable(): void {
        // 이벤트 리스너는 이미 setupEventListeners에서 설정되어 있으므로
        // 필요한 경우 추가 초기화만 수행
        this.isEnabled = true;
    }

    public disable(): void {
        this.isEnabled = false;
        document.querySelectorAll('.translation-tooltip').forEach(el => el.remove());
    }
} 