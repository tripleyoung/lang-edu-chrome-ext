import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    private isInitialized: boolean = false;

    constructor(private translationService: TranslationService) {}

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        // voices 珥덇린�솕瑜� 湲곕떎由�
        if (window.speechSynthesis.getVoices().length === 0) {
            await new Promise<void>(resolve => {
                window.speechSynthesis.onvoiceschanged = () => resolve();
            });
        }
        
        this.isInitialized = true;
    }

    public cleanup(): void {
        this.isInitialized = false;
        document.querySelectorAll('.translation-audio-container').forEach(el => el.remove());
    }

    async playText(text: string, lang: string): Promise<void> {
        try {
            // 湲곗〈 �쓬�꽦 以묒��
            window.speechSynthesis.cancel();

            // voices 濡쒕뵫 �솗�씤
            await this.initialize();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.getLangCode(lang);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // �쓬�꽦 �꽑�깮
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.lang.startsWith(utterance.lang));
            if (voice) {
                utterance.voice = voice;
            }

            // �쓬�꽦 �옱�깮 �떆�옉
            window.speechSynthesis.speak(utterance);

            // �옱�깮 �셿猷� ���湲�
            return new Promise((resolve) => {
                utterance.onend = () => resolve();
                utterance.onerror = () => {
                    logger.log('audio', 'Error playing audio');
                    resolve();
                };
            });
        } catch (error) {
            logger.log('audio', 'Error playing audio', error);
        }
    }

    private getLangCode(lang: string): string {
        switch (lang.toLowerCase()) {
            case 'en': return 'en-US';
            case 'ko': return 'ko-KR';
            case 'ja': return 'ja-JP';
            case 'zh': return 'zh-CN';
            default: return 'en-US';
        }
    }

    addAudioButton(element: HTMLElement, text: string): void {
        if (element.querySelector('.translation-audio-button') || 
            element.closest('.translation-audio-container')) {
            return;
        }

        const container = document.createElement('span');
        container.className = 'translation-audio-container';
        container.style.cssText = `
            position: relative;
            display: inline;
            margin-right: 24px;
        `;
        container.textContent = text;

        const button = document.createElement('button');
        button.className = 'translation-audio-button';
        button.innerHTML = '�윍�';
        button.style.cssText = `
            position: relative;
            display: inline-block;
            background: none;
            border: none;
            color: #4a9eff;
            cursor: pointer;
            padding: 2px 4px;
            margin-left: 4px;
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 1000;
            pointer-events: all;
            vertical-align: middle;
            line-height: 1;
        `;

        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        container.textContent = '';
        container.appendChild(textSpan);
        container.appendChild(button);

        element.parentNode?.replaceChild(container, element);
        this.addAudioButtonListeners(button, text);
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