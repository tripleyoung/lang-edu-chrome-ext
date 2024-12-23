import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    private static instance: AudioService | null = null;
    private isInitialized: boolean = false;
    private hoverTimer: number | null = null;
    private readonly HOVER_DELAY = 2000;
    private timerUI: HTMLElement | null = null;
    private isPlaying: boolean = false;
    private currentElement: HTMLElement | null = null;
    private currentUtterance: SpeechSynthesisUtterance | null = null;

    private constructor(private translationService: TranslationService) {}

    public static getInstance(translationService: TranslationService): AudioService {
        if (!AudioService.instance) {
            AudioService.instance = new AudioService(translationService);
        }
        return AudioService.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        
        try {
            // voices 초기화를 더 안정적으로 처리
            await new Promise<void>((resolve) => {
                const checkVoices = () => {
                    const voices = window.speechSynthesis.getVoices();
                    if (voices.length > 0) {
                        resolve();
                    } else {
                        window.speechSynthesis.onvoiceschanged = () => {
                            window.speechSynthesis.onvoiceschanged = null;
                            resolve();
                        };
                        window.speechSynthesis.getVoices();
                    }
                };
                checkVoices();
            });

            this.isInitialized = true;
            logger.log('audio', 'AudioService initialized');
        } catch (error) {
            logger.log('audio', 'AudioService initialization failed', error);
            this.isInitialized = false;
        }
    }

    private stopCurrentSpeech(): void {
        if (this.currentUtterance) {
            speechSynthesis.cancel();
            this.currentUtterance = null;
        }
    }

    private async ensureVoicesLoaded(): Promise<boolean> {
        try {
            // 최대 3초 동안 voices 로딩 시도
            for (let i = 0; i < 30; i++) {
                const voices = speechSynthesis.getVoices();
                if (voices.length > 0) {
                    return true;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return false;
        } catch (error) {
            logger.log('audio', 'Error loading voices', error);
            return false;
        }
    }

    async playText(text: string, lang: string): Promise<void> {
        if (!text || text.trim().length === 0) return;

        try {
            // 현재 재생 중인 음성 중지
            this.stopCurrentSpeech();

            // voices 로딩 확인
            const voicesLoaded = await this.ensureVoicesLoaded();
            if (!voicesLoaded) {
                throw new Error('Failed to load voices');
            }

            // 음성 합성 설정
            const langCode = this.getLangCode(lang);
            const voices = speechSynthesis.getVoices();
            const selectedVoice = voices.find(v => 
                v.name.includes('Google') && 
                v.lang.startsWith(langCode.split('-')[0])
            );

            if (!selectedVoice) {
                throw new Error(`No suitable voice found for ${langCode}`);
            }

            logger.log('audio', 'Starting speech', {
                text: text.substring(0, 50),
                voice: selectedVoice.name,
                lang: selectedVoice.lang,
                availableVoices: voices.length
            });

            // 음성 재생
            return new Promise<void>((resolve, reject) => {
                const utterance = new SpeechSynthesisUtterance(text.trim());
                this.currentUtterance = utterance;
                
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
                utterance.rate = 0.9;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                let hasStarted = false;

                utterance.onstart = () => {
                    hasStarted = true;
                    logger.log('audio', 'Speech started');
                };

                utterance.onend = () => {
                    logger.log('audio', 'Speech completed');
                    this.currentUtterance = null;
                    resolve();
                };

                utterance.onerror = (event) => {
                    logger.log('audio', 'Speech error', {
                        error: event,
                        voice: selectedVoice.name,
                        voiceCount: voices.length,
                        hasStarted
                    });

                    // 시작도 못했다면 사용자 상호작용이 필요할 수 있음
                    if (!hasStarted) {
                        logger.log('audio', 'Speech failed to start - might need user interaction');
                        this.showUserInteractionPrompt();
                    }

                    this.currentUtterance = null;
                    reject(event);
                };

                // 음성 재생 시작
                try {
                    speechSynthesis.cancel();
                    speechSynthesis.resume();
                    speechSynthesis.speak(utterance);
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            logger.log('audio', 'Error in playText', error);
            this.stopCurrentSpeech();
            throw error;
        }
    }

    private showUserInteractionPrompt(): void {
        const prompt = document.createElement('div');
        prompt.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 2147483647;
        `;
        prompt.textContent = '음성 재생을 위해 페이지를 클릭해주세요';
        document.body.appendChild(prompt);
        
        const removePrompt = () => {
            prompt.remove();
            document.removeEventListener('click', removePrompt);
        };
        
        document.addEventListener('click', removePrompt);
        setTimeout(removePrompt, 5000);
    }

    public startHoverTimer(element: HTMLElement, text: string): void {
        // 이미 처리 중인 요소면 무시
        if (this.currentElement === element) return;

        // 이전 타이머 정리
        this.clearCurrentTimer();

        this.currentElement = element;

        // 타릭 가능한 타이머 UI 생성
        const rect = element.getBoundingClientRect();
        this.timerUI = this.createTimerUI(rect.left, rect.top);

        // 클릭 이벤트 추가
        this.timerUI.style.pointerEvents = 'auto';
        this.timerUI.style.cursor = 'pointer';

        let isOverTimer = false;
        let isOverElement = false;

        // 타이머 UI에 마우스 진입/이탈 이벤트 추가
        this.timerUI.addEventListener('mouseenter', () => {
            isOverTimer = true;
        });

        // this.timerUI.addEventListener('mouseleave', () => {
        //     isOverTimer = false;
        //     if (!isOverElement) {
        //         this.clearCurrentTimer();
        //     }
        // });

        // 원본 요소에 마우스 진입/이탈 이벤트 추가
        element.addEventListener('mouseenter', () => {
            isOverElement = true;
        });

        // element.addEventListener('mouseleave', () => {
        //     isOverElement = false;
        //     setTimeout(() => {
        //         if (!isOverTimer) {
        //             this.clearCurrentTimer();
        //         }
        //     }, 100);
        // });

        // 클릭 이벤트 핸들러
        this.timerUI.addEventListener('click', async () => {
            try {
                if (this.isPlaying) return;
                this.isPlaying = true;

                const [sourceLang, settings] = await Promise.all([
                    this.translationService.detectLanguage(text),
                    chrome.storage.sync.get(['nativeLanguage', 'learningLanguage'])
                ]);

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
                logger.log('audio', 'Error in timer click', error);
            } finally {
                this.isPlaying = false;
                this.clearCurrentTimer();
            }
        });

        // 호버 타이머 설정
        this.hoverTimer = window.setTimeout(() => {
            logger.log('audio', 'Timer completed, waiting for click');
        }, this.HOVER_DELAY);
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
        this.currentElement = null;
    }

    public cleanup(): void {
        this.isInitialized = false;
        document.querySelectorAll('.translation-audio-container').forEach(el => el.remove());
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

        const textSpan = document.createElement('span');
        textSpan.textContent = text;

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
            opacity: 1;
            z-index: 1000;
            pointer-events: all;
            vertical-align: middle;
            line-height: 1;
        `;

        container.appendChild(textSpan);
        container.appendChild(button);

        element.parentNode?.replaceChild(container, element);
        this.addAudioButtonListeners(button, text);
    }

    private async addAudioButtonListeners(button: HTMLButtonElement, text: string): Promise<void> {
        const container = button.closest('.translation-audio-container');
        if (!container) return;

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
                <circle
                    cx="16"
                    cy="16"
                    r="15"
                    fill="rgba(0, 0, 0, 0.7)"
                    stroke="none"
                />
                <path
                    d="M16 8 L12 12 L8 12 L8 20 L12 20 L16 24 L16 8z M20 12 Q22 16 20 20 M23 9 Q27 16 23 23"
                    fill="none"
                    stroke="#ffffff"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
            <div class="audio-tooltip">클릭하여 음성 재생</div>
        `;
        timerUI.style.cssText = `
            position: fixed;
            left: ${x + 10}px;
            top: ${y + 10}px;
            z-index: 2147483647;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            opacity: 0;
            transition: opacity 0.3s;
        `;

        // 0.3초 후에 나타나게 하고, 3초 동안 표시
        setTimeout(() => {
            timerUI.style.opacity = '1';
            
            // 3초 후에 천천히 사라지기
            setTimeout(() => {
                timerUI.style.opacity = '0';
                setTimeout(() => {
                    if (timerUI.parentElement) {
                        timerUI.remove();
                    }
                }, 300);
            }, 3000);
        }, 300);

        // 마우스가 아이콘 위에 있을 때는 유지
        timerUI.addEventListener('mouseenter', () => {
            timerUI.style.opacity = '1';
        });

        // 툴팁 스타일
        const tooltip = timerUI.querySelector('.audio-tooltip');
        if (tooltip) {
            (tooltip as HTMLElement).style.cssText = `
                position: absolute;
                left: 100%;
                top: 50%;
                transform: translateY(-50%);
                margin-left: 8px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.2s;
            `;
        }

        // 호버 시 툴팁 표시
        timerUI.addEventListener('mouseenter', () => {
            if (tooltip) {
                (tooltip as HTMLElement).style.opacity = '1';
            }
        });

        timerUI.addEventListener('mouseleave', () => {
            if (tooltip) {
                (tooltip as HTMLElement).style.opacity = '0';
            }
        });

        document.body.appendChild(timerUI);
        return timerUI;
    }
} 