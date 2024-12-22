export const messages = {
    ko: {
        settings: '번역 설정',
        usePanel: '번역 패널 사용',
        useTooltip: '툴팁 모드',
        useFullMode: '전체 번역 모드',
        nativeLanguage: '모국어',
        learningLanguage: '학습 언어',
        openPanel: '번역 패널 열기',
        enabled: '활성화',
        disabled: '비활성화',
        use: '사용',
        notUse: '미사용',
        useAudioFeature: '문장 발음 듣기',
        useWordTooltip: '단어 툴팁 모드',
        wordTooltipDesc: '영단어에 마우스를 올리면 단어의 의미와 발음을 보여줍니다.'
    },
    en: {
        settings: 'Translation Settings',
        usePanel: 'Use Translation Panel',
        useTooltip: 'Tooltip Mode',
        useFullMode: 'Full Translation Mode',
        nativeLanguage: 'Native Language',
        learningLanguage: 'Learning Language',
        openPanel: 'Open Translation Panel',
        enabled: 'Enabled',
        disabled: 'Disabled',
        use: 'Use',
        notUse: 'Don\'t Use',
        useAudioFeature: 'Text-to-Speech',
        useWordTooltip: 'Word Tooltip Mode',
        wordTooltipDesc: 'Shows word definitions and pronunciations when hovering over English words.'
    },
    ja: {
        settings: '翻訳設定',
        usePanel: '翻訳パネルを使用',
        useTooltip: 'ツールチップモード',
        useFullMode: '全体翻訳モード',
        nativeLanguage: '母国語',
        learningLanguage: '学習言語',
        openPanel: '翻訳パネルを開く',
        enabled: '有効',
        disabled: '無効',
        use: '使用',
        notUse: '未使用',
        useAudioFeature: '音声読み上げ',
        useWordTooltip: '単語ツールチップモード',
        wordTooltipDesc: '英単語にマウスを合わせると、単語の意味と発音を表示します。'
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