# 考试搜题 Skill

## 防检测原理

学习通检测手段及本方案应对：

| 检测项 | 检测方式 | 本方案 |
|--------|----------|:---:|
| 截屏检测 | 监测系统级截图 API | ✅ html2canvas 浏览器内渲染，不调系统 API |
| 屏幕抓拍权限 | 监测抓屏权限调用 | ✅ 同上，纯 JS 实现 |
| 分屏/悬浮窗 | 监测窗口层级 | ✅ 答案嵌入页面 DOM，不创建新窗口 |
| 切屏检测 | visibilitychange / onblur | ✅ 全程在页面内操作，不离开 |

## 架构

```
┌──────────────────────┐  GM_xmlhttpRequest   ┌─────────────────┐
│  学习通考试页面        │ ──── POST / ──────→  │  server.py      │
│                       │                      │  localhost:19876│
│  Tampermonkey 脚本    │ ←─── JSON ────────── │                  │
│  • F2 触发截图        │                      │  Vision API 分析  │
│  • html2canvas 渲染   │                      └─────────────────┘
│  • DOM 内嵌显示答案    │
└──────────────────────┘
```

## 两步部署

### 步骤 1：启动本地分析服务

```bash
# 后台运行（无窗口）
pythonw "C:\Users\卢俊廷\.claude\skills\exam-search\server.py"

# 或前台运行（可看日志）
python "C:\Users\卢俊廷\.claude\skills\exam-search\server.py"
```

验证服务正常：
```bash
curl http://127.0.0.1:19876/health
# → {"status": "ok", "provider": "qwen"}
```

### 步骤 2：安装 Tampermonkey 脚本

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 打开 Tampermonkey 管理面板 → 新建脚本
3. 将 [tampermonkey.js](tampermonkey.js) 全部内容粘贴进去
4. 修改 `@match` 为你的考试网站 URL
5. 保存（Ctrl+S）

## 使用方式

1. 打开学习通考试页面
2. 按 **F2** 键（或你配置的快捷键）
3. 等待 3-8 秒，答案出现在页面右下角
4. 按 **Esc** 关闭答案面板

## 快捷键配置

编辑脚本开头的配置：

```javascript
const HOTKEY = 'F2';           // 快捷键
const HOTKEY_CTRL = false;     // 是否需要 Ctrl
const HOTKEY_SHIFT = false;    // 是否需要 Shift
const AUTO_DISMISS = 90;       // 答案自动消失秒数（0=不消失）
```

## @match 配置

默认匹配所有 URL，建议改为只匹配考试网站：

```javascript
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
```

## 文件说明

| 文件 | 作用 |
|------|------|
| [server.py](server.py) | 本地 HTTP 服务，调用 Vision API |
| [tampermonkey.js](tampermonkey.js) | 浏览器用户脚本，截图 + 显示答案 |
| [search.py](search.py) | 独立搜题脚本（系统截图版，有检测风险） |

## 依赖

- Python 3 + `openai` / `Pillow`
- Tampermonkey 浏览器扩展
- 千问 VL API Key（已配置）

## 安全提示

⚠️ 仅供模拟练习、自测使用。请遵守考试规定，维护学术诚信。
