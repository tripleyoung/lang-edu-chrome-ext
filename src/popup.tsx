import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { messages, Language } from './i18n/messages';
import { Logger } from './logger';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './components/ui/select';
const logger = Logger.getInstance();

interface Settings {
    enabled: boolean;
    translationMode: 'none' | 'tooltip' | 'full';
    wordMode: 'none' | 'tooltip' | 'full';
    usePanel: boolean;
    autoOpenPanel: boolean;
    useAudioFeature: boolean;
    nativeLanguage: string;
    learningLanguage: string;
}

// 메시지 타입 정의
type MessageType = typeof messages['ko'];
type MessageKey = keyof MessageType;

const PopupPanel: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({
        enabled: false,
        translationMode: 'none',
        wordMode: 'none',
        usePanel: false,
        autoOpenPanel: false,
        useAudioFeature: false,
        nativeLanguage: 'ko',
        learningLanguage: 'en'
    });

    const [language, setLanguage] = useState<Language>(settings.nativeLanguage as Language);

    useEffect(() => {
        chrome.storage.sync.get([
            'enabled',
            'translationMode',
            'wordMode',
            'usePanel',
            'autoOpenPanel',
            'useAudioFeature',
            'nativeLanguage',
            'learningLanguage'
        ], (result) => {
            setSettings({
                enabled: result.enabled ?? false,
                translationMode: result.translationMode ?? 'none',
                wordMode: result.wordMode ?? 'none',
                usePanel: result.usePanel ?? false,
                autoOpenPanel: result.autoOpenPanel ?? false,
                useAudioFeature: result.useAudioFeature ?? false,
                nativeLanguage: result.nativeLanguage ?? 'ko',
                learningLanguage: result.learningLanguage ?? 'en'
            });
        });
    }, []);

    useEffect(() => {
        setLanguage(settings.nativeLanguage as Language);
    }, [settings.nativeLanguage]);

    // t 함수 수정
    const t = (key: MessageKey): string => {
        const currentLang = settings.nativeLanguage;
        if (currentLang in messages) {
            const langMessages = messages[currentLang as Language];
            return (langMessages as MessageType)[key] || messages['en'][key];
        }
        return messages['en'][key];
    };

    const handlePanelToggle = async () => {
        const newValue = !settings.usePanel;
        setSettings({ ...settings, usePanel: newValue });
        await chrome.storage.sync.set({ usePanel: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { ...settings, usePanel: newValue }
            });
        }
    };

    const handleTooltipToggle = async () => {
        handleSettingChange('translationMode', settings.translationMode === 'tooltip' ? 'none' : 'tooltip');
    };

    const handleFullModeToggle = async () => {
        handleSettingChange('translationMode', settings.translationMode === 'full' ? 'none' : 'full');
    };

    const handleAudioFeatureToggle = async () => {
        const newSettings = { ...settings, useAudioFeature: !settings.useAudioFeature };
        setSettings(newSettings);
        await chrome.storage.sync.set({ useAudioFeature: newSettings.useAudioFeature });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: newSettings
            });
        }
    };

    const handleWordTooltipToggle = async () => {
        handleSettingChange('wordMode', settings.wordMode === 'tooltip' ? 'none' : 'tooltip');
    };

    const handleLanguageChange = async (type: 'nativeLanguage' | 'learningLanguage', value: Language) => {
        const newSettings = { ...settings, [type]: value };
        setSettings(newSettings);
        await chrome.storage.sync.set({ [type]: value });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: newSettings
            });
        }
    };

    const handleAutoOpenPanelToggle = async () => {
        const newValue = !settings.autoOpenPanel;
        setSettings({ ...settings, autoOpenPanel: newValue });
        await chrome.storage.sync.set({ autoOpenPanel: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { ...settings, autoOpenPanel: newValue }
            });
        }
    };

    const openTranslationPanel = async () => {
        await chrome.runtime.sendMessage({ type: 'OPEN_TRANSLATION_PANEL' });
    };

    const handleSettingChange = async (key: keyof Settings, value: any) => {
        try {
            const newSettings = { ...settings, [key]: value };
            
            // 1. 먼저 설정을 저장
            await chrome.storage.sync.set({ [key]: value });
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                if (key === 'translationMode' || key === 'wordMode') {
                    // 2. 설정 업데이트 메시지를 보내고 응답을 기다림
                    await new Promise<void>((resolve, reject) => {
                        chrome.tabs.sendMessage(
                            tab.id!, 
                            { type: 'UPDATE_SETTINGS', settings: newSettings },
                            (response) => {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                } else if (response?.success) {
                                    resolve();
                                } else {
                                    reject(new Error('Failed to update settings'));
                                }
                            }
                        );
                    });

                    // 3. 설정이 적용된 것을 확인한 후 리로드
                    await chrome.tabs.reload(tab.id);
                    
                    // 4. 상태 업데이트는 리로드 후에 수행
                    setTimeout(() => {
                        setSettings(newSettings);
                    }, 100);
                } else {
                    // 일반 설정 변경
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'UPDATE_SETTINGS',
                        settings: newSettings
                    });
                    setSettings(newSettings);
                }
            }
        } catch (error) {
            console.error('Error updating settings:', error);
            // 에러 발생 시 이전 설정으로 롤백
            setSettings(settings);
        }
    };

    const handleTranslationModeChange = async (mode: 'none' | 'tooltip' | 'full') => {
        handleSettingChange('translationMode', mode);
    };

    return (
        <div className="p-4 bg-gray-900 text-white min-w-[300px]">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">{t('settings')}</h2>
            
            {/* 번역 모드 섹션 */}
            <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('translationMode')}</h3>
                <div className="flex flex-col gap-2">
                    <label className="flex items-center space-x-2">
                        <input
                            type="radio"
                            name="translationMode"
                            value="none"
                            checked={settings.translationMode === 'none'}
                            onChange={(e) => handleSettingChange('translationMode', e.target.value)}
                            className="text-blue-600"
                        />
                        <span>{t('noTranslation')}</span>
                    </label>
                    <label className="flex items-center space-x-2">
                        <input
                            type="radio"
                            name="translationMode"
                            value="tooltip"
                            checked={settings.translationMode === 'tooltip'}
                            onChange={(e) => handleSettingChange('translationMode', e.target.value)}
                            className="text-blue-600"
                        />
                        <span>{t('tooltipMode')}</span>
                    </label>
                    <label className="flex items-center space-x-2">
                        <input
                            type="radio"
                            name="translationMode"
                            value="full"
                            checked={settings.translationMode === 'full'}
                            onChange={(e) => handleSettingChange('translationMode', e.target.value)}
                            className="text-blue-600"
                        />
                        <span>{t('fullMode')}</span>
                    </label>
                </div>
            </div>

            {/* 단어 모드 섹션 */}
            <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('wordMode')}</h3>
                <div className="flex flex-col gap-2">
                    <label className="flex items-center space-x-2">
                        <input
                            type="radio"
                            name="wordMode"
                            value="none"
                            checked={settings.wordMode === 'none'}
                            onChange={(e) => handleSettingChange('wordMode', e.target.value)}
                            className="text-blue-600"
                        />
                        <span>{t('noWordTranslation')}</span>
                    </label>
                    <label className="flex items-center space-x-2">
                        <input
                            type="radio"
                            name="wordMode"
                            value="tooltip"
                            checked={settings.wordMode === 'tooltip'}
                            onChange={(e) => handleSettingChange('wordMode', e.target.value)}
                            className="text-blue-600"
                        />
                        <span>{t('wordTooltipMode')}</span>
                    </label>
                    {/* <label className="flex items-center space-x-2">
                        <input
                            type="radio"
                            name="wordMode"
                            value="full"
                            checked={settings.wordMode === 'full'}
                            onChange={(e) => handleSettingChange('wordMode', e.target.value)}
                            className="text-blue-600"
                        />
                        <span>{t('wordFullMode')}</span>
                    </label> */}
                </div>
            </div>

            {/* 추가 기능 섹션 */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('additionalFeatures')}</h3>
                <div className="flex flex-col gap-2">
                    <button
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            settings.useAudioFeature 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                        }`}
                        onClick={handleAudioFeatureToggle}
                    >
                        {t('audioMode')} 🔊
                    </button>
                </div>
            </div>

            {/* 언어 설정 섹션 */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('languageSettings')}</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-300">{t('nativeLanguage')}</span>
                        <select
                            value={settings.nativeLanguage}
                            onChange={(e) => handleLanguageChange('nativeLanguage', e.target.value as Language)}
                            className="bg-gray-700 text-white rounded px-3 py-1 border border-gray-600"
                        >
                            <option value="ko">한국어</option>
                            <option value="en">English</option>
                            <option value="ja">日本語</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-300">{t('learningLanguage')}</span>
                        <select
                            value={settings.learningLanguage}
                            onChange={(e) => handleLanguageChange('learningLanguage', e.target.value as Language)}
                            className="bg-gray-700 text-white rounded px-3 py-1 border border-gray-600"
                        >
                            <option value="en">English</option>
                            <option value="ko">한국어</option>
                            <option value="ja">日本語</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 패널 설정 섹션 */}
            {/* <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-gray-300">{t('panel')}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.usePanel}
                            onChange={handlePanelToggle}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-gray-300">{t('autoOpenPanel')}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.autoOpenPanel}
                            onChange={handleAutoOpenPanelToggle}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div> */}
        </div>
    );
};

const root = document.getElementById('root');
if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <PopupPanel />
        </React.StrictMode>
    );
} 