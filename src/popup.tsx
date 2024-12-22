import React from 'react';
import ReactDOM from 'react-dom/client';
import { Card, CardContent } from "./components/ui/card";
import { Switch } from "./components/ui/switch";
import { ExtensionState } from './types';
import './styles.css';

const PopupApp: React.FC = () => {
    const [settings, setSettings] = React.useState<ExtensionState>({
        isEnabled: true,
        sourceLanguage: 'en',
        targetLanguage: 'ko'
    });

    const languages = [
        { label: '한국어', value: 'ko' },
        { label: '영어', value: 'en' },
        { label: '일본어', value: 'ja' }
    ];

    React.useEffect(() => {
        chrome.storage.sync.get(
            ['sourceLanguage', 'targetLanguage', 'isEnabled'],
            (result: Partial<ExtensionState>) => {
                setSettings(prev => ({
                    ...prev,
                    ...result
                }));
            }
        );
    }, []);

    const handleSettingChange = async (key: keyof ExtensionState, value: string | boolean) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        await chrome.storage.sync.set(newSettings);

        if (key === 'isEnabled') {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.id) {
                await chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'EXTENSION_STATE_CHANGED',
                    isEnabled: value
                });
            }
        }
    };

    const handleLanguageSwitch = () => {
        const newSettings = {
            ...settings,
            sourceLanguage: settings.targetLanguage,
            targetLanguage: settings.sourceLanguage
        };
        setSettings(newSettings);
        chrome.storage.sync.set(newSettings);
    };

    return (
        <div className="w-[320px] p-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-medium">번역 기능</span>
                            <Switch
                                checked={settings.isEnabled}
                                onCheckedChange={(checked) => handleSettingChange('isEnabled', checked)}
                            />
                        </div>
                        
                        <div className="flex flex-col gap-4">
                            <div className="relative">
                                <div className="flex flex-col gap-6">
                                    <fieldset className="flex flex-col gap-2">
                                        <legend className="text-sm font-medium mb-2">원본 언어</legend>
                                        <div className="grid grid-cols-2 gap-2">
                                            {languages.map((lang) => (
                                                <label key={lang.value} className="flex items-center space-x-2">
                                                    <input
                                                        type="radio"
                                                        name="sourceLanguage"
                                                        value={lang.value}
                                                        checked={settings.sourceLanguage === lang.value}
                                                        onChange={(e) => handleSettingChange('sourceLanguage', e.target.value)}
                                                        className="w-4 h-4 text-blue-500"
                                                    />
                                                    <span className="text-sm">{lang.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>

                                    <button
                                        onClick={handleLanguageSwitch}
                                        className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border border-gray-300 rounded-full shadow-sm hover:bg-gray-50 flex items-center justify-center"
                                        aria-label="언어 전환"
                                    >
                                        <svg 
                                            xmlns="http://www.w3.org/2000/svg" 
                                            width="16" 
                                            height="16" 
                                            viewBox="0 0 24 24" 
                                            fill="none" 
                                            stroke="currentColor" 
                                            strokeWidth="2" 
                                            strokeLinecap="round" 
                                            strokeLinejoin="round"
                                        >
                                            <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" />
                                        </svg>
                                    </button>

                                    <fieldset className="flex flex-col gap-2">
                                        <legend className="text-sm font-medium mb-2">번역할 언어</legend>
                                        <div className="grid grid-cols-2 gap-2">
                                            {languages.map((lang) => (
                                                <label key={lang.value} className="flex items-center space-x-2">
                                                    <input
                                                        type="radio"
                                                        name="targetLanguage"
                                                        value={lang.value}
                                                        checked={settings.targetLanguage === lang.value}
                                                        onChange={(e) => handleSettingChange('targetLanguage', e.target.value)}
                                                        className="w-4 h-4 text-blue-500"
                                                    />
                                                    <span className="text-sm">{lang.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        <React.StrictMode>
            <PopupApp />
        </React.StrictMode>
    );
} 