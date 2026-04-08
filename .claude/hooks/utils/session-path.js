/**
 * session-path.js — セッションIDとパス検証の共通ユーティリティ
 *
 * 全hookで共通利用する:
 *   1. sessionIdの検証（許可される文字のみ）
 *   2. path.resolveでベースディレクトリ内か確認
 *   3. シンボリックリンク拒否
 *
 * 2026-04-09 追加: 3エージェント合同レビューのPath Traversal対策
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 許可される sessionId 文字: 英数字、ピリオド、アンダースコア、ハイフン
const VALID_SESSION_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * sessionIdを取得（フォールバック付き）
 * 優先順位: CLAUDE_SESSION_ID → 日付+PID → "default"
 */
function getSessionId() {
  const envId = process.env.CLAUDE_SESSION_ID;
  if (envId && VALID_SESSION_ID.test(envId)) return envId;

  const today = new Date().toISOString().split('T')[0];
  const fallback = `${today}_${process.pid}`;
  if (VALID_SESSION_ID.test(fallback)) return fallback;

  return 'default';
}

/**
 * sessionIdが安全か検証
 * @param {string} sessionId
 * @returns {boolean}
 */
function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && VALID_SESSION_ID.test(sessionId);
}

/**
 * ベースディレクトリ内に閉じ込めた安全なパスを返す
 * @param {string} baseDir - ベースディレクトリ（絶対パス）
 * @param {string} sessionId - 検証されていないセッションID
 * @returns {string|null} 安全なパス、または null（不正な場合）
 */
function safeSessionDir(baseDir, sessionId) {
  try {
    if (!isValidSessionId(sessionId)) return null;

    const resolvedBase = path.resolve(baseDir);
    const target = path.resolve(resolvedBase, sessionId);

    // ベースディレクトリ内に閉じ込められているか確認
    if (!target.startsWith(resolvedBase + path.sep) && target !== resolvedBase) {
      return null;
    }

    // シンボリックリンク拒否
    if (fs.existsSync(target)) {
      try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink()) return null;
      } catch (e) {}
    }

    return target;
  } catch (e) {
    return null;
  }
}

/**
 * ベースディレクトリ内に閉じ込めた安全なファイルパスを返す
 * @param {string} baseDir
 * @param {string} fileName - ファイル名（sessionIdを含む）
 * @returns {string|null}
 */
function safeSessionFile(baseDir, fileName) {
  try {
    if (typeof fileName !== 'string' || fileName.length === 0) return null;
    // パス区切り文字を含むファイル名は拒否
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return null;
    }

    const resolvedBase = path.resolve(baseDir);
    const target = path.resolve(resolvedBase, fileName);

    if (!target.startsWith(resolvedBase + path.sep) && target !== resolvedBase) {
      return null;
    }

    return target;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getSessionId,
  isValidSessionId,
  safeSessionDir,
  safeSessionFile,
  VALID_SESSION_ID,
};
