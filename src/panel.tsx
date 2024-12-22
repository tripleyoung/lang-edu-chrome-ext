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

    const toggleReaderMode = async () => {
        try {
            setIsLoading(true);
            const newMode = !isReaderMode;

            // 1. 즉시 UI 상태 업데이트
            setIsReaderMode(newMode);
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

            // 2. 백그라운드로 모드 전환 메시지 전송
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'TOGGLE_READER_MODE',
                    enabled: newMode
                });
            }, 0);

            // 3. 로딩 상태 빠르게 해제
            setTimeout(() => {
                setIsLoading(false);
            }, 100);

            logger.log('panel', `Mode changed to ${newMode ? 'reader' : 'hover'} mode`);
        } catch (error) {
            logger.log('panel', 'Failed to toggle mode', error);
            setIsLoading(false);
        }
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
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-yellow-400">번역 패널</h2>
                    <p className="text-gray-400 mt-4">텍스트에 마우스 올리면 번역 결과가 여기에 표시됩니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-gray-900 text-white min-h-screen">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-end mb-4">
                    <button
                        onClick={toggleReaderMode}
                        disabled={isLoading}
                        className={`
                            px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-300
                            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                            ${isReaderMode 
                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                            }
                            relative
                        `}
                    >
                        <div className={`
                            absolute left-2 w-6 h-6 rounded-full transition-all duration-300
                            flex items-center justify-center
                            ${isReaderMode ? 'bg-white text-green-600' : 'bg-gray-400 text-white'}
                        `}>
                            {isLoading ? '⌛' : '📖'}
                        </div>
                        <span className="ml-8">
                            {isReaderMode ? '읽기 모드 ON' : '읽기 모드 OFF'}
                        </span>
                    </button>
                </div>

                {!isReaderMode && (
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-xl font-bold text-yellow-400 mb-3">원문</h3>
                            <div className="bg-gray-800 rounded-lg p-4">
                                {translationData.selectedText}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-blue-400 mb-3">번역</h3>
                            <div className="bg-gray-800 rounded-lg p-4">
                                {translationData.translation.translation}
                            </div>
                        </div>
                    </div>
                )}

                {isReaderMode && (
                    <div className="space-y-6">
                        <div className="bg-gray-800 rounded-lg p-6">
                            <h3 className="text-xl font-bold text-yellow-400 mb-4">전체 텍스트</h3>
                            <div className="whitespace-pre-wrap text-gray-200 leading-relaxed max-h-[70vh] overflow-y-auto">
                                {translationData.selectedText}
                            </div>
                        </div>
                    </div>
                )}
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