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
    const [isReaderMode, setIsReaderMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showInTooltip, setShowInTooltip] = useState(false);

    const toggleReaderMode = async () => {
        try {
            setIsLoading(true);
            const newMode = !isReaderMode;

            // 1. 즉시 UI 상태 업데이트
            setIsReaderMode(newMode);

            logger.log('panel', 'Sending toggle message', { newMode });

            // 2. background script에 메시지 전송
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'TOGGLE_READER_MODE',
                    enabled: newMode
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        logger.log('panel', 'Error sending message', chrome.runtime.lastError);
                        resolve(false);
                    } else {
                        logger.log('panel', 'Message sent successfully', response);
                        resolve(true);
                    }
                });
            });

            logger.log('panel', 'Toggle response received', { response });

            if (!newMode) {
                setTranslationData({
                    selectedText: '텍스트에 마우스를 올리면 번역이 시작됩니다.',
                    translation: {
                        translation: '호버 모드가 활성화되었습니다.',
                        grammar: '문법 분석이 활성화되었습니다.',
                        definition: '단어 분석이 활성화되었습니다.',
                        words: [],
                        idioms: []
                    }
                });
            }
        } catch (error) {
            logger.log('panel', 'Failed to toggle mode', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDisplayMode = () => {
        setShowInTooltip(!showInTooltip);
    };

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
                    <div className="flex justify-end mb-4 gap-2">
                        <button
                            onClick={toggleDisplayMode}
                            className={`
                                px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-300
                                ${showInTooltip 
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                }
                            `}
                        >
                            💬 {showInTooltip ? '툴팁 모드' : '패널 모드'}
                        </button>

                        <button
                            onClick={toggleReaderMode}
                            disabled={isLoading}
                            className={`
                                px-4 py-2 rounded-lg flex items-center gap-2
                                ${isReaderMode 
                                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                }
                            `}
                        >
                            📖 {isReaderMode ? '읽기 ON' : '읽기 OFF'}
                        </button>
                    </div>

                    {!showInTooltip && (
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
                    )}
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