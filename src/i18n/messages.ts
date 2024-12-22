export const messages = {
    ko: {
        settings: '번역 설정',
        usePanel: '번역 패널 사용',
        useTooltip: '툴팁 모드',
        useFullMode: '전체 번역 모드',
        targetLanguage: '번역 언어',
        openPanel: '번역 패널 열기',
        enabled: '활성화',
        disabled: '비활성화',
        use: '사용',
        notUse: '미사용',
        uiLanguage: '인터페이스 언어',
    },
    en: {
        settings: 'Translation Settings',
        usePanel: 'Use Translation Panel',
        useTooltip: 'Tooltip Mode',
        useFullMode: 'Full Translation Mode',
        targetLanguage: 'Target Language',
        openPanel: 'Open Translation Panel',
        enabled: 'Enabled',
        disabled: 'Disabled',
        use: 'Use',
        notUse: 'Don\'t Use',
        uiLanguage: 'Interface Language',
    },
    ja: {
        settings: '翻訳設定',
        usePanel: '翻訳パネルを使用',
        useTooltip: 'ツールチップモード',
        useFullMode: '全体翻訳モード',
        targetLanguage: '翻訳言語',
        openPanel: '翻訳パネルを開く',
        enabled: '有効',
        disabled: '無効',
        use: '使用',
        notUse: '未使用',
        uiLanguage: 'インターフェース言語',
    }
    // 다른 언어들 추가 가능
};

export type Language = keyof typeof messages; 