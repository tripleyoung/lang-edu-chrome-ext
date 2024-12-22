import React from 'react';
import ReactDOM from 'react-dom/client';
import { Card, CardContent } from "./components/ui/card";
import { Switch } from "./components/ui/switch";
import { ExtensionState } from './types';
import './styles.css';

const PopupApp: React.FC = () => {
    const [settings, setSettings] = React.useState<ExtensionState>({
        isEnabled: true,
        targetLanguage: 'ko'
    });

    const languages = [
        { label: '한국어', value: 'ko' },
        { label: '영어', value: 'en' },
        { label: '일본어', value: 'ja' }
    ];

    React.useEffect(() => {
        chrome.storage.sync.get(
            ['targetLanguage', 'isEnabled'],
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
                        
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">번역할 언어</label>
                            <select
                                value={settings.targetLanguage}
                                onChange={(e) => handleSettingChange('targetLanguage', e.target.value)}
                                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {languages.map((lang) => (
                                    <option key={lang.value} value={lang.value}>
                                        {lang.label}
                                    </option>
                                ))}
                            </select>
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