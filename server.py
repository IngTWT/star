#!/usr/bin/env python3
"""
本地搜题 HTTP 服务
==================
在 localhost:19876 运行，接收浏览器发来的题目截图（base64），
调用 Vision API 分析，返回答案。

配合 Tampermonkey 用户脚本使用：
  - 浏览器内 html2canvas 截图（不调系统API，不触发截屏检测）
  - GM_xmlhttpRequest 发送到本服务
  - 返回答案后，脚本在页面 DOM 内显示（不是悬浮窗）

启动方式:
  pythonw server.py              # 无窗口后台运行
  python server.py               # 前台运行（调试用）
  python server.py --port 19876  # 指定端口
"""

import sys
import os
import json
import time
import base64
import tempfile
import argparse
import signal
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# vision skill
VISION_DIR = Path.home() / ".claude" / "skills" / "vision"
SKILL_DIR = Path.home() / ".claude" / "skills" / "exam-search"
sys.path.insert(0, str(VISION_DIR))
from vision import vision, resolve_provider, PROVIDERS

TEMP_DIR = Path(tempfile.gettempdir()) / "exam_search"
TEMP_DIR.mkdir(exist_ok=True)

# ── Vision 分析（复用 search.py 的逻辑）──────────────────────────────
PROMPT = '''你是考试助手。截图是一道考试题目。请完成识别和作答。

## 输出规则

1. 先判断题型，再提取内容
2. **选择题/多选题**：提取所有选项文字，answer 填正确选项字母（如 C 或 ACD）
3. **判断题**：提取完整陈述，answer 填"正确"或"错误"
4. **填空题**：提取完整题干（包括横线/空白处），answer 填应填入的内容。如果有多个空，用 | 分隔（如"北京|故宫"）
5. **简答题/论述题**：提取完整题干，answer 给出完整答案（100-300字），why 总结核心要点
6. 题号从截图右上角或题干前提取（如"1."、"第3题"）

严格输出以下 JSON（不要多余内容）：
{
  "num": "题号,如1/3/12,没找到填?",
  "type": "选择题/多选题/判断题/填空题/简答题/论述题/未知",
  "question": "题干完整文字",
  "options": ["A. xxx", "B. xxx"],
  "answer": "答案内容(按上述规则)",
  "why": "解析或要点(选择题20字内,简答题50字内)",
  "sure": "高/中/低"
}'''


def analyze_image(b64_data: str) -> dict:
    """分析 base64 编码的截图，返回结果 dict"""
    img_path = TEMP_DIR / f"q_{int(time.time() * 1000)}.jpg"
    try:
        with open(img_path, "wb") as f:
            f.write(base64.b64decode(b64_data))
    except Exception as e:
        return {"error": f"图片解码失败: {e}"}

    t0 = time.time()
    try:
        provider_name, config = resolve_provider(None)
        response = vision(str(img_path), PROMPT, provider_name, config)
        response = response.strip()

        if response.startswith("```"):
            lines = response.split("\n")
            response = "\n".join(lines[1:])
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()

        result = json.loads(response)
        result["_elapsed_ms"] = int((time.time() - t0) * 1000)
        return result
    except json.JSONDecodeError:
        return {
            "num": "?", "type": "未知", "question": "",
            "options": [], "answer": "", "why": response,
            "sure": "低", "raw": response,
            "_elapsed_ms": int((time.time() - t0) * 1000),
        }
    except Exception as e:
        return {"error": f"分析失败: {e}"}
    finally:
        try:
            img_path.unlink()
        except Exception:
            pass


# ── HTTP Handler ─────────────────────────────────────────────────────
class ExamHandler(BaseHTTPRequestHandler):
    """处理来自 Tampermonkey 脚本的请求"""

    def log_message(self, format, *args):
        """简化日志"""
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        # CORS（GM_xmlhttpRequest 不需要，但保留以便调试）
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json({}, 204)

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok", "provider": resolve_provider(None)[0]})
        elif self.path == "/html2canvas.min.js":
            # 提供本地 html2canvas 文件
            js_path = SKILL_DIR / "html2canvas.min.js"
            if js_path.exists():
                data = js_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Content-Length", len(data))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
            else:
                self._send_json({"error": "html2canvas 文件不存在"}, 404)
        else:
            self._send_json({"error": "只支持 POST /"}, 405)

    def do_POST(self):
        # 读取请求体
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self._send_json({"error": "空请求"}, 400)
            return
        if length > 10 * 1024 * 1024:  # 10MB 限制
            self._send_json({"error": "图片太大"}, 413)
            return

        try:
            body = self.rfile.read(length)
            data = json.loads(body.decode("utf-8"))
        except Exception:
            self._send_json({"error": "JSON 解析失败"}, 400)
            return

        b64 = data.get("image", "")
        if not b64:
            self._send_json({"error": "缺少 image 字段"}, 400)
            return

        # 去掉可能的 data URI 前缀
        if "," in b64:
            b64 = b64.split(",", 1)[1]

        print(f"  收到请求 ({len(b64) // 1024}KB)", end=" ", flush=True)

        start_time = time.time()
        result = analyze_image(b64)

        elapsed = result.get("_elapsed_ms", 0) / 1000
        print(f"→ {result.get('type','?')} "
              f"第{result.get('num','?')}题 "
              f"答案:{result.get('answer','?')} "
              f"({elapsed:.1f}s)")

        self._send_json(result)


# ── 主入口 ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="考试搜题本地服务")
    parser.add_argument("--port", "-p", type=int, default=19876,
                        help="监听端口 (默认 19876)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="监听地址 (默认 127.0.0.1)")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), ExamHandler)

    print(f"🔍 搜题服务已启动: http://{args.host}:{args.port}")
    print(f"   Vision 提供商: {resolve_provider(None)[0]}")
    print(f"   按 Ctrl+C 停止")
    print(f"   等待浏览器请求...")

    # 优雅退出
    def shutdown(sig, frame):
        print("\n⏹ 正在关闭...")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
