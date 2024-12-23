import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    private isInitialized: boolean = false;

    constructor(private translationService: TranslationService) {}

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        this.isInitialized = true;
    }

    public cleanup(): void {
        this.isInitialized = false;
        document.querySelectorAll('.translation-audio-container').forEach(el => el.remove());
    }

    async playText(text: string, lang: string): Promise<void> {
        try {
            // 기존 음성 중지
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.getLangCode(lang);
            utterance.rate = 0.9;  // 속도 조절
            utterance.pitch = 1.0; // 음높이
            utterance.volume = 1.0; // 볼륨

            // 음성 목록에서 적절한 음성 선택
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.lang.startsWith(utterance.lang));
            if (voice) {
                utterance.voice = voice;
            }

            window.speechSynthesis.speak(utterance);

            // 음성 재생 완료 대기
            return new Promise((resolve) => {
                utterance.onend = () => resolve();
                utterance.onerror = () => resolve();
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
        button.innerHTML = '🔊';
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