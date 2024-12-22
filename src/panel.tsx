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
        <div className="p-4 bg-gray-900 text-white">
            <div className="mb-6">
                <h2 className="text-lg font-bold text-yellow-400 mb-2">원문</h2>
                <p className="bg-gray-800 p-3 rounded">{translationData.selectedText}</p>
            </div>

            <div className="mb-6">
                <h2 className="text-lg font-bold text-blue-400 mb-2">번역</h2>
                <p className="bg-gray-800 p-3 rounded">
                    {translationData.translation.translation || '번역 대기 중...'}
                </p>
            </div>

            {translationData.translation.words && translationData.translation.words.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-lg font-bold text-green-400 mb-4">단어 분석</h2>
                    <div className="space-y-4">
                        {translationData.translation.words.map((word, index) => (
                            <div key={index} className="bg-gray-800 p-4 rounded">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-bold text-white">{word.word}</h3>
                                    {word.phonetic && (
                                        <span className="text-gray-400">{word.phonetic}</span>
                                    )}
                                    {word.audioUrl && (
                                        <button
                                            onClick={() => new Audio(word.audioUrl).play()}
                                            className="p-2 rounded-full hover:bg-gray-700 text-yellow-400"
                                            title="발음 듣기"
                                        >
                                            🔊
                                        </button>
                                    )}
                                </div>
                                <div className="mt-2 space-y-2">
                                    {word.meanings.map((meaning, mIndex) => (
                                        <div key={mIndex} className="border-t border-gray-700 pt-2 mt-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-purple-400 font-medium">
                                                    {meaning.partOfSpeech}
                                                </span>
                                                {meaning.synonyms && meaning.synonyms.length > 0 && (
                                                    <span className="text-gray-400 text-sm">
                                                        동의어: {meaning.synonyms.join(', ')}
                                                    </span>
                                                )}
                                                {meaning.antonyms && meaning.antonyms.length > 0 && (
                                                    <span className="text-gray-400 text-sm">
                                                        반의어: {meaning.antonyms.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="ml-4 mt-2 space-y-3">
                                                {meaning.definitions.map((def, dIndex) => (
                                                    <div key={dIndex} className="text-gray-300">
                                                        <p className="mb-1">
                                                            {dIndex + 1}. {def.definition}
                                                        </p>
                                                        {def.example && (
                                                            <p className="text-gray-400 italic ml-4">
                                                                예문: {def.example}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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