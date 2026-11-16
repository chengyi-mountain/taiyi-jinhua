// 静态结构测试：不依赖任何第三方库
// 用法：node tests/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const fails = [];
const stats = { total: 0 };
function t(name, fn) {
  stats.total++;
  try {
    const r = fn();
    if (r !== true && r !== undefined) fails.push(`${name} —— ${String(r || '断言未通过')}`);
  } catch (e) {
    fails.push(`${name} —— ${e.message}`);
  }
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const count = (re) => (html.match(re) || []).length;

// --- 文件与基础 ---
t('index.html 存在且够大', () => (html.length > 70000 ? true : `只有 ${html.length} 字符`));
t('DOCTYPE 与语言', () => {
  if (!/^<!DOCTYPE html>/i.test(html)) return '缺 doctype';
  if (!/<html lang="zh-CN">/.test(html)) return 'lang 不是 zh-CN';
  return true;
});
t('viewport 合规', () => {
  const m = html.match(/<meta name="viewport" content="([^"]+)"/);
  if (!m) return '缺 viewport';
  if (!/width=device-width/.test(m[1]) || !/initial-scale=1/.test(m[1])) return m[1];
  if (/user-scalable=no|maximum-scale/.test(m[1])) return '禁用缩放';
  return true;
});
t('标题与描述存在', () => {
  if (!/<title>[^<]{4,}<\/title>/.test(html)) return '缺 title';
  if (!/<meta name="description" content="[^"]{20,}">/.test(html)) return '缺 description';
  return true;
});

// --- 路由与视图 ---
const routes = [...html.matchAll(/\b(\w+):'(v-\w+)'/g)].map((m) => [m[1], m[2]]);
t('七个路由与七个视图', () => (routes.length === 7 && ids.filter((i) => i.startsWith('v-')).length === 7 ? true : `routes=${routes.length}`));
t('路由目标 id 都存在', () => {
  const bad = routes.filter(([, id]) => !ids.includes(id)).map(([r]) => r);
  return bad.length ? `缺视图：${bad}` : true;
});
t('导航 href 都指向已定义路由', () => {
  const hrefs = [...html.matchAll(/<a href="#\/(\w+)"/g)].map((m) => m[1]);
  const keys = routes.map(([k]) => k);
  const bad = [...new Set(hrefs.filter((h) => !keys.includes(h)))];
  return bad.length ? `无效链接：${bad}` : hrefs.length >= 6 ? true : `导航项只有 ${hrefs.length}`;
});

// --- 数据层 ---
t('十三章都在', () => {
  const ns = [...html.matchAll(/\{n:"(\d\d)"/g)].map((m) => m[1]);
  const want = Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(2, '0'));
  return want.every((w) => ns.includes(w)) && ns.length === 13 ? true : `找到 ${ns.join(',')}`;
});
t('每章都带标题、段、要点、实操、异文', () => {
  const blocks = html.split(/\n\{n:"/).slice(1);
  const bad = [];
  blocks.forEach((b, i) => {
    const need = [/t:"/, /s:"/, /segs:\[/, /keys:\[/, /act:"/, /vr:"/];
    if (!need.every((re) => re.test(b.slice(0, 4000)))) bad.push(i + 1);
  });
  return bad.length ? `第 ${bad.join(',')} 章字段不全` : true;
});
t('原文与讲解分段配对', () => {
  const o = count(/\{o:"/g);
  const g = count(/g:"/g);
  if (o !== g) return `原文 ${o} 段 / 讲解 ${g} 段不配对`;
  return o >= 80 ? true : `总分段只有 ${o}，少于 80`;
});
t('异文条目已记录', () => (count(/《心印经》通行作|一本作/g) >= 8 ? true : '异文太少'));

// --- 元素完整性 ---
t('id 不重复', () => {
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  return dup.length ? `重复：${[...new Set(dup)].join(',')}` : true;
});
t('脚本引用的 id 都存在', () => {
  const refs = [...html.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]);
  const missing = [...new Set(refs.filter((r) => !ids.includes(r)))];
  return missing.length ? `找不到：${missing.join(',')}` : refs.length > 40 ? true : `只引用了 ${refs.length} 个`;
});
t('核心交互元素齐备', () => {
  const need = ['lidSvg', 'lidRange', 'lidCurtain', 'lidFill', 'clock', 'btnStart', 'btnStop', 'btnSave', 'qRow', 'bars', 'log', 'chapNav', 'chapBody', 'sealwall'];
  const missing = need.filter((n) => !ids.includes(n));
  return missing.length ? `缺 ${missing.join(',')}` : true;
});

// --- 新手引导 ---
t('新手引导存在且只出现一次', () => {
  const need = ['onboard', 'obClose', 'obAgain', 'obTitle'];
  const missing = need.filter((n) => !ids.includes(n));
  if (missing.length) return `缺 ${missing.join(',')}`;
  if (!/OB_KEY/.test(html) || !/tyjh\.onboard\.v1/.test(html)) return '缺 localStorage 键';
  if (!/if\(!seen\)obShow\(\)/.test(html)) return '未实现首访自动出现';
  return true;
});

// --- 图标 ---
t('站点图标内联且合规', () => {
  const m = html.match(/<link rel="icon"[^>]*>/);
  if (!m) return '缺 favicon';
  if (!/type="image\/svg\+xml"/.test(m[0])) return 'favicon 不是 svg';
  if (!/href="data:image\/svg\+xml/.test(m[0])) return 'favicon 未内联';
  return true;
});
t('仓库 logo 资源存在', () => {
  const p = path.join(root, 'assets', 'logo.svg');
  if (!fs.existsSync(p)) return '缺 assets/logo.svg';
  const svg = fs.readFileSync(p, 'utf8');
  if (!/viewBox="0 0 512 512"/.test(svg)) return 'logo viewBox 不对';
  return true;
});
t('「澄一」落款印已接入站点', () => {
  const p = path.join(root, 'assets', 'seal-chengyi.svg');
  if (!fs.existsSync(p)) return '缺 assets/seal-chengyi.svg';
  const svg = fs.readFileSync(p, 'utf8');
  if (!/澄/.test(svg)) return 'seal 里没有「澄」';
  if (count(/assets\/seal-chengyi\.svg/g) < 1) return '页面没有引用印章';
  if (!/澄一 谨录/.test(html)) return '缺落款文字';
  if (!/class="site-foot"/.test(html)) return '缺页脚落款容器';
  return true;
});

// --- 自包含与外部依赖 ---
t('没有外链脚本', () => (count(/<script[^>]+src=/g) === 0 ? true : '存在 <script src>'));
t('字体只走自托管镜像', () => {
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) return '直连 Google Fonts';
  const hosts = [...html.matchAll(/https:\/\/([\w.-]+)\//g)].map((m) => m[1]);
  const bad = [...new Set(hosts.filter((h) => h.includes('font') && h !== 'miaoda.feishu.cn'))];
  return bad.length ? `其他字体域：${bad}` : true;
});
t('没有 http:// 明文链接', () => {
  const m = [...html.matchAll(/http:\/\/[^\s"'<>)]+/g)].filter((x) => !/^http:\/\/www\.w3\.org/.test(x[0]));
  return m.length ? `发现 ${m.length} 处：${m[0][0]}` : true;
});
t('没有 emoji', () => {
  const m = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  return m ? `发现 ${m[0]}` : true;
});

// --- 代码质量 ---
t('CSS 花括号配平', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const open = (css.match(/{/g) || []).length;
  const close = (css.match(/}/g) || []).length;
  return open === close ? true : `{ ${open} 个，} ${close} 个`;
});
t('内联 JS 通过 node --check', () => {
  const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const tmp = path.join(root, '.check.tmp.mjs');
  fs.writeFileSync(tmp, js, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    return true;
  } catch (e) {
    return String(e.stderr || e.message).slice(0, 300);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
t('localStorage 只用三个键', () => {
  const keys = [...new Set([...html.matchAll(/tyjh\.[a-z]+\.v\d/g)].map((m) => m[0]))];
  const allow = ['tyjh.log.v1', 'tyjh.onboard.v1', 'tyjh.view.v1'];
  const bad = keys.filter((k) => !allow.includes(k));
  return bad.length ? `多余键：${bad}` : keys.length === 3 ? true : `找到 ${keys}`;
});
t('版式开关与竖排规则都在', () => {
  const need = ['id="mHorz"', 'id="mVert"', 'writing-mode:vertical-rl', 'text-orientation:upright'];
  const missing = need.filter((s) => !html.includes(s));
  return missing.length ? `缺 ${missing.join(',')}` : true;
});
t('竖排只改版式不改字', () => {
  // 竖排区块里不得出现替换文字的实现（不得引入繁简转换、不得改写 CHAPTERS）
  if (/opencc|String\.fromCharCode|s2t/i.test(html)) return '出现了字符转换实现，竖排应只改版式';
  if (html.includes('tyjh.view.v1') && !html.includes("saved==='vert'")) return '未按存储值恢复竖排';
  return true;
});
t('有打印样式', () => {
  if (!/@media print/.test(html)) return '缺 @media print';
  const need = [/\.view:not\(\.on\)/, /break-inside:avoid/];
  const missing = need.filter((re) => !re.test(html));
  return missing.length ? `打印规则缺 ${missing.join(',')}` : true;
});

// --- 仓库文件与声明 ---
t('README / LICENSE / 校记 都在', () => {
  const need = ['README.md', 'LICENSE', '校记.md'];
  const missing = need.filter((f) => !fs.existsSync(path.join(root, f)));
  return missing.length ? `缺 ${missing.join(',')}` : true;
});
t('README 写明底本与许可', () => {
  const md = read('README.md');
    const need = [/底本/, /MIT/, /CC BY-SA 4\.0/, /不构成医疗建议|不是医疗/];
  const missing = need.filter((re) => !re.test(md));
  return missing.length ? `README 缺：${missing.join(',')}` : true;
});
t('站内保留底本声明', () => {
  if (!/不构成医疗建议/.test(html)) return '缺健康声明';
  if (!/未与清刻影印逐字对校|未校清刻/.test(html)) return '缺校勘状态说明';
  if (!/不称“校本”|不称「校本」|只称“转录”|只称「转录」/.test(html)) return '缺转录/校本口径';
  return true;
});

// --- 异文表 JSON ---
t('data/errata.json 存在且可解析', () => {
  const raw = read('data/errata.json');
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    return `不是合法 JSON：${e.message}`;
  }
  if (!Array.isArray(doc.entries)) return '缺 entries 数组';
  if (doc.count !== doc.entries.length) return `count(${doc.count}) 与实际条数(${doc.entries.length}) 不一致`;
  const bad = doc.entries.filter((e) => typeof e.chapter !== 'number' || !e.used || !e.variant);
  return bad.length ? `条目不完整：${bad.length} 条` : true;
});
t('errata 条数与校记表一致', () => {
  const md = read('校记.md');
  const lines = md.split('\n');
  const head = lines.findIndex((l) => l.replace(/\s/g, '').startsWith('|章|本站用字|'));
  if (head < 0) return '校记 异文表表头不见了';
  // 只取表头之后连续的表格行：遇到非表格行即停，避免把第五节校勘表也算进来
  const body = [];
  for (const l of lines.slice(head + 1)) {
    if (!l.trim().startsWith('|')) break;
    if (l.includes('---') && !body.length) continue;
    body.push(l);
  }
  const rowsOnly = body.filter((l) => l.split('|').length >= 4);
  const doc = JSON.parse(read('data/errata.json'));
  return doc.entries.length === rowsOnly.length
    ? true
    : `校记 ${rowsOnly.length} 行，JSON ${doc.entries.length} 条，需重跑 python tools/errata.py`;
});
t('errata 明确声明为转录而非校本', () => {
  const doc = JSON.parse(read('data/errata.json'));
  if (!/转录/.test(doc.disclaimer || '')) return 'disclaimer 未说明转录性质';
  if (!/清刻影印/.test(doc.disclaimer || '')) return 'disclaimer 未说明未含影印对照';
  return true;
});

t('段落锚点与段码齐备', () => {
  const need = ['id="seg-', 'class="seg-no"', "data-c=", "data-s="];
  const missing = need.filter((s) => !html.includes(s));
  return missing.length ? `缺 ${missing.join(',')}` : true;
});
t('深链接参数被解析', () => {
  if (!/param\.s/.test(html)) return '未解析 s 参数';
  if (!/function focusSeg/.test(html)) return '缺定位函数';
  return true;
});
t('站内检索在位', () => {
  const need = ['id="qInput"', 'id="qOut"', 'function buildIndex', 'function runSearch', "id=\"qClear\""];
  const missing = need.filter((s) => !html.includes(s));
  return missing.length ? `缺 ${missing.join(',')}` : true;
});
t('复制链接与提示在位', () => {
  if (!/function copyText/.test(html)) return '缺复制实现';
  if (!/id="toast"/.test(html)) return '缺提示条';
  if (/textContent=.*<mark/i.test(html)) return '提示条内容未转义';
  return true;
});
t('检索结果做了转义', () => {
  if (!/function escHtml/.test(html)) return '缺转义函数';
  return /escHtml\(/.test(html) ? true : '检索片段未走转义';
});

// --- 输出 ---
const okCount = stats.total - fails.length;
console.log(`\n结构测试：${okCount}/${stats.total} 通过`);
if (fails.length) {
  console.log('\n未通过：');
  fails.forEach((f) => console.log('  × ' + f));
  process.exit(1);
} else {
  console.log('全部通过');
}
