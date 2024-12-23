import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class FullModeService {
    constructor(private translationService: TranslationService) {}

    async applyFullMode(): Promise<void> {
        try {
            logger.log('fullMode', 'Starting full mode translation');
            
            this.removeExistingTranslations();
            await this.translateAllTextNodes();
            
            logger.log('fullMode', 'Full mode translation completed');
        } catch (error) {
            logger.log('fullMode', 'Error in full translation mode', error);
            throw error;
        }
    }

    disableFullMode(): void {
        this.removeExistingTranslations();
        logger.log('fullMode', 'Full mode disabled');
    }

    private removeExistingTranslations(): void {
        document.querySelectorAll('.translation-inline-container').forEach(container => {
            const originalText = container.querySelector('.original')?.textContent || '';
            const textNode = document.createTextNode(originalText);
            container.parentNode?.replaceChild(textNode, container);
        });
    }

    private async translateAllTextNodes(): Promise<void> {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => this.filterTextNode(node)
            }
        );

        const promises: Promise<void>[] = [];
        let node;
        let count = 0;

        while (node = walker.nextNode()) {
            const textNode = node as Text;
            const text = textNode.textContent?.trim() || '';
            if (!text) continue;

            promises.push(
                this.translateNode(textNode, text).then(() => {
                    count++;
                    return;
                })
            );
        }

        await Promise.all(promises);
        logger.log('fullMode', 'Translation completed', { translatedNodes: count });
    }

    private filterTextNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent || 
            parent.tagName === 'SCRIPT' || 
            parent.tagName === 'STYLE' || 
            parent.tagName === 'NOSCRIPT' ||
            parent.closest('.translation-inline-container') ||
            getComputedStyle(parent).display === 'none' || 
            getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent?.trim();
        return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }

    private async translateNode(textNode: Text, text: string): Promise<void> {
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
            }
        } catch (error) {
            logger.log('fullMode', 'Error translating text node', { text, error });
        }
    }
} 