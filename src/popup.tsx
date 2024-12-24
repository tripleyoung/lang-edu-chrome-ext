import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { messages, Language } from './i18n/messages';
import { Logger } from './logger';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './components/ui/select';
import { ExtensionState } from './types';
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
    defaultTranslationMode: 'none' | 'tooltip' | 'full';
    defaultWordMode: 'none' | 'tooltip' | 'full';
    defaultAudioFeature: boolean;
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
        learningLanguage: 'en',
        defaultTranslationMode: 'none',
        defaultWordMode: 'none',
        defaultAudioFeature: false
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
            'learningLanguage',
            'defaultTranslationMode',
            'defaultWordMode',
            'defaultAudioFeature'
        ], (result) => {
            setSettings({
                enabled: result.enabled ?? false,
                translationMode: result.translationMode ?? 'none',
                wordMode: result.wordMode ?? 'none',
                usePanel: result.usePanel ?? false,
                autoOpenPanel: result.autoOpenPanel ?? false,
                useAudioFeature: result.useAudioFeature ?? false,
                nativeLanguage: result.nativeLanguage ?? 'ko',
                learningLanguage: result.learningLanguage ?? 'en',
                defaultTranslationMode: result.defaultTranslationMode ?? 'none',
                defaultWordMode: result.defaultWordMode ?? 'none',
                defaultAudioFeature: result.defaultAudioFeature ?? false
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

    const handleToggleEnabled = async () => {
        const newEnabled = !settings.enabled;
        const newSettings = {
            ...settings,
            enabled: newEnabled,
            // 활성화 시 기본 설정 정확히 적용
            translationMode: newEnabled ? settings.defaultTranslationMode : 'none',
            wordMode: newEnabled ? settings.defaultWordMode : 'none',
            useAudioFeature: newEnabled ? settings.defaultAudioFeature : false
        } as ExtensionState;
        
        // 전체 설정을 한 번에 저장
        await chrome.storage.sync.set(newSettings);
        setSettings(newSettings);
        
        // 현재 탭 새로고침
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            await chrome.tabs.reload(tab.id);
        }
    };

    return (
        <div className="p-4 bg-gray-900 text-white min-w-[300px]">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">{t('settings')}</h2>
            
            {/* 확장 프로그램 활성화 토글 - 컴팩트한 버전 */}
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={handleToggleEnabled}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <span className="text-sm text-gray-300">
                        {settings.enabled ? t('enabled') : t('disabled')}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>{t('shortcut')}:</span>
                    <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300">Alt+T</kbd>
                </div>
            </div>

          
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

            {/* 기본 모드 설정 섹션 */}
            <div className="space-y-4 mb-6 border-t border-gray-700 pt-4">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('defaultSettings')}</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-sm text-gray-400 block mb-1">{t('defaultTranslationMode')}</label>
                        <select
                            value={settings.defaultTranslationMode}
                            onChange={(e) => handleSettingChange('defaultTranslationMode', e.target.value)}
                            className="w-full bg-gray-700 text-white rounded px-3 py-1 text-sm"
                        >
                            <option value="none">{t('noTranslation')}</option>
                            <option value="tooltip">{t('tooltipMode')}</option>
                            <option value="full">{t('fullMode')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-gray-400 block mb-1">{t('defaultWordMode')}</label>
                        <select
                            value={settings.defaultWordMode}
                            onChange={(e) => handleSettingChange('defaultWordMode', e.target.value)}
                            className="w-full bg-gray-700 text-white rounded px-3 py-1 text-sm"
                        >
                            <option value="none">{t('noWordTranslation')}</option>
                            <option value="tooltip">{t('wordTooltipMode')}</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">{t('defaultAudioFeature')}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.defaultAudioFeature}
                                onChange={(e) => handleSettingChange('defaultAudioFeature', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                </div>
            </div>
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