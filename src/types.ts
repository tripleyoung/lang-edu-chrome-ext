declare global {
    namespace chrome.tabs {
        function toggleReaderMode(tabId: number): Promise<void>;
    }
}

// 타입 정의
export interface Word {
    word: string;
    pronunciation: string;
    meaning: string;
    audioUrl?: string;
}

export interface Idiom {
    idiom: string;
    pronunciation: string;
    meaning: string;
    audioUrl?: string;
}

export interface DictionaryEntry {
    word: string;
    phonetics: {
        text?: string;
        audio?: string;
    }[];
    meanings: {
        partOfSpeech: string;
        definitions: {
            definition: string;
            example?: string;
            synonyms: string[];
            antonyms: string[];
        }[];
        synonyms: string[];
        antonyms: string[];
    }[];
}

interface Definition {
    definition: string;
    example?: string;
    synonyms: string[];
    antonyms: string[];
}

interface Meaning {
    partOfSpeech: string;
    definitions: Definition[];
    synonyms: string[];
    antonyms: string[];
}

export interface TranslationResponse {
    translation: string;
    grammar: string;
    definition: string;
    words: {
        word: string;
        phonetic?: string;
        audioUrl?: string;
        meanings: Meaning[];
    }[];
    idioms: string[];
}

export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
}

export interface ClaudeResponse {
    content: Array<{
        text: string;
    }>;
    usage?: TokenUsage;
}

export interface ExtensionState {
    isEnabled: boolean;
    targetLanguage: string;
}

export interface TextGroup {
    elements: Element[];
    commonParent: Element;
    distance: number;
} 