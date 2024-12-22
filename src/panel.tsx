import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Logger } from './logger';
import { TranslationResponse, Word, Idiom } from './types';
import './styles.css';

const logger = Logger.getInstance();

interface TranslationData {
    selectedText: string;
    translation: TranslationResponse;
}

const TranslationPanel: React.FC = () => {
    const [translationData, setTranslationData] = useState<TranslationData | null>(null);

    useEffect(() => {
        logger.log('panel', 'Panel component mounted');

        // 메시지 리스너 등록
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            logger.log('panel', 'Received message', message);
            
            if (message.type === 'UPDATE_TRANSLATION') {
                setTranslationData(message.data);
                sendResponse({ success: true });
            }
            return true;
        });
    }, []);

    if (!translationData) {
        return (
            <div className="flex items-center justify-center bg-gray-900 text-white" style={{ minHeight: '100vh' }}>
                <div className="text-center w-full px-4">
                    <h2 className="text-xl font-bold text-yellow-400 mb-2">번역 패널</h2>
                    <p className="text-gray-400 text-sm">텍스트에 마우스를 올리면 번역이 시작됩니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col bg-gray-900 text-white min-h-screen">
            <div className="flex-1 flex items-center justify-center">
                <div className="w-full px-3">
                    <div className="flex flex-col gap-4">
                        <div>
                            <h3 className="text-sm font-bold text-yellow-400 mb-2">원문</h3>
                            <div className="bg-gray-800 rounded p-3 text-sm">
                                {translationData.selectedText}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-blue-400 mb-2">번역</h3>
                            <div className="bg-gray-800 rounded p-3 text-sm">
                                {translationData.translation.translation}
                            </div>
                        </div>
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
            <TranslationPanel />
        </React.StrictMode>
    );
} 