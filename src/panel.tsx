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
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-yellow-400">번역 패널</h2>
                    <p className="text-gray-400 mt-4">텍스트에 마우스를 올리면 번역 결과가 여기에 표시됩니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-gray-900 text-white min-h-screen">
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-2 gap-6 mb-6">
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
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-xl font-bold text-green-400 mb-3">문법 설명</h3>
                        <div className="bg-gray-800 rounded-lg p-4">
                            {translationData.translation.grammar}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-red-400 mb-3">단어/관용구</h3>
                        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                            {translationData.translation.words.map((word: Word, index: number) => (
                                <div key={`word-${index}`} className="flex items-center justify-between">
                                    <div>
                                        <span className="text-red-400">{word.word}</span>
                                        <span className="text-gray-500 ml-2">[{word.pronunciation}]</span>
                                        <span className="ml-2">- {word.meaning}</span>
                                    </div>
                                    {word.audioUrl && (
                                        <button 
                                            onClick={() => new Audio(word.audioUrl).play()}
                                            className="p-2 hover:bg-gray-700 rounded-full"
                                        >
                                            🔊
                                        </button>
                                    )}
                                </div>
                            ))}
                            {translationData.translation.idioms.map((idiom: Idiom, index: number) => (
                                <div key={`idiom-${index}`} className="flex items-center justify-between">
                                    <div>
                                        <span className="text-red-400">{idiom.idiom}</span>
                                        <span className="text-gray-500 ml-2">[{idiom.pronunciation}]</span>
                                        <span className="ml-2">- {idiom.meaning}</span>
                                    </div>
                                    {idiom.audioUrl && (
                                        <button 
                                            onClick={() => new Audio(idiom.audioUrl).play()}
                                            className="p-2 hover:bg-gray-700 rounded-full"
                                        >
                                            🔊
                                        </button>
                                    )}
                                </div>
                            ))}
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