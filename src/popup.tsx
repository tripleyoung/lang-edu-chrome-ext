import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { messages, Language } from './i18n/messages';

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
        const newValue = !settings.useTooltip;
        setSettings({ ...settings, useTooltip: newValue });
        await chrome.storage.sync.set({ useTooltip: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { ...settings, useTooltip: newValue }
            });
        }
    };

    const handleFullModeToggle = async () => {
        const newValue = !settings.useFullMode;
        setSettings({ ...settings, useFullMode: newValue });
        await chrome.storage.sync.set({ useFullMode: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { ...settings, useFullMode: newValue }
            });
        }
    };

    const handleAudioFeatureToggle = async () => {
        const newValue = !settings.useAudioFeature;
        setSettings({ ...settings, useAudioFeature: newValue });
        await chrome.storage.sync.set({ useAudioFeature: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { ...settings, useAudioFeature: newValue }
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

    return (
        <div className="p-4 bg-gray-900 text-white min-w-[300px]">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">{t('settings')}</h2>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('usePanel')}</span>
                    <button
                        onClick={handlePanelToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${settings.usePanel 
                                ? 'bg-green-600 hover:bg-green-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {settings.usePanel ? t('use') : t('notUse')}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('useTooltip')}</span>
                    <button
                        onClick={handleTooltipToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${settings.useTooltip 
                                ? 'bg-purple-600 hover:bg-purple-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {settings.useTooltip ? t('enabled') : t('disabled')}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('useFullMode')}</span>
                    <button
                        onClick={handleFullModeToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${settings.useFullMode 
                                ? 'bg-orange-600 hover:bg-orange-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {settings.useFullMode ? t('enabled') : t('disabled')}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('useAudioFeature')}</span>
                    <button
                        onClick={handleAudioFeatureToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${settings.useAudioFeature 
                                ? 'bg-blue-600 hover:bg-blue-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {settings.useAudioFeature ? t('enabled') : t('disabled')}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('useWordTooltip')}</span>
                    <button
                        onClick={handleWordTooltipToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${settings.useWordTooltip 
                                ? 'bg-pink-600 hover:bg-pink-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {settings.useWordTooltip ? t('enabled') : t('disabled')}
                    </button>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <span className="text-sm">{t('nativeLanguage')}</span>
                    <select 
                        value={settings.nativeLanguage}
                        onChange={e => {
                            const newValue = e.target.value as Language;
                            setSettings({ ...settings, nativeLanguage: newValue });
                            chrome.storage.sync.set({ nativeLanguage: newValue });
                        }}
                        className="px-4 py-2 rounded-lg bg-gray-700 text-white"
                    >
                        <option value="ko">한국어</option>
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                    </select>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <span className="text-sm">{t('learningLanguage')}</span>
                    <select 
                        value={settings.learningLanguage}
                        onChange={e => {
                            const newValue = e.target.value as Language;
                            setSettings({ ...settings, learningLanguage: newValue });
                            chrome.storage.sync.set({ learningLanguage: newValue });
                        }}
                        className="px-4 py-2 rounded-lg bg-gray-700 text-white"
                    >
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                        <option value="ko">한국어</option>
                    </select>
                </div>

                <div className="mt-6">
                    <button
                        onClick={openTranslationPanel}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-300"
                    >
                        {t('openPanel')}
                    </button>
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