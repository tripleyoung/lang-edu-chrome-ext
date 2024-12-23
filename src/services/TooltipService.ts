import { Logger } from '../logger';
import { TranslationService } from './TranslationService';
import { TranslationResponse } from '../types';

const logger = Logger.getInstance();

export class TooltipService {
    constructor(private translationService: TranslationService) {}

    async showTooltip(element: HTMLElement, text: string): Promise<void> {
        try {
            if (element.closest('.translation-tooltip')) {
                return;
            }

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

            this.createTooltipElement(element, translation);
        } catch (error) {
            logger.log('tooltip', 'Error showing tooltip', error);
        }
    }

    private createTooltipElement(element: HTMLElement, translation: TranslationResponse): void {
        document.querySelectorAll('.translation-tooltip').forEach(tooltip => tooltip.remove());

        if (element.hasAttribute('data-has-tooltip')) return;

        const rect = element.getBoundingClientRect();

        const tooltipDiv = document.createElement('div');
        tooltipDiv.className = 'translation-tooltip';
        tooltipDiv.textContent = translation.translation;

        tooltipDiv.style.cssText = `
            position: fixed;
            left: ${rect.left + window.scrollX}px;
            top: ${rect.bottom + window.scrollY + 5}px;
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            z-index: 2147483647;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.4;
            max-width: 300px;
            white-space: pre-wrap;
            word-break: break-word;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(4px);
            transition: opacity 0.2s ease;
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
} 