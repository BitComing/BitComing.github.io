/**
 * watch-posts.js — 监听 posts/ 目录下 .md 文件的增删，自动运行 gen-manifest.sh
 *
 * 用法： node watch-posts.js
 * 停止： Ctrl+C
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTS_DIR = path.join(__dirname, 'posts');
const SCRIPT = path.join(__dirname, 'gen-manifest.sh');

// 防抖：批量变更在 300ms 内只触发一次
let timer = null;

function runManifest() {
  try {
    const result = execSync(`bash "${SCRIPT}"`, { encoding: 'utf8', cwd: __dirname });
    console.log(result.trim());
  } catch (err) {
    console.error('[watch-posts] 运行出错:', err.message);
  }
}

// 过滤：只关心 .md 文件
function isMdFile(filename) {
  return filename && filename.endsWith('.md');
}

console.log(`[watch-posts] 开始监听 ${POSTS_DIR} ...`);

fs.watch(POSTS_DIR, { recursive: false }, (eventType, filename) => {
  if (!isMdFile(filename)) return;

  if (timer) clearTimeout(timer);
  timer = setTimeout(runManifest, 300);
});

// 启动时先跑一次，确保 manifest 是最新的
runManifest();

console.log('[watch-posts] 按 Ctrl+C 停止监听');
