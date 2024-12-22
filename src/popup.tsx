import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const PopupPanel: React.FC = () => {
    const [usePanel, setUsePanel] = useState(true);
    const [useTooltip, setUseTooltip] = useState(false);
    const [useFullMode, setUseFullMode] = useState(false);
    const [targetLanguage, setTargetLanguage] = useState('ko');

    useEffect(() => {
        // 저장된 설정 불러오기
        chrome.storage.sync.get(['usePanel', 'useTooltip', 'useFullMode', 'targetLanguage'], (result) => {
            setUsePanel(result.usePanel ?? true);
            setUseTooltip(result.useTooltip ?? false);
            setUseFullMode(result.useFullMode ?? false);
            setTargetLanguage(result.targetLanguage ?? 'ko');
        });
    }, []);

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

    const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newValue = e.target.value;
        setTargetLanguage(newValue);
        await chrome.storage.sync.set({ targetLanguage: newValue });
    };

    const openTranslationPanel = async () => {
        await chrome.runtime.sendMessage({ type: 'OPEN_TRANSLATION_PANEL' });
    };

    return (
        <div className="p-4 bg-gray-900 text-white min-w-[300px]">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">번역 설정</h2>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm">번역 패널 사용</span>
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
                        {usePanel ? '사용' : '미사용'}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">툴팁 모드</span>
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
                        {useTooltip ? '활성화' : '비활성화'}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm">전체 번역 모드</span>
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
                        {useFullMode ? '활성화' : '비활성화'}
                    </button>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <span className="text-sm">번역 언어</span>
                    <select 
                        value={targetLanguage}
                        onChange={handleLanguageChange}
                        className="px-4 py-2 rounded-lg bg-gray-700 text-white"
                    >
                        <option value="ko">한국어</option>
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                        <option value="zh">中文</option>
                        <option value="es">Español</option>
                        <option value="fr">Français</option>
                    </select>
                </div>

                <div className="mt-6">
                    <button
                        onClick={openTranslationPanel}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-300"
                    >
                        번역 패널 열기
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