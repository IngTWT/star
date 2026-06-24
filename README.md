# 学习通考试助手

按 F2 截图搜题，答案直接显示在页面右下角。全程浏览器内操作，不触发学习通切屏检测。

## 原理

```
按 F2 → html2canvas 页面内截图 → 本地服务 → Vision API 分析 → 答案嵌入 DOM
```

- 截图：html2canvas JS 渲染，不调 Windows 系统截图 API
- 通信：Tampermonkey 特权 API，不受 CSP / Mixed Content 限制
- 显示：DOM 元素嵌入页面，非悬浮窗

## 快速开始

### 1. 环境

- Python 3.10+
- 浏览器 + [Tampermonkey](https://www.tampermonkey.net/) 扩展
- [千问 VL API Key](https://dashscope.aliyun.com/)（注册即送免费额度）

### 2. 下载 html2canvas

```bash
python -c "
import urllib.request
url='https://cdn.bootcdn.net/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
with open('html2canvas.min.js','wb') as f:
    f.write(urllib.request.urlopen(url).read())
print('OK')
"
```

### 3. 安装依赖 & 配置 Key

```bash
pip install openai pillow
set DASHSCOPE_API_KEY=sk-xxxxxxxx
```

### 4. 启动服务

```bash
python server.py
```

验证：`curl http://127.0.0.1:19876/health` → `{"status":"ok","provider":"qwen"}`

### 5. 安装脚本

Tampermonkey → 新建脚本 → 粘贴 `tampermonkey-lite.js` → Ctrl+S

## 使用

打开考试页面 → 按 **F2** → 等 3-6 秒 → 右下角弹答案 → 按 Esc 关闭

## 文件

| 文件 | 作用 |
|------|------|
| `server.py` | 本地 HTTP 服务，调用 Vision API |
| `tampermonkey-lite.js` | 浏览器用户脚本 |
| `SKILL.md` | 详细文档 |

## License

MIT
