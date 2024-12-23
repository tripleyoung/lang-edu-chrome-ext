export const messages = {
    ko: {
        settings: '설정',
        translationMode: '번역 모드',
        noTranslation: '번역 없음',
        tooltipMode: '툴팁 모드',
        fullMode: '전체 번역 모드',
        additionalFeatures: '추가 기능',
        audioMode: '문장 발음 듣기',
        wordTooltip: '단어 툴팁 모드',
        panel: '번역 패널',
        autoOpenPanel: '자동 패널 열기',
        languageSettings: '언어 설정',
        nativeLanguage: '모국어',
        learningLanguage: '학습 언어',
    },
    en: {
        settings: 'Settings',
        translationMode: 'Translation Mode',
        noTranslation: 'No Translation',
        tooltipMode: 'Tooltip Mode',
        fullMode: 'Full Translation',
        additionalFeatures: 'Additional Features',
        audioMode: 'Text-to-Speech',
        wordTooltip: 'Word Tooltip Mode',
        panel: 'Translation Panel',
        autoOpenPanel: 'Auto Open Panel',
        languageSettings: 'Language Settings',
        nativeLanguage: 'Native Language',
        learningLanguage: 'Learning Language',
    },
    ja: {
        settings: '設定',
        translationMode: '翻訳モード',
        noTranslation: '翻訳なし',
        tooltipMode: 'ツールチップモード',
        fullMode: '全体翻訳',
        additionalFeatures: '追加機能',
        audioMode: '音声読み上げ',
        wordTooltip: '単語ツールチップ',
        panel: '翻訳パネル',
        autoOpenPanel: 'パネル自動表示',
        languageSettings: '言語設定',
        nativeLanguage: '母国語',
        learningLanguage: '学習言語',
    },
    wordTooltipMode: {
        ko: '단어 툴팁 모드',
        en: 'Word Tooltip Mode'
    },
    wordTooltipModeDesc: {
        ko: '영단어에 마우스를 올리면 단어의 의미와 발음을 보여줍니다.',
        en: 'Shows word definitions and pronunciations when hovering over English words.'
    }
};

export type Language = keyof typeof messages; 