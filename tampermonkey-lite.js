// ==UserScript==
// @name         考试搜题助手
// @namespace    exam-search-helper
// @version      1.5
// @description  按F2截图搜题，答案显示在页面右下角
// @author       Claude
// @match        *://*/*
// @require      http://127.0.0.1:19876/html2canvas.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const SERVER = 'http://127.0.0.1:19876';

    let panelEl = null;
    let loadingEl = null;
    let isProcessing = false;

    // ── 样式 ────────────────────────────────────────
    GM_addStyle(`
.exam-helper-panel{position:fixed;bottom:20px;right:20px;max-width:420px;max-height:60vh;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.12);padding:14px 16px;font-size:13px;line-height:1.6;color:#333;z-index:99999;overflow-y:auto;font-family:-apple-system,"Microsoft YaHei",sans-serif}
.exam-helper-panel .eh-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
.exam-helper-panel .eh-title{font-weight:600;font-size:14px;color:#1a73e8}
.exam-helper-panel .eh-close{cursor:pointer;background:none;border:none;font-size:16px;color:#999;padding:2px 6px}
.exam-helper-panel .eh-close:hover{color:#333}
.exam-helper-panel .eh-answer{font-weight:600;font-size:15px;color:#d93025;margin:6px 0;padding:8px 10px;background:#fef7e0;border-radius:4px;border-left:3px solid #f9ab00}
.exam-helper-panel .eh-why{font-size:12px;color:#666;margin-top:4px}
.exam-helper-panel .eh-meta{font-size:11px;color:#999;margin-top:6px}
.exam-helper-panel .eh-sure-high{color:#188038}
.exam-helper-panel .eh-sure-mid{color:#e37400}
.exam-helper-panel .eh-sure-low{color:#d93025}
.exam-helper-loading{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:12px 24px;border-radius:6px;font-size:14px;z-index:99998}
.exam-helper-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:4px;font-size:13px;z-index:99999;animation:eh-fade 2.5s forwards}
@keyframes eh-fade{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
`);

    // ── 工具 ────────────────────────────────────────
    function toast(msg) {
        const el = document.createElement('div');
        el.className = 'exam-helper-toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 2600);
    }

    function showLoading() {
        if (loadingEl) return;
        loadingEl = document.createElement('div');
        loadingEl.className = 'exam-helper-loading';
        loadingEl.textContent = '正在分析题目...';
        document.body.appendChild(loadingEl);
    }

    function hideLoading() {
        if (loadingEl) { loadingEl.remove(); loadingEl = null; }
    }

    function removePanel() {
        if (panelEl) { panelEl.remove(); panelEl = null; }
    }

    // ── 显示答案 ─────────────────────────────────────
    function showAnswer(result) {
        removePanel();
        var num = result.num || '?';
        var qtype = result.type || '';
        var answer = result.answer || '';
        var why = result.why || '';
        var sure = result.sure || '';
        var question = (result.question || '').slice(0, 80);
        var sureClass = sure === '高' ? 'eh-sure-high' : sure === '中' ? 'eh-sure-mid' : 'eh-sure-low';
        var typeLabel = answer;
        if (qtype.indexOf('选择') >= 0) typeLabel = '选 ' + answer;
        else if (qtype.indexOf('判断') >= 0) typeLabel = answer;
        else if (qtype.indexOf('填空') >= 0) typeLabel = '填【' + answer + '】';

        panelEl = document.createElement('div');
        panelEl.className = 'exam-helper-panel';
        panelEl.innerHTML =
            '<div class="eh-header">' +
            '<span class="eh-title">第' + num + '题 - ' + qtype + '</span>' +
            '<button class="eh-close" title="关闭(Esc)">X</button>' +
            '</div>' +
            (question ? '<div style="color:#666;font-size:12px;margin-bottom:6px;">' + question + '...</div>' : '') +
            '<div class="eh-answer">' + typeLabel + '</div>' +
            (why ? '<div class="eh-why">' + why + '</div>' : '') +
            '<div class="eh-meta">置信度: <span class="' + sureClass + '">' + (sure || '?') + '</span>' +
            (result._elapsed_ms ? ' | ' + (result._elapsed_ms / 1000).toFixed(1) + 's' : '') +
            '</div>';

        panelEl.querySelector('.eh-close').addEventListener('click', removePanel);
        document.body.appendChild(panelEl);
        setTimeout(removePanel, 90000);
    }

    // ── 查找题目区域 ─────────────────────────────────
    function findQuestionArea() {
        var selectors = [
            '.Zy_TItle', '.mark_title', '.tiItem', '.subjectBox',
            '.question-content', '.exam-content', '.paper-question',
            '.exam-question', '.test-content', '#question_content',
            'article', 'main'
        ];
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el && el.offsetHeight > 50) return el;
        }
        return document.body;
    }

    // ── 截图 + 发送 ──────────────────────────────────
    function captureAndAnalyze() {
        if (isProcessing) { toast('正在分析中...'); return; }
        if (typeof html2canvas === 'undefined') {
            toast('html2canvas 未加载，请刷新页面重试');
            console.error('[搜题] html2canvas undefined');
            return;
        }
        isProcessing = true;
        showLoading();

        try {
            var target = findQuestionArea();
            html2canvas(target, {
                scale: 1.5, useCORS: true, allowTaint: true,
                backgroundColor: '#ffffff', logging: false
            }).then(function (canvas) {
                var b64 = canvas.toDataURL('image/jpeg', 0.8);

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: SERVER + '/',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ image: b64 }),
                    timeout: 30000,
                    onload: function (resp) {
                        hideLoading();
                        isProcessing = false;
                        try {
                            var result = JSON.parse(resp.responseText);
                            if (result.error) { toast(result.error); return; }
                            showAnswer(result);
                        } catch (e) {
                            toast('响应解析失败');
                        }
                    },
                    onerror: function () {
                        hideLoading();
                        isProcessing = false;
                        toast('无法连接本地服务');
                    },
                    ontimeout: function () {
                        hideLoading();
                        isProcessing = false;
                        toast('分析超时');
                    }
                });
            }).catch(function (err) {
                hideLoading();
                isProcessing = false;
                toast('截图失败: ' + err.message);
                console.error('[搜题]', err);
            });
        } catch (err) {
            hideLoading();
            isProcessing = false;
            toast('截图失败: ' + err.message);
        }
    }

    // ── 键盘快捷键 ──────────────────────────────────
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panelEl) { removePanel(); return; }
        if (e.key === 'F2' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            captureAndAnalyze();
        }
    });

    console.log('[搜题助手] 已就绪 | 按 F2 搜题 | 服务: ' + SERVER);
})();
