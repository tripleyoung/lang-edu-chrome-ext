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

export interface TranslationResponse {
    translation: string;
    grammar: string;
    definition: string;
    words: Word[];
    idioms: Idiom[];
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