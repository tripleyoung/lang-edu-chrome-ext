import { Logger } from '../logger';
import { TranslationService } from './TranslationService';
import { TranslationResponse } from '../types';

const logger = Logger.getInstance();

export class TooltipService {
    private static instance: TooltipService | null = null;
    private currentTooltip: HTMLElement | null = null;
    private currentElement: HTMLElement | null = null;
    private mouseLeaveHandler: ((e: MouseEvent) => void) | null = null;

    private constructor(private translationService: TranslationService) {
        window.addEventListener('scroll', () => this.removeTooltip(), { passive: true });
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!this.currentTooltip?.contains(target) && !this.currentElement?.contains(target)) {
                this.removeTooltip();
            }
        });

        // 페이지 언로드 시 정리
        window.addEventListener('unload', () => this.cleanup());
    }

    public static getInstance(translationService: TranslationService): TooltipService {
        if (!TooltipService.instance) {
            TooltipService.instance = new TooltipService(translationService);
        }
        return TooltipService.instance;
    }

    async showTooltip(element: HTMLElement, text: string): Promise<void> {
        try {
            // 전역적으로 다른 툴팁 제거
            document.querySelectorAll('.translation-tooltip').forEach(tooltip => {
                if (tooltip !== this.currentTooltip) {
                    tooltip.remove();
                }
            });

            if (this.currentElement === element) {
                return;
            }

            this.removeTooltip();
            this.currentElement = element;

            const cleanText = text.trim();
            if (!cleanText || cleanText.length <= 1) return;

            let translation = this.translationService.getCachedTranslation(cleanText);
            if (!translation) {
                const sourceLang = await this.translationService.detectLanguage(cleanText);
                const translatedText = await this.translationService.translateText(cleanText, sourceLang);
                translation = {
                    translation: translatedText,
                    grammar: '',
                    definition: '',
                    words: [],
                    idioms: []
                };
                this.translationService.setCachedTranslation(cleanText, translation);
            }

            if (cleanText.toLowerCase() === translation.translation.toLowerCase()) {
                return;
            }

            const tooltip = document.createElement('div');
            tooltip.className = 'translation-tooltip';
            tooltip.innerHTML = `<div class="tooltip-content" style="white-space: pre-line;">${translation.translation}</div>`;

            // 원본 요소의 너비를 가져옴
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

            // 위치 계산 및 표시
            const updateTooltipPosition = () => {
                const rect = element.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();
                
                // 화면 왼쪽 경계 체크
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

            this.mouseLeaveHandler = (e: MouseEvent) => {
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget || 
                    (!tooltip.contains(relatedTarget) && 
                     !element.contains(relatedTarget))) {
                    this.removeTooltip();
                }
            };

            element.addEventListener('mouseleave', this.mouseLeaveHandler);
            tooltip.addEventListener('mouseleave', this.mouseLeaveHandler);

            element.addEventListener('click', () => this.removeTooltip());
            tooltip.addEventListener('click', () => this.removeTooltip());

            this.currentTooltip = tooltip;

            logger.log('tooltip', 'Tooltip created');
        } catch (error) {
            logger.log('tooltip', 'Error showing tooltip', error);
            this.removeTooltip();
        }
    }

    private removeTooltip(): void {
        if (this.currentTooltip || this.currentElement) {
            if (this.currentTooltip) {
                this.currentTooltip.style.opacity = '0';
                setTimeout(() => {
                    this.currentTooltip?.remove();
                }, 150);
            }

            if (this.mouseLeaveHandler) {
                this.currentElement?.removeEventListener('mouseleave', this.mouseLeaveHandler);
                this.currentTooltip?.removeEventListener('mouseleave', this.mouseLeaveHandler);
                this.mouseLeaveHandler = null;
            }

            this.currentTooltip = null;
            this.currentElement = null;
        }
    }

    public cleanup(): void {
        this.removeTooltip();
    }
} 