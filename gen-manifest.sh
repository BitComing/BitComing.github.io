#!/usr/bin/env bash
# gen-manifest.sh — 扫描 posts/ 目录下的 .md 文件，自动生成 manifest.json
#
# 用法： ./gen-manifest.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POSTS_DIR="$SCRIPT_DIR/posts"
MANIFEST="$POSTS_DIR/manifest.json"

# 确保 posts 目录存在
mkdir -p "$POSTS_DIR"

# 收集所有 .md 文件名（不含路径前缀）
files=()
for f in "$POSTS_DIR"/*.md; do
    if [ -f "$f" ]; then
        files+=("\"$(basename "$f")\"")
    fi
done

# 生成 JSON 数组
if [ ${#files[@]} -eq 0 ]; then
    echo '[]' > "$MANIFEST"
else
    (
        IFS=,
        echo "[${files[*]}]"
    ) > "$MANIFEST"
fi

echo "[gen-manifest] 已生成 manifest.json (${#files[@]} 篇文章)"
