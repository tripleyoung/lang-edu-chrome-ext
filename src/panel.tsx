import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Logger } from './logger';
import { TranslationResponse, Word, Idiom } from './types';
import './styles.css';

const logger = Logger.getInstance();

interface TranslationData {
    text: string;
    translation: string;
    grammar: string;
    definition: string;
    words: Array<{
        word: string;
        phonetic?: string;
        audioUrl?: string;
        meanings: Array<{
            partOfSpeech: string;
            definitions: Array<{
                definition: string;
                example?: string;
            }>;
            synonyms: string[];
            antonyms: string[];
        }>;
    }>;
    idioms: any[];
}

interface WordInfo {
    word: string;
    phonetic: string;
    audioUrl: string;
    meanings: {
        partOfSpeech: string;
        definitions: {
            definition: string;
            example?: string;
        }[];
        examples: string[];
    }[];
}

const WordAnalysis: React.FC<{ wordInfo: WordInfo }> = ({ wordInfo }) => {
    const playAudio = () => {
        if (wordInfo.audioUrl) {
            new Audio(wordInfo.audioUrl).play();
        }
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
            <div className="flex items-center gap-3 mb-4">
                <h3 className="text-xl font-bold">{wordInfo.word}</h3>
                {wordInfo.phonetic && (
                    <span className="text-gray-400">{wordInfo.phonetic}</span>
                )}
                {wordInfo.audioUrl && (
                    <button 
                        onClick={playAudio}
                        className="text-blue-400 hover:text-blue-300"
                    >
                        🔊
                    </button>
                )}
            </div>
            
            <div className="space-y-4">
                {wordInfo.meanings.map((meaning, idx) => (
                    <div key={idx} className="border-t border-gray-700 pt-3">
                        <div className="text-yellow-500 italic mb-2">
                            {meaning.partOfSpeech}
                        </div>
                        <ul className="space-y-2">
                            {meaning.definitions.map((def, defIdx) => (
                                <li key={defIdx}>
                                    <div className="text-white">
                                        {def.definition}
                                    </div>
                                    {def.example && (
                                        <div className="text-gray-400 text-sm mt-1">
                                            예: {def.example}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TranslationPanel: React.FC = () => {
    const [translationData, setTranslationData] = useState<TranslationData | null>(null);
    const [wordInfo, setWordInfo] = useState<WordInfo | null>(null);

    useEffect(() => {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            logger.log('panel', 'Received message in panel', { 
                type: message.type, 
                data: message.data,
                sender 
            });

            if (message.type === 'UPDATE_TRANSLATION') {
                setTranslationData(message.data);
                sendResponse({ success: true });
            }

            if (message.type === 'SEND_WORD_INFO') {
                logger.log('panel', 'Processing word info', {
                    word: message.data.word,
                    meanings: message.data.meanings?.length || 0,
                    hasPhonetic: !!message.data.phonetic,
                    hasAudio: !!message.data.audioUrl
                });
                setWordInfo(message.data);
                sendResponse({ success: true });
            }

            return true;
        });
    }, []);

    const playAudio = (url?: string) => {
        if (url) {
            new Audio(url).play();
        }
    };

    if (!translationData) {
        return (
            <div className="flex items-center justify-center bg-gray-900 text-white min-h-screen">
                <div className="text-center w-full px-4">
                    <h2 className="text-xl font-bold text-yellow-400 mb-2">번역 패널</h2>
                    <p className="text-gray-400 text-sm">텍스트에 마우스를 올리면 번역이 시작됩니다.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 bg-gray-900 text-white min-h-screen">
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-yellow-400 mb-2">학습 언어</h2>
                    <p className="bg-gray-800 p-3 rounded">{translationData.text}</p>
                </div>
                <div>
                    <h2 className="text-lg font-bold text-blue-400 mb-2">모국어</h2>
                    <p className="bg-gray-800 p-3 rounded">{translationData.translation}</p>
                </div>
            </div>

            {translationData.words && translationData.words.length > 0 && (
                <div className="mt-8">
                    <h2 className="text-lg font-bold text-green-400 mb-4">단어 분석</h2>
                    <div className="space-y-6">
                        {translationData.words.map((word, index) => (
                            <div key={index} className="bg-gray-800 p-4 rounded">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-xl font-bold text-white">{word.word}</h3>
                                    {word.phonetic && (
                                        <span className="text-gray-400">{word.phonetic}</span>
                                    )}
                                    {word.audioUrl && (
                                        <button
                                            onClick={() => playAudio(word.audioUrl)}
                                            className="text-blue-400 hover:text-blue-300"
                                        >
                                            🔊
                                        </button>
                                    )}
                                </div>
                                
                                {word.meanings.map((meaning, mIndex) => (
                                    <div key={mIndex} className="mt-3">
                                        <div className="text-purple-400 font-semibold">
                                            {meaning.partOfSpeech}
                                        </div>
                                        <ul className="list-disc list-inside mt-2 space-y-2">
                                            {meaning.definitions.map((def, dIndex) => (
                                                <li key={dIndex} className="text-gray-300">
                                                    <span className="text-white">{def.definition}</span>
                                                    {def.example && (
                                                        <p className="ml-4 text-gray-400 italic">
                                                            "{def.example}"
                                                        </p>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                        {meaning.synonyms.length > 0 && (
                                            <div className="mt-2 text-gray-400">
                                                <span className="text-gray-500">유의어: </span>
                                                {meaning.synonyms.join(", ")}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {wordInfo && <WordAnalysis wordInfo={wordInfo} />}
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