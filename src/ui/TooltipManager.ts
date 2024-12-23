import { TranslationResponse } from '../types';

export class TooltipManager {
    showTooltip(element: HTMLElement, text: string, translation: TranslationResponse): void {
        document.querySelectorAll('.translation-tooltip').forEach(tooltip => tooltip.remove());

        if (element.hasAttribute('data-has-tooltip')) return;

        const tooltipDiv = document.createElement('div');
        tooltipDiv.className = 'translation-tooltip';
        tooltipDiv.textContent = translation.translation;

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
} 