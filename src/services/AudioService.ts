import { Logger } from '../logger';
import { TranslationService } from './TranslationService';

const logger = Logger.getInstance();

export class AudioService {
    private static instance: AudioService | null = null;
    private isInitialized: boolean = false;
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
            this.stopCurrentSpeech();
            
            const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
            const nativeLang = settings.nativeLanguage || 'ko';
            const learningLang = settings.learningLanguage || 'en';

            let textToSpeak = text;
            let langToUse = lang;

            if (lang === nativeLang) {
                textToSpeak = await this.translationService.translateText(text, lang);
                langToUse = learningLang;
            }

            const voicesLoaded = await this.ensureVoicesLoaded();
            if (!voicesLoaded) throw new Error('Failed to load voices');

            const langCode = this.getLangCode(langToUse);
            const voices = speechSynthesis.getVoices();
            const selectedVoice = voices.find(v => 
                v.name.includes('Google') && 
                v.lang.startsWith(langCode.split('-')[0])
            );

            if (!selectedVoice) throw new Error(`No suitable voice found for ${langCode}`);

            // ��두점으로 끝나는 문장들 찾기
            const completeSentences = textToSpeak.match(/[^.!?]+[.!?]+/g) || [];
            
            // 마지막 문장이 구두점 없이 끝나는지 확인
            const lastPart = textToSpeak.replace(/.*[.!?]\s*/g, '').trim();
            
            // 최종 문장 배열 구성
            const sentences = lastPart ? [...completeSentences, lastPart] : completeSentences;

            logger.log('audio', 'Split sentences for speech', { 
                completeSentences,
                lastPart,
                sentences 
            });
            
            // 각 문장을 순차적으로 재생
            for (const sentence of sentences) {
                await new Promise<void>((resolve, reject) => {
                    const utterance = new SpeechSynthesisUtterance(sentence.trim());
                    this.currentUtterance = utterance;
                    
                    utterance.voice = selectedVoice;
                    utterance.lang = selectedVoice.lang;
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    utterance.volume = 1.0;

                    utterance.onend = () => {
                        this.currentUtterance = null;
                        resolve();
                    };

                    utterance.onerror = (event) => {
                        this.currentUtterance = null;
                        reject(event);
                    };

                    speechSynthesis.cancel();
                    speechSynthesis.resume();
                    speechSynthesis.speak(utterance);
                });

                // 문장 사이에 짧은 격 추가
                await new Promise(resolve => setTimeout(resolve, 100));
            }
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
        prompt.textContent = '음성 재생을 위해 페이지를 클릭주세요';
        document.body.appendChild(prompt);
        
        const removePrompt = () => {
            prompt.remove();
            document.removeEventListener('click', removePrompt);
        };
        
        document.addEventListener('click', removePrompt);
        setTimeout(removePrompt, 5000);
    }

    public async startHoverTimer(element: HTMLElement, text: string): Promise<void> {
        // 이미 처리 중인 요소면 무시
        if (this.currentElement === element) return;

        // 이전 UI가 있으면 제거
        if (this.timerUI) {
            const container = this.timerUI.parentElement;
            if (container) {
                container.remove();
            }
            this.timerUI = null;
        }

        this.currentElement = element;

        // 새로운 타이머 UI 생성
        const rect = element.getBoundingClientRect();
        this.timerUI = this.createTimerUI(rect.left, rect.top);
        this.timerUI.style.pointerEvents = 'auto';
        this.timerUI.style.cursor = 'pointer';

        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top - 30}px;
            z-index: 2147483647;
        `;
        container.appendChild(this.timerUI);
        document.body.appendChild(container);

        // 클릭 이벤트 핸들러
        this.timerUI.addEventListener('click', async () => {
            try {
                if (this.isPlaying) return;
                this.isPlaying = true;
                const sourceLang = await this.translationService.detectLanguage(text);
                await this.playText(text, sourceLang);
            } catch (error) {
                logger.log('audio', 'Error in timer click', error);
            } finally {
                this.isPlaying = false;
            }
        });
    }

    public disable(): void {
        if (this.timerUI) {
            const container = this.timerUI.parentElement;
            if (container) {
                container.remove();
            }
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
        // 이미 처리된 요소는 건너뛰기
        if (element.querySelector('.translation-audio-button') || 
            element.closest('.translation-audio-container')) {
            return;
        }

        // 전체 모드에서 original 텍스트 사용
        const inlineContainer = element.closest('.translation-inline-container');
        if (inlineContainer) {
            const originalText = inlineContainer.querySelector('.original')?.textContent;
            if (originalText) {
                text = originalText;
            }
            // 음성 버튼을 original 텍스트 옆에 추가
            const originalElement = inlineContainer.querySelector('.original');
            if (originalElement) {
                this.addAudioButtonToElement(originalElement as HTMLElement, text);
                return;
            }
        }

        // 일반적인 경우
        this.addAudioButtonToElement(element, text);
    }

    public addAudioButtonToElement(element: HTMLElement, text: string): void {
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
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 32 32">
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
        `;
        button.style.cssText = `
            position: relative;
            display: inline-flex;
            align-items: center;
            background: none;
            border: none;
            cursor: pointer;
            padding: 2px;
            margin-left: 4px;
            opacity: 0.7;
            z-index: 1000;
            pointer-events: all;
            vertical-align: middle;
            transition: opacity 0.2s;
        `;

        // 호버 효과
        button.addEventListener('mouseenter', () => {
            button.style.opacity = '1';
        });
        button.addEventListener('mouseleave', () => {
            button.style.opacity = '0.7';
        });

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
                // 언어 감지 로직 개선
                const sourceLang = await this.translationService.detectLanguage(text);
                logger.log('audio', 'Language detected', {
                    text: text.substring(0, 50),
                    detectedLang: sourceLang
                });

                await this.playText(text, sourceLang);
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
        `;
        timerUI.style.cssText = `
            position: fixed;
            left: ${x - 40}px;
            top: ${y - 10}px;
            z-index: 2147483647;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
            opacity: 0;
            transition: opacity 0.3s;
            cursor: pointer;
        `;

        // 0.3초 후에 나타나게만 하고, 자동으로 사라지지 않도록 수정
        setTimeout(() => {
            timerUI.style.opacity = '1';
        }, 300);

        // 마우스가 아이콘 위에 있을 때 스타일
        timerUI.addEventListener('mouseenter', () => {
            timerUI.style.opacity = '1';
        });

        return timerUI;
    }
} 