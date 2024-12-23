import { Logger } from '../logger';
import { TranslationResponse } from '../types';

const logger = Logger.getInstance();

export class TranslationService {
    private translationCache: Map<string, TranslationResponse> = new Map();

    async detectLanguage(text: string): Promise<string> {
        try {
            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`
            );
            const data = await response.json();
            return data[2] || 'en';
        } catch (error) {
            return 'en';
        }
    }

    async translateText(text: string, sourceLang: string): Promise<string> {
        try {
            const settings = await chrome.storage.sync.get(['nativeLanguage', 'learningLanguage']);
            const nativeLang = settings.nativeLanguage || 'ko';
            const learningLang = settings.learningLanguage || 'en';
            const targetLang = sourceLang === learningLang ? nativeLang : learningLang;

            // 구두점으로 끝나는 문장들과 나머지 부분 분리
            const parts = text.split(/(?<=[.!?])\s+/);
            const sentences = parts.filter(part => part.trim().length > 0);

            logger.log('translation', 'Split sentences', { sentences ,text });

            // 각 문장 개별적으로 번역
            const translations = await Promise.all(
                sentences.map(async (sentence) => {
                    const textToTranslate = sentence.trim().replace(/([^.!?])$/, '$1.');
                    const response = await fetch(
                        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`
                    );
                    const data = await response.json();
                    return data[0][0][0];
                })
            );

            logger.log('translation', 'Translations', { translations });
            return translations.join(' ');
        } catch (error) {
            logger.log('translation', 'Translation error', error);
            return text;
        }
    }

    getCachedTranslation(text: string): TranslationResponse | undefined {
        return this.translationCache.get(text);
    }

    setCachedTranslation(text: string, translation: TranslationResponse): void {
        this.translationCache.set(text, translation);
    }
} 