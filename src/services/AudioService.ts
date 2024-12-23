import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    constructor(private translationService: TranslationService) {}

    async playText(text: string, lang: string): Promise<void> {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.getLangCode(lang);
        speechSynthesis.speak(utterance);
    }

    private getLangCode(lang: string): string {
        switch (lang) {
            case 'en': return 'en-US';
            case 'ko': return 'ko-KR';
            case 'ja': return 'ja-JP';
            default: return 'en-US';
        }
    }

    addAudioButton(element: HTMLElement, text: string): void {
        const button = document.createElement('button');
        button.className = 'translation-audio-button';
        button.innerHTML = '🔊';
        button.style.cssText = `
            position: absolute;
            right: -20px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #4a9eff;
            cursor: pointer;
            padding: 2px;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 1000;
            pointer-events: auto;
            display: inline-block;
            vertical-align: middle;
            margin-left: 4px;
        `;

        this.addAudioButtonListeners(button, text);
        element.appendChild(button);
    }

    private async addAudioButtonListeners(button: HTMLButtonElement, text: string): Promise<void> {
        const container = button.closest('.translation-audio-container');
        if (!container) return;

        container.addEventListener('mouseenter', () => button.style.opacity = '1');
        container.addEventListener('mouseleave', () => button.style.opacity = '0');

        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const sourceLang = await this.translationService.detectLanguage(text);
                const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
                const nativeLang = settings.nativeLanguage || 'ko';
                const learningLang = settings.learningLanguage || 'en';

                let textToSpeak = text;
                let langToUse = sourceLang;

                if (sourceLang === nativeLang) {
                    textToSpeak = await this.translationService.translateText(text, learningLang);
                    langToUse = learningLang;
                }

                await this.playText(textToSpeak, langToUse);
            } catch (error) {
                logger.log('audio', 'Error playing audio', error);
            }
        });
    }
} 