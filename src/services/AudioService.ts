import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    private isInitialized: boolean = false;
    private hoverTimer: number | null = null;
    private readonly HOVER_DELAY = 2000; // 2초 딜레이
    private timerUI: HTMLElement | null = null;

    constructor(private translationService: TranslationService) {}

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        if (window.speechSynthesis.getVoices().length === 0) {
            await new Promise<void>(resolve => {
                window.speechSynthesis.onvoiceschanged = () => resolve();
            });
        }
        
        this.isInitialized = true;
    }

    public startHoverTimer(element: HTMLElement, text: string): void {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
        }

        // 타이머 UI 생성
        const rect = element.getBoundingClientRect();
        this.timerUI = this.createTimerUI(rect.left, rect.top);

        this.hoverTimer = window.setTimeout(async () => {
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
            } finally {
                // 타이머 UI 제거
                this.timerUI?.remove();
                this.timerUI = null;
            }
        }, this.HOVER_DELAY);

        element.addEventListener('mouseleave', () => {
            if (this.hoverTimer) {
                clearTimeout(this.hoverTimer);
                this.hoverTimer = null;
            }
            if (this.timerUI) {
                this.timerUI.remove();
                this.timerUI = null;
            }
            window.speechSynthesis.cancel();
        }, { once: true });
    }

    public cleanup(): void {
        this.isInitialized = false;
        document.querySelectorAll('.translation-audio-container').forEach(el => el.remove());
    }

    async playText(text: string, lang: string): Promise<void> {
        try {
            // 湲곗〈 쓬꽦 以묒
            window.speechSynthesis.cancel();

            // voices 濡쒕뵫 솗씤
            await this.initialize();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.getLangCode(lang);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // 쓬꽦 꽑깮
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.lang.startsWith(utterance.lang));
            if (voice) {
                utterance.voice = voice;
            }

            // 쓬꽦 옱깮 떆옉
            window.speechSynthesis.speak(utterance);

            // 옱깮 셿猷 湲
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
        button.innerHTML = '윍';
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

    private createTimerUI(x: number, y: number): HTMLElement {
        const timerUI = document.createElement('div');
        timerUI.className = 'audio-timer';
        timerUI.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 32 32">
                <!-- 배경 원 -->
                <circle
                    cx="16"
                    cy="16"
                    r="15"
                    fill="rgba(0, 0, 0, 0.7)"
                    stroke="none"
                />
                <!-- 프로그레스 원 -->
                <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    stroke="#4a9eff"
                    stroke-width="2"
                    stroke-dasharray="87.96459430051421"
                    stroke-dashoffset="87.96459430051421"
                    transform="rotate(-90 16 16)"
                >
                    <animate
                        attributeName="stroke-dashoffset"
                        from="87.96459430051421"
                        to="0"
                        dur="2s"
                        fill="freeze"
                    />
                </circle>
                <!-- 음성 아이콘 -->
                <path
                    d="M16 8 L12 12 L8 12 L8 20 L12 20 L16 24 L16 8z M20 12 Q22 16 20 20 M23 9 Q27 16 23 23"
                    fill="none"
                    stroke="#ffffff"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `;
        timerUI.style.cssText = `
            position: fixed;
            left: ${x + 10}px;
            top: ${y + 10}px;
            z-index: 2147483647;
            pointer-events: none;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        `;
        document.body.appendChild(timerUI);
        return timerUI;
    }
} 