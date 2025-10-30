// ========================================
// 設定・定数
// ========================================

const CONFIG = {
    GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxUuGJnGPeBYBHt2FcQfBjemCfoWewge-zZ1rZazFU7yENiYE6SMZXWEVNDxWp1o6zm/exec',
    USER_ID: 'user01',
    USER_NAME: 'konaka33',
    APP_URL: 'https://konaka33.github.io/attendance-app',
    TIMEOUT: 10000, // 10秒
    RETRY_COUNT: 3,
    RETRY_DELAY: 1000, // 1秒
    STORAGE_KEYS: {
        USER_INFO: 'user_info',
        TODAY_ATTENDANCE: 'today_attendance'
    }
};

// エラーメッセージ（日本語化）
const ERROR_MESSAGES = {
    'NetworkError': 'インターネット接続を確認してください',
    'TimeoutError': '通信がタイムアウトしました。再度お試しください',
    'ServerError': 'サーバーエラーが発生しました。しばらくしてから再度お試しください',
    'AlreadyClockedIn': '既に出勤済みです',
    'NotClockedIn': '出勤記録がありません。先に出勤打刻してください',
    'InvalidTime': '時刻が不正です',
    'Unknown': '予期しないエラーが発生しました'
};

// ========================================
// グローバル変数
// ========================================

let todayRecord = {
    date: '',
    clockIn: null,
    clockOut: null,
    workingHours: null
};

// ========================================
// 初期化
// ========================================

/**
 * アプリケーション初期化
 */
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

/**
 * グローバルエラーハンドラ
 */
window.addEventListener('error', (event) => {
    console.error('グローバルエラー:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未処理のPromise rejection:', event.reason);
});

/**
 * 初期化処理
 */
function initApp() {
    // 現在時刻の表示開始
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // 本日の記録を取得
    loadTodayRecord();

    // イベントリスナー設定
    document.getElementById('clock-in-btn').addEventListener('click', handleClockIn);
    document.getElementById('clock-out-btn').addEventListener('click', handleClockOut);
    document.getElementById('complete-btn').addEventListener('click', handleCompleteTask);

    // オンライン/オフライン監視
    window.addEventListener('online', () => {
        showToast('オンラインに復帰しました', 'success');
    });

    window.addEventListener('offline', () => {
        showToast('オフラインです', 'error');
    });

    console.log('出退勤打刻アプリが起動しました');
}

// ========================================
// 時刻関連
// ========================================

/**
 * 現在時刻を更新して表示
 */
function updateCurrentTime() {
    const now = new Date();

    // 時刻フォーマット（HH:mm:ss）
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    // 日付フォーマット（YYYY/MM/DD）
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateString = `${year}/${month}/${day}`;

    document.getElementById('time-value').textContent = timeString;
    document.getElementById('date-value').textContent = dateString;
}

/**
 * 現在のタイムスタンプを取得
 * @returns {string} YYYY/MM/DD HH:mm 形式
 */
function getCurrentTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * 今日の日付を取得
 * @returns {string} YYYY/MM/DD 形式
 */
function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}/${month}/${day}`;
}

/**
 * 勤務時間を計算
 * @param {string} clockIn - 出勤時刻（HH:mm）
 * @param {string} clockOut - 退勤時刻（HH:mm）
 * @returns {string} X時間Y分 形式
 */
function calculateWorkingHours(clockIn, clockOut) {
    const [inHour, inMin] = clockIn.split(':').map(Number);
    const [outHour, outMin] = clockOut.split(':').map(Number);

    const inMinutes = inHour * 60 + inMin;
    const outMinutes = outHour * 60 + outMin;

    const diffMinutes = outMinutes - inMinutes;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    return `${hours}時間${minutes}分`;
}

// ========================================
// API通信（リトライ機能付き）
// ========================================

/**
 * スリープ関数
 * @param {number} ms - ミリ秒
 * @returns {Promise}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * リトライ機能付きFetch
 * @async
 * @param {string} url - リクエストURL
 * @param {Object} options - Fetchオプション
 * @param {number} retries - リトライ回数
 * @returns {Promise<Response>}
 * @throws {Error} 全リトライ失敗時
 */
async function fetchWithRetry(url, options, retries = CONFIG.RETRY_COUNT) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok && i < retries - 1) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error(`リトライ ${i + 1}/${retries}:`, error);

            if (i === retries - 1) {
                // 最後のリトライも失敗
                if (error.name === 'AbortError') {
                    throw new Error('TimeoutError');
                }
                throw new Error('NetworkError');
            }

            // 指数バックオフで待機
            await sleep(CONFIG.RETRY_DELAY * (i + 1));
        }
    }
}

/**
 * GAS APIにPOSTリクエスト送信
 * @async
 * @param {Object} data - 送信データ
 * @returns {Promise<Object>} レスポンスJSON
 * @throws {Error} API通信エラー
 */
async function sendToGAS(data) {
    if (!CONFIG.GAS_WEB_APP_URL) {
        throw new Error('GAS_WEB_APP_URLが設定されていません');
    }

    if (!navigator.onLine) {
        throw new Error('NetworkError');
    }

    const response = await fetchWithRetry(CONFIG.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.status === 'error') {
        throw new Error(result.message || 'ServerError');
    }

    return result;
}

// ========================================
// 出勤打刻
// ========================================

/**
 * 出勤打刻処理
 * @async
 */
async function handleClockIn() {
    try {
        console.log('出勤ボタンがクリックされました');
        console.log('現在のtodayRecord:', todayRecord);

        // バリデーション（二重打刻防止）
        if (todayRecord.clockIn && !todayRecord.clockOut) {
            console.log('二重打刻防止: 既に出勤済み');
            showToast(ERROR_MESSAGES.AlreadyClockedIn, 'error');
            return;
        }

        console.log('バリデーション通過');

        // ローディング表示
        showLoading();
        console.log('ローディング表示完了');

        const timestamp = getCurrentTimestamp();
        console.log('タイムスタンプ取得:', timestamp);

        const time = timestamp.split(' ')[1]; // HH:mm部分
        console.log('時刻抽出:', time);

        console.log('GASに送信開始:', {
            action: 'clock_in',
            userId: CONFIG.USER_ID,
            name: CONFIG.USER_NAME,
            timestamp: timestamp
        });

        // GASに送信
        const result = await sendToGAS({
            action: 'clock_in',
            userId: CONFIG.USER_ID,
            name: CONFIG.USER_NAME,
            timestamp: timestamp
        });

        console.log('GASからのレスポンス:', result);

        // ローカルデータ更新
        todayRecord = {
            date: getTodayDate(),
            clockIn: time,
            clockOut: null,
            workingHours: null
        };
        saveToLocalStorage();

        // UI更新
        updateRecordDisplay();
        updateButtonStates();

        // 成功メッセージ
        showToast('✅ 出勤を記録しました', 'success');

        // バイブレーション（モバイル）
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }

    } catch (error) {
        console.error('出勤打刻エラー:', error);
        console.error('エラー詳細:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        const message = ERROR_MESSAGES[error.message] || ERROR_MESSAGES.Unknown;
        showToast(`❌ ${message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// 退勤打刻
// ========================================

/**
 * 退勤打刻処理
 * @async
 */
async function handleClockOut() {
    try {
        // バリデーション
        if (!todayRecord.clockIn) {
            showToast(ERROR_MESSAGES.NotClockedIn, 'error');
            return;
        }

        if (todayRecord.clockOut) {
            showToast('既に退勤済みです', 'error');
            return;
        }

        // ローディング表示
        showLoading();

        const timestamp = getCurrentTimestamp();
        const time = timestamp.split(' ')[1]; // HH:mm部分

        // 勤務時間計算
        const workingHours = calculateWorkingHours(todayRecord.clockIn, time);

        // GASに送信
        const result = await sendToGAS({
            action: 'clock_out',
            userId: CONFIG.USER_ID,
            name: CONFIG.USER_NAME,
            timestamp: timestamp
        });

        // ローカルデータ更新
        todayRecord.clockOut = time;
        todayRecord.workingHours = workingHours;
        saveToLocalStorage();

        // UI更新
        updateRecordDisplay();
        updateButtonStates();

        // 成功メッセージ
        showToast(`✅ 退勤を記録しました（${workingHours}）`, 'success');

        // バイブレーション（モバイル）
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }

    } catch (error) {
        console.error('退勤打刻エラー:', error);
        const message = ERROR_MESSAGES[error.message] || ERROR_MESSAGES.Unknown;
        showToast(`❌ ${message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// 課題完了報告
// ========================================

/**
 * 課題完了報告処理
 * @async
 */
async function handleCompleteTask() {
    try {
        if (!confirm('課題完了報告を送信しますか？')) {
            return;
        }

        // ローディング表示
        showLoading();

        const timestamp = getCurrentTimestamp();

        // GASに送信
        const result = await sendToGAS({
            action: 'complete_task',
            userId: CONFIG.USER_ID,
            name: CONFIG.USER_NAME,
            appUrl: CONFIG.APP_URL,
            timestamp: timestamp
        });

        // 成功メッセージ
        showToast('🎉 課題完了報告を送信しました！', 'success');

    } catch (error) {
        console.error('課題完了報告エラー:', error);
        const message = ERROR_MESSAGES[error.message] || ERROR_MESSAGES.Unknown;
        showToast(`❌ ${message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// データ管理
// ========================================

/**
 * 本日の記録を読み込み
 */
function loadTodayRecord() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.TODAY_ATTENDANCE);

    if (stored) {
        const data = JSON.parse(stored);

        // 日付チェック
        if (data.date === getTodayDate()) {
            todayRecord = data;
        } else {
            // 日付が変わっている場合はリセット
            todayRecord = {
                date: getTodayDate(),
                clockIn: null,
                clockOut: null,
                workingHours: null
            };
            saveToLocalStorage();
        }
    }

    // UI更新
    updateRecordDisplay();
    updateButtonStates();
}

/**
 * localStorageに保存
 */
function saveToLocalStorage() {
    localStorage.setItem(
        CONFIG.STORAGE_KEYS.TODAY_ATTENDANCE,
        JSON.stringify(todayRecord)
    );
}

// ========================================
// UI更新
// ========================================

/**
 * 本日の記録表示を更新
 */
function updateRecordDisplay() {
    document.getElementById('clock-in-time').textContent = todayRecord.clockIn || '--:--';
    document.getElementById('clock-out-time').textContent = todayRecord.clockOut || '--:--';
    document.getElementById('working-hours').textContent = todayRecord.workingHours || '--';
}

/**
 * ボタンの有効/無効状態を更新
 */
function updateButtonStates() {
    const clockInBtn = document.getElementById('clock-in-btn');
    const clockOutBtn = document.getElementById('clock-out-btn');

    if (todayRecord.clockIn && !todayRecord.clockOut) {
        // 出勤済み、未退勤
        clockInBtn.disabled = true;
        clockOutBtn.disabled = false;
    } else if (todayRecord.clockOut) {
        // 退勤済み
        clockInBtn.disabled = true;
        clockOutBtn.disabled = true;
    } else {
        // 未出勤
        clockInBtn.disabled = false;
        clockOutBtn.disabled = true;
    }
}

/**
 * ローディング表示
 */
function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

/**
 * ローディング非表示
 */
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

/**
 * トースト通知表示
 * @param {string} message - メッセージ
 * @param {string} type - success/error/info
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    // 表示
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // 3秒後に非表示
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * エラーメッセージを取得
 * @param {Error} error - エラーオブジェクト
 * @returns {string} 日本語エラーメッセージ
 */
function getErrorMessage(error) {
    return ERROR_MESSAGES[error.message] || ERROR_MESSAGES.Unknown;
}
