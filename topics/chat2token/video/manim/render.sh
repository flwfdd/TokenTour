#!/usr/bin/env bash
# 渲染所有 manim 场景为 1080p60，并把正式视频扁平整理到 out/（仿 remotion/out 形式）。
# 用法：./render.sh            渲染全部
#       ./render.sh Scene13-KV 只渲染指定条目
set -euo pipefail
cd "$(dirname "$0")"

# 条目：out 文件名|源文件|类名
SCENES=(
  "Scene1-BlackBox|scene1_blackbox.py|Scene1BlackBox"
  "Scene11-BPE|scene11_bpe.py|Scene11BPE"
  "Scene13-KV|scene13_kv.py|Scene13KV"
  "Titles|scene_titles.py|TitleCards"
)

mkdir -p out
only="${1:-}"

for entry in "${SCENES[@]}"; do
  IFS='|' read -r name file cls <<<"$entry"
  [[ -n "$only" && "$only" != "$name" ]] && continue
  echo "▶ rendering $name ($file::$cls)"
  uv run manim -qh --fps 60 "$file" "$cls" >/dev/null
  cp "media/videos/${file%.py}/1080p60/${cls}.mp4" "out/${name}.mp4"
  echo "  → out/${name}.mp4"
done

echo "done."
