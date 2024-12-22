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
        notUse: '미사용'
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
        notUse: 'Don\'t Use'
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
        notUse: '未使用'
    }
};

export type Language = keyof typeof messages; 