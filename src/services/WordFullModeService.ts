import { TranslationService } from './TranslationService';
import { Logger } from '../logger';

const logger = Logger.getInstance();

export class WordFullModeService {
    private static instance: WordFullModeService | null = null;

    constructor(private translationService: TranslationService) {}

    public static getInstance(translationService: TranslationService): WordFullModeService {
    if (!WordFullModeService.instance) {
            WordFullModeService.instance = new WordFullModeService(translationService);
        }
        return WordFullModeService.instance;
    }

    public async applyWordFullMode(): Promise<void> {
        try {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;

                        // 제외할 요소들
                        if (parent.tagName === 'SCRIPT' || 
                            parent.tagName === 'STYLE' || 
                            parent.tagName === 'NOSCRIPT' ||
                            parent.closest('.word-translation-container') ||
                            parent.closest('.translation-tooltip') ||
                            parent.closest('.word-tooltip')) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        const text = node.textContent?.trim();
                        return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                }
            );

            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent || '';
                const words = text.match(/\b[A-Za-z]+\b|[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]+/g);
                if (!words) continue;

                const container = document.createElement('span');
                container.className = 'word-translation-container';
                container.style.cssText = `
                    display: inline;
                    position: relative;
                `;

                let currentPos = 0;
                const fragments: string[] = [];

                for (const word of words) {
                    const wordStart = text.indexOf(word, currentPos);
                    if (wordStart === -1) continue;

                    // 단어 앞의 텍스트 추가
                    if (wordStart > currentPos) {
                        fragments.push(text.substring(currentPos, wordStart));
                    }

                    // 단어 번역 및 래퍼 추가
                    const translation = await this.translationService.translateText(word);
                    fragments.push(`
                        <span class="word-with-translation">
                            ${word}
                            <span class="word-meaning" style="
                                position: absolute;
                                top: -20px;
                                left: 50%;
                                transform: translateX(-50%);
                                background-color: rgba(0, 0, 0, 0.8);
                                color: white;
                                padding: 2px 6px;
                                border-radius: 4px;
                                font-size: 12px;
                                white-space: nowrap;
                                display: none;
                            ">${translation}</span>
                        </span>
                    `);

                    currentPos = wordStart + word.length;
                }

                // 남은 텍스트 추가
                if (currentPos < text.length) {
                    fragments.push(text.substring(currentPos));
                }

                container.innerHTML = fragments.join('');

                // 마우스 오버 이벤트 추가
                container.querySelectorAll('.word-with-translation').forEach(wordEl => {
                    wordEl.addEventListener('mouseenter', () => {
                        const meaning = wordEl.querySelector('.word-meaning');
                        if (meaning) {
                            meaning.style.display = 'block';
                        }
                    });

                    wordEl.addEventListener('mouseleave', () => {
                        const meaning = wordEl.querySelector('.word-meaning');
                        if (meaning) {
                            meaning.style.display = 'none';
                        }
                    });
                });

                node.parentNode?.replaceChild(container, node);
            }
        } catch (error) {
            logger.log('wordFullMode', 'Error applying word full mode', error);
        }
    }

    public disableWordFullMode(): void {
        document.querySelectorAll('.word-translation-container').forEach(container => {
            const text = container.textContent;
            const textNode = document.createTextNode(text || '');
            container.parentNode?.replaceChild(textNode, container);
        });
    }
} 