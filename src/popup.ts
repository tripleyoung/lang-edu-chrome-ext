import { ExtensionState } from './types';

class PopupManager {
    private targetLanguage: HTMLSelectElement;
    private extensionToggle: HTMLInputElement;

    constructor() {
        this.targetLanguage = document.getElementById('targetLanguage') as HTMLSelectElement;
        this.extensionToggle = document.getElementById('extensionToggle') as HTMLInputElement;
        
        this.initialize();
    }

    private initialize(): void {
        this.loadSettings();
        this.setupEventListeners();
    }

    private async loadSettings(): Promise<void> {
        const settings = await chrome.storage.sync.get([
            'targetLanguage',
            'enabled'
        ]) as ExtensionState;

        if (settings.learningLanguage) {
            this.targetLanguage.value = settings.learningLanguage;
        }
        if (typeof settings.enabled !== 'undefined') {
            this.extensionToggle.checked = settings.enabled;
        }
    }

    private setupEventListeners(): void {
        this.targetLanguage.addEventListener('change', () => this.saveSettings());
        this.extensionToggle.addEventListener('change', () => this.saveSettings());
    }

    private async saveSettings(): Promise<void> {
        await chrome.storage.sync.set({
            targetLanguage: this.targetLanguage.value,
            enabled: this.extensionToggle.checked
        });

        // 상태 변경 알림
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
            await chrome.tabs.sendMessage(tabs[0].id, {
                type: 'EXTENSION_STATE_CHANGED',
                enabled: this.extensionToggle.checked
            });
        }
    }
}

// 팝업 매니저 인스턴스 생성
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
}); 