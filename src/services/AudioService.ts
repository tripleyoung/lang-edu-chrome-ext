import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    private isInitialized: boolean = false;
    private hoverTimer: number | null = null;
    private readonly HOVER_DELAY = 2000; // 2초 딜레이
    private timerUI: HTMLElement | null = null;
    private isPlaying: boolean = false;  // 재생 상태 추적
    private currentElement: HTMLElement | null = null;  // 현재 처리 중인 요소

    constructor(private translationService: TranslationService) {}

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        // voices가 로드될 때까지 대기
        if (window.speechSynthesis.getVoices().length === 0) {
            await new Promise<void>(resolve => {
                window.speechSynthesis.onvoiceschanged = () => {
                    window.speechSynthesis.onvoiceschanged = null;
                    resolve();
                };
            });
        }
        
        this.isInitialized = true;
    }

    public startHoverTimer(element: HTMLElement, text: string): void {
        // 이미 처리 중인 요소면 무시
        if (this.currentElement === element) return;

        // 이전 타이머 정리
        this.clearCurrentTimer();

        this.currentElement = element;

        // 타이머 UI 생성
        const rect = element.getBoundingClientRect();
        this.timerUI = this.createTimerUI(rect.left, rect.top);

        this.hoverTimer = window.setTimeout(async () => {
            try {
                if (this.isPlaying) return;  // 이미 재생 중이면 무시
                this.isPlaying = true;

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
                this.isPlaying = false;
                this.clearCurrentTimer();
            }
        }, this.HOVER_DELAY);

        element.addEventListener('mouseleave', () => {
            this.clearCurrentTimer();
        }, { once: true });
    }

    private clearCurrentTimer(): void {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        if (this.timerUI) {
            this.timerUI.remove();
            this.timerUI = null;
        }
        if (this.isPlaying) {
            window.speechSynthesis.cancel();
        }
        this.currentElement = null;
    }

    public cleanup(): void {
        this.isInitialized = false;
        document.querySelectorAll('.translation-audio-container').forEach(el => el.remove());
    }

    async playText(text: string, lang: string): Promise<void> {
        if (!text || text.trim().length === 0) return;

        try {
            // 기존 음성 중지 및 초기화
            speechSynthesis.cancel();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 언어 설정 가져오기
            const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
            const nativeLang = settings.nativeLanguage || 'ko';
            const learningLang = settings.learningLanguage || 'en';

            // 텍스트 언어가 모국어인 경우 학습 언어로 번역
            let finalText = text;
            let finalLang = lang;
            
            if (lang === nativeLang) {
                finalText = await this.translationService.translateText(text, learningLang);
                finalLang = learningLang;
                logger.log('audio', 'Text translated', {
                    from: text,
                    to: finalText,
                    fromLang: lang,
                    toLang: finalLang
                });
            }

            // 음성 합성 설정
            const langCode = this.getLangCode(finalLang);

            // voices 초기화 및 대기
            if (!this.isInitialized) {
                await this.initialize();
            }

            // 음성 선택
            const voices = speechSynthesis.getVoices();
            const selectedVoice = voices.find(v => 
                v.name.includes('Google') && 
                v.lang.startsWith(langCode.split('-')[0])
            );

            if (!selectedVoice) {
                logger.log('audio', 'No suitable voice found for', { langCode });
                return;
            }

            logger.log('audio', 'Using voice', {
                name: selectedVoice.name,
                lang: selectedVoice.lang
            });

            // 음성 재생
            return new Promise<void>((resolve) => {
                const utterance = new SpeechSynthesisUtterance(finalText.trim());
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
                utterance.rate = 0.9;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                let started = false;
                let finished = false;
                let retryCount = 0;
                const maxRetries = 2;

                const cleanup = () => {
                    if (!finished) {
                        finished = true;
                        clearInterval(resumeInterval);
                        resolve();
                    }
                };

                const trySpeak = () => {
                    if (retryCount >= maxRetries) {
                        logger.log('audio', 'Max retries reached');
                        cleanup();
                        return;
                    }

                    retryCount++;
                    logger.log('audio', 'Attempting speech', { attempt: retryCount });

                    try {
                        speechSynthesis.cancel();
                        speechSynthesis.resume();
                        speechSynthesis.speak(utterance);
                    } catch (error) {
                        logger.log('audio', 'Speak attempt failed', error);
                        cleanup();
                    }
                };

                utterance.onstart = () => {
                    started = true;
                    logger.log('audio', 'Speech started');
                };

                utterance.onend = () => {
                    if (started) {
                        logger.log('audio', 'Speech completed');
                        cleanup();
                    }
                };

                utterance.onerror = (event) => {
                    logger.log('audio', 'Speech error', { attempt: retryCount, error: event });
                    if (!started && !finished && retryCount < maxRetries) {
                        setTimeout(trySpeak, 200);
                    } else {
                        cleanup();
                    }
                };

                // Chrome 버그 해결을 위한 주기적인 resume 호출
                const resumeInterval = setInterval(() => {
                    if (!finished && speechSynthesis.speaking) {
                        speechSynthesis.resume();
                    }
                }, 50);

                // 5초 후 강제 종료
                setTimeout(cleanup, 5000);

                // 첫 시도 시작
                trySpeak();
            });
        } catch (error) {
            logger.log('audio', 'Error in playText', error);
            speechSynthesis.cancel();
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