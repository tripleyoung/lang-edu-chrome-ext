// 타입 정의
export interface TranslationResponse {
    translation: string;
    grammar: string;
    definition: string;
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