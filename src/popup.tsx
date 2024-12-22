import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { messages, Language } from './i18n/messages';

const PopupPanel: React.FC = () => {
    const [usePanel, setUsePanel] = useState(true);
    const [useTooltip, setUseTooltip] = useState(false);
    const [useFullMode, setUseFullMode] = useState(false);
    const [nativeLanguage, setNativeLanguage] = useState<Language>('ko');
    const [learningLanguage, setLearningLanguage] = useState<Language>('en');

    useEffect(() => {
        chrome.storage.sync.get(['usePanel', 'useTooltip', 'useFullMode', 'nativeLanguage', 'learningLanguage'], (result) => {
            setUsePanel(result.usePanel ?? true);
            setUseTooltip(result.useTooltip ?? false);
            setUseFullMode(result.useFullMode ?? false);
            setNativeLanguage((result.nativeLanguage as Language) || 'ko');
            setLearningLanguage((result.learningLanguage as Language) || 'en');
        });
    }, []);

    const t = (key: keyof typeof messages['en']) => {
        return messages[nativeLanguage][key];
    };

    const handlePanelToggle = async () => {
        const newValue = !usePanel;
        setUsePanel(newValue);
        await chrome.storage.sync.set({ usePanel: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { usePanel: newValue, useTooltip, useFullMode }
            });
        }
    };

    const handleTooltipToggle = async () => {
        const newValue = !useTooltip;
        setUseTooltip(newValue);
        await chrome.storage.sync.set({ useTooltip: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { usePanel, useTooltip: newValue, useFullMode }
            });
        }
    };

    const handleFullModeToggle = async () => {
        const newValue = !useFullMode;
        setUseFullMode(newValue);
        await chrome.storage.sync.set({ useFullMode: newValue });
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                settings: { usePanel, useTooltip, useFullMode: newValue }
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
                            ${usePanel 
                                ? 'bg-green-600 hover:bg-green-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {usePanel ? t('use') : t('notUse')}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('useTooltip')}</span>
                    <button
                        onClick={handleTooltipToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${useTooltip 
                                ? 'bg-purple-600 hover:bg-purple-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {useTooltip ? t('enabled') : t('disabled')}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">{t('useFullMode')}</span>
                    <button
                        onClick={handleFullModeToggle}
                        className={`
                            px-4 py-2 rounded-lg transition-all duration-300
                            ${useFullMode 
                                ? 'bg-orange-600 hover:bg-orange-700' 
                                : 'bg-gray-600 hover:bg-gray-700'
                            }
                        `}
                    >
                        {useFullMode ? t('enabled') : t('disabled')}
                    </button>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <span className="text-sm">{t('nativeLanguage')}</span>
                    <select 
                        value={nativeLanguage}
                        onChange={e => {
                            const newValue = e.target.value as Language;
                            setNativeLanguage(newValue);
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
                        value={learningLanguage}
                        onChange={e => {
                            const newValue = e.target.value as Language;
                            setLearningLanguage(newValue);
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