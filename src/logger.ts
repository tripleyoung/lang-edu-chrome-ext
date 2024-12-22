export class Logger {
    private static instance: Logger | null = null;
    private logBuffer: string[] = [];
    private readonly MAX_BUFFER_SIZE = 1000;
    private readonly MAX_LOG_AGE = 24 * 60 * 60 * 1000; // 24시간

    private constructor() {
        // 시작 시 오래된 로그 정리
        this.cleanupOldLogs();
        
        // 주기적으로 로그를 저장
        setInterval(() => this.flushLogs(), 5000);
        // 주기적으로 오래된 로그 정리
        setInterval(() => this.cleanupOldLogs(), 60 * 60 * 1000); // 1시간마다
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    async log(source: string, message: string, data?: any): Promise<void> {
        try {
            const timestamp = new Date().toISOString();
            let logEntry = `[${timestamp}] [${source}] ${message}`;
            
            if (data) {
                if (typeof data === 'object') {
                    // 객체가 너무 큰 경우 요약
                    if (data instanceof Error) {
                        logEntry += ` Error: ${data.message}`;
                    } else if ('html' in data) {
                        logEntry += ` HTML Length: ${data.html.length}`;
                    } else {
                        logEntry += ` ${JSON.stringify(data, null, 2)}`;
                    }
                } else {
                    logEntry += ` ${data}`;
                }
            }

            this.logBuffer.push(logEntry);
            console.log(logEntry); // 콘솔에도 출력

            if (this.logBuffer.length >= this.MAX_BUFFER_SIZE) {
                await this.flushLogs();
            }
        } catch (error) {
            console.error('Failed to log:', error);
        }
    }

    private async cleanupOldLogs(): Promise<void> {
        try {
            const now = Date.now();
            const logs = await chrome.storage.local.get(null);
            
            // 오래된 로그 파일 삭제
            const oldLogs = Object.entries(logs)
                .filter(([key, value]) => {
                    if (!key.startsWith('logs_')) return false;
                    const timestamp = parseInt(key.split('_')[1]);
                    return (now - timestamp) > this.MAX_LOG_AGE;
                })
                .map(([key]) => key);

            if (oldLogs.length > 0) {
                await chrome.storage.local.remove(oldLogs);
                await this.log('Logger', `Cleaned up ${oldLogs.length} old log files`);
            }

            // 새로운 로그 파일 시작
            const newLogKey = `logs_${now}`;
            this.logBuffer = [];
            await this.log('Logger', 'New log session started');
            await this.log('Logger', '='.repeat(50));
        } catch (error) {
            console.error('Failed to cleanup logs:', error);
        }
    }

    private async flushLogs(): Promise<void> {
        if (this.logBuffer.length === 0) return;

        try {
            const now = Date.now();
            const logKey = `logs_${now}`;
            const newLogs = this.logBuffer.join('\n') + '\n';

            await chrome.storage.local.set({
                [logKey]: newLogs
            });

            this.logBuffer = [];
        } catch (error) {
            console.error('Failed to flush logs:', error);
        }
    }

    async downloadLogs(): Promise<void> {
        try {
            await this.flushLogs();

            const logs = await chrome.storage.local.get(null);
            const allLogs = Object.entries(logs)
                .filter(([key]) => key.startsWith('logs_'))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([_, value]) => value)
                .join('\n');

            if (!allLogs) {
                console.log('No logs found');
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            const blob = new Blob([allLogs], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `translation_logs_${today}.txt`;
            a.click();
            URL.revokeObjectURL(url);

            // 다운로드 후 로그 초기화
            await this.clearLogs();
        } catch (error) {
            console.error('Failed to download logs:', error);
        }
    }

    async clearLogs(): Promise<void> {
        try {
            await chrome.storage.local.remove('logs');
            this.logBuffer = [];
            this.log('Logger', 'Logs cleared');
        } catch (error) {
            console.error('Failed to clear logs:', error);
        }
    }
} 