/**
 * 沙箱 iframe 文档构造与代码出站校验。
 *
 * 设计要点（与 docs/一句话生成应用-功能梳理.md 第七章一致）：
 *   - iframe sandbox 仅启用 allow-scripts；禁用 allow-same-origin / top-navigation。
 *   - CSP 严格白名单：禁止任意 connect-src；脚本只来自允许的 CDN。
 *   - 父子通信：通过 postMessage（一次性桥），仅用于把 console 与 onerror 上送父窗。
 */

import type { AppGenTheme } from './app-gen-types';

const ALLOWED_SCRIPT_HOSTS = [
  'cdn.tailwindcss.com',
  'unpkg.com',
  'esm.sh',
  'cdn.jsdelivr.net',
] as const;

/** 允许 script-src 的 host 列表（与服务端 prompt 端约束一致） */
function buildCspMeta(): string {
  const scriptSrc = ALLOWED_SCRIPT_HOSTS.map((h) => `https://${h}`).join(' ');
  const csp = [
    `default-src 'none'`,
    `script-src 'unsafe-inline' 'unsafe-eval' ${scriptSrc}`,
    `style-src 'unsafe-inline' ${scriptSrc}`,
    `img-src data: blob: https:`,
    `font-src https: data:`,
    `connect-src 'none'`,
    `frame-src 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}

/**
 * 父子桥脚本：在用户代码执行之前，先做两件事：
 *  1) 给 iframe 注入 localStorage / sessionStorage / document.cookie 的内存 polyfill。
 *     沙箱（无 allow-same-origin）里访问原生 storage 会抛 SecurityError，导致整段脚本崩溃。
 *     polyfill 提供仅本帧、仅内存的实现，让模型生成的代码可以安全调用。
 *  2) 拦截 console.* / error / unhandledrejection，通过 postMessage 转发给父窗用于调试面板。
 */
const PARENT_BRIDGE_SCRIPT = `
<script>
(function(){
  // ---- in-memory storage polyfill ----
  try {
    function makeStorage(){
      var store = Object.create(null);
      return {
        get length(){ return Object.keys(store).length; },
        key: function(i){ return Object.keys(store)[i] != null ? Object.keys(store)[i] : null; },
        getItem: function(k){ return Object.prototype.hasOwnProperty.call(store, String(k)) ? store[String(k)] : null; },
        setItem: function(k, v){ store[String(k)] = String(v); },
        removeItem: function(k){ delete store[String(k)]; },
        clear: function(){ store = Object.create(null); }
      };
    }
    var _ls = makeStorage();
    var _ss = makeStorage();
    Object.defineProperty(window, 'localStorage',   { configurable: true, get: function(){ return _ls; } });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function(){ return _ss; } });
  } catch (_) {}
  // ---- document.cookie polyfill (sandbox 里访问会抛 SecurityError) ----
  try {
    var _cookieJar = '';
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: function(){ return _cookieJar; },
      set: function(v){
        try {
          var pair = String(v).split(';')[0];
          var idx = pair.indexOf('=');
          if (idx < 0) return;
          var name = pair.slice(0, idx).trim();
          var val = pair.slice(idx + 1).trim();
          var pairs = _cookieJar ? _cookieJar.split('; ').filter(function(p){ return p.split('=')[0] !== name; }) : [];
          if (val !== '') pairs.push(name + '=' + val);
          _cookieJar = pairs.join('; ');
        } catch (_) {}
      }
    });
  } catch (_) {}
  // ---- console / error 转发到父窗 ----
  try {
    var send = function(level, payload){
      try {
        window.parent.postMessage({ source: '__hai_app_gen__', level: level, payload: payload, ts: Date.now() }, '*');
      } catch (_) {}
    };
    var safeStringify = function(args){
      try {
        return Array.prototype.map.call(args, function(a){
          if (a instanceof Error) return a.message + (a.stack ? '\\n' + a.stack : '');
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (_) { return String(a); }
          }
          return String(a);
        }).join(' ');
      } catch (_) { return ''; }
    };
    // 已知噪音：Tailwind CDN production-warning、React devtools 提示等，统一吞掉避免污染调试面板
    var NOISE = [
      'cdn.tailwindcss.com should not be used in production',
      'Download the React DevTools',
    ];
    var isNoise = function(text){
      for (var i = 0; i < NOISE.length; i++) {
        if (text.indexOf(NOISE[i]) !== -1) return true;
      }
      return false;
    };
    ['log','info','warn','error'].forEach(function(level){
      var orig = console[level] ? console[level].bind(console) : function(){};
      console[level] = function(){
        var msg = safeStringify(arguments);
        if (!isNoise(msg)) send(level, msg);
        try { orig.apply(console, arguments); } catch (_) {}
      };
    });
    window.addEventListener('error', function(e){
      send('error', (e && (e.message || (e.error && e.error.message))) || 'Unknown error');
    });
    window.addEventListener('unhandledrejection', function(e){
      var r = e && (e.reason && (e.reason.message || e.reason)) || 'Unhandled rejection';
      send('error', String(r));
    });
  } catch (_) {}
})();
</script>
`.trim();

/**
 * 截取 srcDoc 时只保留模型给出的从 <!DOCTYPE html> 到 </html> 之间的内容；
 * 任何外层 markdown 围栏 / 前言后记都会被裁掉。
 */
export function extractHtmlDocument(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const start = lower.indexOf('<!doctype html');
  if (start < 0) {
    // 兼容模型只给 <html>… 的少数情况
    const htmlStart = lower.indexOf('<html');
    if (htmlStart < 0) return '';
    const htmlEnd = lower.lastIndexOf('</html>');
    if (htmlEnd < 0) return raw.slice(htmlStart);
    return raw.slice(htmlStart, htmlEnd + '</html>'.length);
  }
  const end = lower.lastIndexOf('</html>');
  if (end < 0) return raw.slice(start);
  return raw.slice(start, end + '</html>'.length);
}

/**
 * 流式期间把未闭合的 HTML 补全，以便提前塞进 iframe 进行渐进式预览。
 *   - 若片段还没出现 `<body`，则返回空串（让预览继续展示骨架）。
 *   - 否则补齐 </body></html>，并尝试关掉最近一个未闭合的 <script>（避免吃掉后续 DOM）。
 */
export function closeIncompleteHtml(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const bodyIdx = lower.indexOf('<body');
  if (bodyIdx < 0) return '';
  let doc = extractHtmlDocument(raw) || raw.slice(lower.indexOf('<!doctype html') >= 0 ? lower.indexOf('<!doctype html') : 0);
  const lowDoc = doc.toLowerCase();

  // 若末尾还停留在一个未闭合 <script> 内，先吞掉这段未完成片段，避免标签丢失把后续 </body> 当文本
  const lastScriptOpen = lowDoc.lastIndexOf('<script');
  const lastScriptClose = lowDoc.lastIndexOf('</script>');
  if (lastScriptOpen > lastScriptClose) {
    doc = doc.slice(0, lastScriptOpen);
  }

  const tail = doc.toLowerCase();
  if (!tail.includes('</body>')) doc += '\n</body>';
  if (!tail.includes('</html>')) doc += '\n</html>';
  return doc;
}

/**
 * 把模型给出的 HTML 包成最终用于 iframe srcDoc 的安全文档：
 *   - 注入 CSP meta（必须出现在 <head> 第一项才生效）
 *   - 注入父子桥脚本（用于回传 console / error）
 *   - 注入主题类（用 Tailwind 的 dark: 变体）
 *   - 若模型没给 <head>，则用通用模板兜底
 *   - 当 progressive=true 且文档未闭合时自动补全（用于流式期间的渐进式预览）
 */
export function wrapHtmlForSandbox(
  raw: string,
  theme: AppGenTheme = 'light',
  options: { progressive?: boolean } = {}
): string {
  const completed = options.progressive ? closeIncompleteHtml(raw) : '';
  const html = completed || extractHtmlDocument(raw) || raw;
  if (!html) return buildFallbackDocument('（暂无内容，请输入一句话开始生成）', theme);

  const cspMeta = buildCspMeta();

  // 在 <head> 起始位置注入 CSP 与桥脚本
  const headOpenMatch = html.match(/<head\b[^>]*>/i);
  if (headOpenMatch && headOpenMatch.index !== undefined) {
    const insertAt = headOpenMatch.index + headOpenMatch[0].length;
    const before = html.slice(0, insertAt);
    const after = html.slice(insertAt);
    const themed = applyThemeClass(before + `\n${cspMeta}\n${PARENT_BRIDGE_SCRIPT}\n` + after, theme);
    return themed;
  }

  // 没有 <head>：自己包一层最小骨架
  return buildFallbackDocument(html, theme);
}

function applyThemeClass(doc: string, theme: AppGenTheme): string {
  if (theme !== 'dark') return doc;
  // 给 <html> / <body> 都打上 dark class，兼容 Tailwind 的 darkMode: 'class'
  return doc
    .replace(/<html\b([^>]*)>/i, (m, attrs: string) => {
      if (/\bclass\s*=/.test(attrs)) {
        return `<html${attrs.replace(/class\s*=\s*"([^"]*)"/i, (_mm, c: string) =>
          `class="${c} dark"`
        )}>`;
      }
      return `<html${attrs} class="dark">`;
    })
    .replace(/<body\b([^>]*)>/i, (m, attrs: string) => {
      if (/\bclass\s*=/.test(attrs)) {
        return `<body${attrs.replace(/class\s*=\s*"([^"]*)"/i, (_mm, c: string) =>
          `class="${c} dark"`
        )}>`;
      }
      return `<body${attrs} class="dark">`;
    });
}

function buildFallbackDocument(body: string, theme: AppGenTheme): string {
  const cspMeta = buildCspMeta();
  const dark = theme === 'dark' ? ' dark' : '';
  return `<!DOCTYPE html>
<html lang="zh-CN" class="${dark.trim()}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${cspMeta}
${PARENT_BRIDGE_SCRIPT}
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="${dark ? 'bg-[hsl(222_47%_11%)] text-white' : 'bg-[hsl(210_20%_98%)] text-[hsl(222_47%_11%)]'}">
${body}
</body>
</html>`;
}

/**
 * 出站轻校验：返回告警条目（不阻断渲染），用于代码视图标黄/提示用户。
 */
export interface CodeWarning {
  level: 'info' | 'warn' | 'danger';
  message: string;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; message: string; level: CodeWarning['level'] }> = [
  { pattern: /fetch\s*\(\s*['"`]https?:\/\//i, message: '检测到对外网的 fetch 调用：沙箱已通过 CSP 阻断，但请确认非必需', level: 'warn' },
  { pattern: /new\s+WebSocket\s*\(/i, message: '检测到 WebSocket，沙箱内会被 CSP 阻断', level: 'warn' },
  { pattern: /navigator\.sendBeacon\s*\(/i, message: '检测到 sendBeacon，可能上报数据', level: 'warn' },
  { pattern: /document\.cookie/i, message: '访问 document.cookie：沙箱跨域，但建议移除以避免误导', level: 'info' },
  { pattern: /window\.(parent|top|opener)/i, message: '访问 window.parent/top/opener：沙箱跨域无效，建议删除', level: 'info' },
  { pattern: /<iframe\b/i, message: '内嵌 iframe 已被 CSP frame-src none 阻断', level: 'info' },
];

export function scanCodeWarnings(code: string): CodeWarning[] {
  if (!code) return [];
  const warnings: CodeWarning[] = [];
  for (const { pattern, message, level } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) warnings.push({ level, message });
  }
  return warnings;
}

/** 仅检查必要的标记是否齐全，用于判断是否可以进入预览。 */
export function isLikelyCompleteHtml(code: string): boolean {
  if (!code) return false;
  const lower = code.toLowerCase();
  return lower.includes('<!doctype html') && lower.includes('</html>');
}

export interface AppGenBridgeMessage {
  source: '__hai_app_gen__';
  level: 'log' | 'info' | 'warn' | 'error';
  payload: string;
  ts: number;
}

export function isBridgeMessage(data: unknown): data is AppGenBridgeMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.source === '__hai_app_gen__' && typeof d.level === 'string' && typeof d.payload === 'string';
}
