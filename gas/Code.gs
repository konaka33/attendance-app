/**
 * Google Apps Script - 出退勤打刻アプリ連携用コード
 *
 * 【セットアップ手順】
 * 1. Google Driveで新しいスプレッドシートを作成
 * 2. 「拡張機能」→「Apps Script」を開く
 * 3. このコードを貼り付け
 * 4. LINE_CHANNEL_ACCESS_TOKEN と LINE_GROUP_ID を設定
 * 5. 「デプロイ」→「新しいデプロイ」を選択
 * 6. 種類: ウェブアプリ
 * 7. 次のユーザーとして実行: 自分
 * 8. アクセスできるユーザー: 全員
 * 9. デプロイして、URLをコピー
 * 10. main.js の CONFIG.GAS_WEB_APP_URL にURLを設定
 */

// ========================================
// 設定
// ========================================

const LINE_CHANNEL_ACCESS_TOKEN = 'YOZ7UftinQaO3OyBDaloYu4cXzhYtLzmqBzAGNvCIJRg7h+DoqsX0n6OXdfOFZ9vI7/+VIOKgdWLHJ6yBmeAi6kPqz4+FZ3vpHQTBEAQSHA81c9tQLH/8oP8UUyRpnHxvmJ0QlaAjZWiraJeO38tBgdB04t89/1O/w1cDnyilFU=';
const LINE_GROUP_ID = 'C5a5b36e27a78ed6cfbb74839a8a9d04e';

// ========================================
// メイン処理
// ========================================

/**
 * POST リクエスト処理
 * @param {Object} e - リクエストオブジェクト
 * @returns {Object} JSON レスポンス
 */
function doPost(e) {
  try {
    // リクエストボディを解析
    if (!e || !e.postData || !e.postData.contents) {
      Logger.log('Error: postData is undefined');
      Logger.log('Event object:', JSON.stringify(e));
      return createErrorResponse('リクエストデータが不正です');
    }

    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;

    Logger.log(`Action: ${action}`);
    Logger.log(`Request:`, requestData);

    let result;

    switch (action) {
      case 'clock_in':
        result = handleClockIn(requestData);
        break;

      case 'clock_out':
        result = handleClockOut(requestData);
        break;

      case 'get_today':
        result = handleGetToday(requestData);
        break;

      case 'complete_task':
        result = handleCompleteTask(requestData);
        break;

      default:
        return createErrorResponse('不明なアクションです');
    }

    return createSuccessResponse(result);

  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return createErrorResponse('サーバーエラー: ' + error.toString());
  }
}

/**
 * GET リクエスト処理
 * URLパラメータからデータを受け取り処理する（CORS回避のため）
 */
function doGet(e) {
  try {
    // dataパラメータが存在する場合は通常の処理を実行
    if (e.parameter && e.parameter.data) {
      const requestData = JSON.parse(e.parameter.data);
      const action = requestData.action;

      Logger.log(`Action: ${action}`);
      Logger.log(`Request:`, requestData);

      let result;

      switch (action) {
        case 'clock_in':
          result = handleClockIn(requestData);
          break;

        case 'clock_out':
          result = handleClockOut(requestData);
          break;

        case 'get_today':
          result = handleGetToday(requestData);
          break;

        case 'complete_task':
          result = handleCompleteTask(requestData);
          break;

        default:
          return createErrorResponse('不明なアクションです');
      }

      return createSuccessResponse(result);
    }

    // dataパラメータがない場合はテストレスポンスを返す
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        message: 'Google Apps Script は正常に動作しています'
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return createErrorResponse('サーバーエラー: ' + error.toString());
  }
}

/**
 * OPTIONS リクエスト処理（CORS プリフライト対応）
 * ブラウザがPOSTリクエストを送る前に送信するプリフライトリクエストに対応
 */
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========================================
// 出勤処理
// ========================================

/**
 * 出勤打刻処理
 * @param {Object} data - リクエストデータ
 * @returns {Object} 処理結果
 */
function handleClockIn(data) {
  const { userId, name, timestamp } = data;
  const [date, time] = timestamp.split(' ');

  // スプレッドシートに記録
  const sheet = getOrCreateSheet('打刻記録');
  const today = getTodayRecord(sheet, userId, date);

  if (today) {
    // 既に記録がある場合は更新
    const row = today.row;
    sheet.getRange(row, 4).setValue(time); // 出勤時刻
  } else {
    // 新規記録
    sheet.appendRow([date, userId, name, time, '', '']);
  }

  // LINE通知
  sendLineNotification(`【出勤】\n${name} (${userId})\n${timestamp}`);

  return {
    date: date,
    clockIn: time
  };
}

// ========================================
// 退勤処理
// ========================================

/**
 * 退勤打刻処理
 * @param {Object} data - リクエストデータ
 * @returns {Object} 処理結果
 */
function handleClockOut(data) {
  const { userId, name, timestamp } = data;
  const [date, time] = timestamp.split(' ');

  // スプレッドシートから本日の記録を取得
  const sheet = getOrCreateSheet('打刻記録');
  const today = getTodayRecord(sheet, userId, date);

  if (!today) {
    throw new Error('出勤記録が見つかりません');
  }

  const clockIn = today.clockIn;

  // 勤務時間計算
  const workingHours = calculateWorkingHours(clockIn, time);

  // スプレッドシート更新
  const row = today.row;
  sheet.getRange(row, 5).setValue(time); // 退勤時刻
  sheet.getRange(row, 6).setValue(workingHours); // 勤務時間

  // LINE通知
  const message = `【退勤】\n${name} (${userId})\n出勤：${clockIn}\n退勤：${time}\n勤務：${workingHours}`;
  sendLineNotification(message);

  return {
    date: date,
    clockIn: clockIn,
    clockOut: time,
    workingHours: workingHours
  };
}

// ========================================
// 本日の記録取得
// ========================================

/**
 * 本日の記録取得処理
 * @param {Object} data - リクエストデータ
 * @returns {Object} 処理結果
 */
function handleGetToday(data) {
  const { userId, date } = data;

  const sheet = getOrCreateSheet('打刻記録');
  const today = getTodayRecord(sheet, userId, date);

  if (today) {
    return {
      date: date,
      clockIn: today.clockIn,
      clockOut: today.clockOut,
      workingHours: today.workingHours
    };
  } else {
    return {
      date: date,
      clockIn: null,
      clockOut: null,
      workingHours: null
    };
  }
}

// ========================================
// 課題完了報告
// ========================================

/**
 * 課題完了報告処理
 * @param {Object} data - リクエストデータ
 * @returns {Object} 処理結果
 */
function handleCompleteTask(data) {
  const { userId, name, appUrl, timestamp } = data;

  // スプレッドシートに記録
  const sheet = getOrCreateSheet('課題完了記録');
  sheet.appendRow([timestamp, userId, name, appUrl, '未確認']);

  // LINE通知
  const message = `【🎉課題完了報告🎉】\n研修生：${name}（${userId}）\n完了：${timestamp}\n\nアプリURL:\n${appUrl}\n\n確認をお願いします！`;
  sendLineNotification(message);

  return {
    message: '課題完了を報告しました'
  };
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * スプレッドシートを取得または作成
 * @param {string} sheetName - シート名
 * @returns {Sheet} シートオブジェクト
 */
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    // ヘッダー行を追加
    if (sheetName === '打刻記録') {
      sheet.appendRow(['日付', '研修生ID', '氏名', '出勤時刻', '退勤時刻', '勤務時間']);
    } else if (sheetName === '課題完了記録') {
      sheet.appendRow(['完了日時', '研修生ID', '氏名', 'アプリURL', '判定']);
    } else if (sheetName === '研修生マスタ') {
      sheet.appendRow(['研修生ID', '氏名', 'ステータス']);
      sheet.appendRow(['user01', 'konaka33', '進行中']);
    }

    // ヘッダーを太字に
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  }

  return sheet;
}

/**
 * 本日の打刻記録を取得
 * @param {Sheet} sheet - 打刻記録シート
 * @param {string} userId - 研修生ID
 * @param {string} date - 日付（YYYY/MM/DD）
 * @returns {Object|null} 記録オブジェクトまたはnull
 */
function getTodayRecord(sheet, userId, date) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === date && data[i][1] === userId) {
      return {
        row: i + 1,
        date: data[i][0],
        userId: data[i][1],
        name: data[i][2],
        clockIn: data[i][3],
        clockOut: data[i][4],
        workingHours: data[i][5]
      };
    }
  }

  return null;
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

/**
 * LINE通知を送信
 * @param {string} message - 送信メッセージ
 */
function sendLineNotification(message) {
  const url = 'https://api.line.me/v2/bot/message/push';

  const payload = {
    to: LINE_GROUP_ID,
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    payload: JSON.stringify(payload)
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log('LINE通知送信成功:', response.getContentText());
  } catch (error) {
    Logger.log('LINE通知送信エラー:', error.toString());
  }
}

/**
 * 成功レスポンス生成
 * @param {Object} data - レスポンスデータ
 * @returns {Object} JSONレスポンス
 */
function createSuccessResponse(data) {
  const response = {
    status: 'success',
    data: data
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * エラーレスポンス生成
 * @param {string} message - エラーメッセージ
 * @returns {Object} JSONレスポンス
 */
function createErrorResponse(message) {
  const response = {
    status: 'error',
    message: message
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
