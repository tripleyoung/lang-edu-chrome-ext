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

            const response = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
            );
            const data = await response.json();
            return data[0][0][0];
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