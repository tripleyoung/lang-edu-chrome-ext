import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import * as Switch from '@radix-ui/react-switch';
import './styles.css';
import { messages, Language } from './i18n/messages';
import { Logger } from './logger';
const logger = Logger.getInstance();

interface Settings {
    usePanel: boolean;
    useTooltip: boolean;
    useFullMode: boolean;
    autoOpenPanel: boolean;
    useAudioFeature: boolean;
    useWordTooltip: boolean;
    nativeLanguage: Language;
    learningLanguage: Language;
}

// 메시지 타입 정의
type MessageType = typeof messages['ko'];
type MessageKey = keyof MessageType;

const PopupPanel: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({
        usePanel: true,
        useTooltip: false,
        useFullMode: false,
        autoOpenPanel: false,
        useAudioFeature: false,
        useWordTooltip: false,
        nativeLanguage: 'ko',
        learningLanguage: 'en'
    });

    useEffect(() => {
        chrome.storage.sync.get([
            'usePanel', 
            'useTooltip', 
            'useFullMode', 
            'autoOpenPanel', 
            'useAudioFeature',
            'useWordTooltip',
            'nativeLanguage',
            'learningLanguage'
        ], (result) => {
            setSettings({
                usePanel: result.usePanel ?? true,
                useTooltip: result.useTooltip ?? false,
                useFullMode: result.useFullMode ?? false,
                autoOpenPanel: result.autoOpenPanel ?? false,
                useAudioFeature: result.useAudioFeature ?? false,
                useWordTooltip: result.useWordTooltip ?? false,
                nativeLanguage: result.nativeLanguage ?? 'ko',
                learningLanguage: result.learningLanguage ?? 'en'
            });
        });
    }, []);

    // t 함수 수정
    const t = (key: MessageKey): string => {
        const currentLang = settings.nativeLanguage;
        const langMessages = messages[currentLang] as MessageType;
        return langMessages[key] || messages['en'][key];
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
        const newTooltip = !settings.useTooltip;
        const newSettings = { 
            ...settings, 
            useTooltip: newTooltip,
            useFullMode: newTooltip ? false : settings.useFullMode 
        };
        
        setSettings(newSettings);
        await chrome.storage.sync.set({ 
            useTooltip: newTooltip,
            useFullMode: newSettings.useFullMode 
        });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: newSettings
            });
        }
    };

    const handleFullModeToggle = async () => {
        try {
            const newFullMode = !settings.useFullMode;
            const newSettings = { 
                ...settings, 
                useFullMode: newFullMode,
                useTooltip: newFullMode ? false : settings.useTooltip 
            };
            
            setSettings(newSettings);
            await chrome.storage.sync.set({ 
                useFullMode: newFullMode,
                useTooltip: newSettings.useTooltip 
            });
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'UPDATE_SETTINGS',
                    settings: newSettings
                });
            }
        } catch (error) {
            logger.log('popup', 'Error toggling full mode', error);
        }
    };

    const handleAudioFeatureToggle = async () => {
        try {
            const newValue = !settings.useAudioFeature;
            const newSettings = { ...settings, useAudioFeature: newValue };
            setSettings(newSettings);
            
            // 스토리지에 설정 저장
            await chrome.storage.sync.set({ useAudioFeature: newValue });
            
            // 현재 활성 탭에 설정 변경 알림
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'UPDATE_SETTINGS',
                    settings: newSettings
                });
                
                // 음성 기능이 활성화되면 페이지 새로고침
                if (newValue) {
                    await chrome.tabs.reload(tab.id);
                }
            }
        } catch (error) {
            logger.log('popup', 'Error toggling audio feature', error);
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

    const handleWordTooltipToggle = async () => {
        const newValue = !settings.useWordTooltip;
        setSettings({ ...settings, useWordTooltip: newValue });
        await chrome.storage.sync.set({ useWordTooltip: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { ...settings, useWordTooltip: newValue }
            });
        }
    };

    const openTranslationPanel = async () => {
        await chrome.runtime.sendMessage({ type: 'OPEN_TRANSLATION_PANEL' });
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

    return (
        <div className="p-4 bg-gray-900 text-white min-w-[300px]">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">{t('settings')}</h2>
            
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('translationMode')}</h3>
                <div className="flex flex-col gap-2">
                    <button
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            !settings.useTooltip && !settings.useFullMode 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                        }`}
                        onClick={() => {
                            handleTooltipToggle();
                            handleFullModeToggle();
                        }}
                    >
                        {t('noTranslation')}
                    </button>
                    <button
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            settings.useTooltip 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                        }`}
                        onClick={handleTooltipToggle}
                    >
                        {t('tooltipMode')}
                    </button>
                    <button
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            settings.useFullMode 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                        }`}
                        onClick={handleFullModeToggle}
                    >
                        {t('fullMode')}
                    </button>
                </div>

                <h3 className="text-lg font-semibold text-gray-300 mt-4 mb-2">{t('additionalFeatures')}</h3>
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
                    <button
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            settings.useWordTooltip 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                        }`}
                        onClick={handleWordTooltipToggle}
                    >
                        {t('wordTooltip')}
                    </button>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <span className="text-gray-300">{t('panel')}</span>
                    <Switch.Root
                        checked={settings.usePanel}
                        onCheckedChange={handlePanelToggle}
                        className="w-11 h-6 bg-gray-600 rounded-full relative data-[state=checked]:bg-blue-600"
                    >
                        <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                    </Switch.Root>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-gray-300">{t('autoOpenPanel')}</span>
                    <Switch.Root
                        checked={settings.autoOpenPanel}
                        onCheckedChange={handleAutoOpenPanelToggle}
                    >
                        <Switch.Thumb />
                    </Switch.Root>
                </div>
            </div>

            <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">{t('languageSettings')}</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-300">{t('nativeLanguage')}</span>
                        <select
                            value={settings.nativeLanguage}
                            onChange={(e) => handleLanguageChange('nativeLanguage', e.target.value as Language)}
                            className="bg-gray-700 text-white rounded px-2 py-1"
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
                            className="bg-gray-700 text-white rounded px-2 py-1"
                        >
                            <option value="en">English</option>
                            <option value="ko">한국어</option>
                            <option value="ja">日本語</option>
                        </select>
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