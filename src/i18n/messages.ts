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
        usePanel: '번역 패널 사용',
        useTooltip: '툴팁 모드',
        useFullMode: '전체 번역 모드',
        enabled: '활성화',
        disabled: '비활성화',
        use: '사용',
        notUse: '미사용',
        useAudioFeature: '문장 발음 듣기',
        useWordTooltip: '단어 툴팁 모드',
        wordTooltipDesc: '영단어에 마우스를 올리면 단어의 의미와 발음을 보여줍니다.',
        wordMode: '단어 모드',
        noWordTranslation: '단어 번역 없음',
        wordTooltipMode: '단어 툴팁 모드',
        wordFullMode: '전체 단어 보기'
    },
    en: {
        settings: 'Settings',
        translationMode: 'Translation Mode',
        noTranslation: 'No Translation',
        tooltipMode: 'Tooltip Mode',
        fullMode: 'Full Translation Mode',
        additionalFeatures: 'Additional Features',
        audioMode: 'Text-to-Speech',
        wordTooltip: 'Word Tooltip Mode',
        panel: 'Translation Panel',
        autoOpenPanel: 'Auto Open Panel',
        languageSettings: 'Language Settings',
        nativeLanguage: 'Native Language',
        learningLanguage: 'Learning Language',
        usePanel: 'Use Translation Panel',
        useTooltip: 'Tooltip Mode',
        useFullMode: 'Full Translation Mode',
        enabled: 'Enabled',
        disabled: 'Disabled',
        use: 'Use',
        notUse: 'Don\'t Use',
        useAudioFeature: 'Text-to-Speech',
        useWordTooltip: 'Word Tooltip Mode',
        wordTooltipDesc: 'Shows word definitions and pronunciations when hovering over English words.',
        wordMode: 'Word Mode',
        noWordTranslation: 'No Word Translation',
        wordTooltipMode: 'Word Tooltip Mode',
        wordFullMode: 'Show All Words'
    },
    ja: {
        settings: '設定',
        translationMode: '翻訳モード',
        noTranslation: '翻訳なし',
        tooltipMode: 'ツールチップモード',
        fullMode: '全体翻訳モード',
        additionalFeatures: '追加機能',
        audioMode: '音声読み上げ',
        wordTooltip: '単語ツールチップ',
        panel: '翻訳パネル',
        autoOpenPanel: 'パネル自動表示',
        languageSettings: '言語設定',
        nativeLanguage: '母国語',
        learningLanguage: '学習言語',
        usePanel: '翻訳パネルを使用',
        useTooltip: 'ツールチップモード',
        useFullMode: '全体翻訳モード',
        enabled: '有効',
        disabled: '無効',
        use: '使用',
        notUse: '未使用',
        useAudioFeature: '音声読み上げ',
        useWordTooltip: '単語ツールチップモード',
        wordTooltipDesc: '英単語にマウスを合わせると、単語の意味と発音を表示します。',
        wordMode: '単語モード',
        noWordTranslation: '単語翻訳なし',
        wordTooltipMode: '単語ツールチップモード',
        wordFullMode: '全単語表示'
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