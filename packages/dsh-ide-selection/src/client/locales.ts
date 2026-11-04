// ABOUTME: Own the picker's bilingual copy and its English fallback.
// ABOUTME: Keep the dictionary flat so the locale service's typed lookup stays optional.

/** Locale namespace owned by this plugin's browser copy. */
export const LOCALE_NS = "ide-selection";

/** English dictionary; also the fallback when no locale service is mounted. */
export const en = {
  "command.description": "Choose which local IDE supplies selection context for this session",
  "status.connected": "IDE connected",
  "status.disconnected": "No IDE connected",
  "picker.title": "Select IDE",
  "picker.auto": "Automatic",
  "picker.autoTarget": "Workspace match · {name}",
  "picker.manual": "Manual selection",
  "picker.loading": "Loading IDEs…",
  "picker.empty": "No IDEs are reachable",
  "picker.session": "Open a session to choose an IDE",
  "picker.retry": "Retry",
  "status.selected": "Selected",
  "status.lines": "{count} Lines Selected",
  "error.list": "the IDE list request failed",
  "error.payload": "the IDE list returned an unexpected payload",
  "error.choice": "the IDE choice failed",
  "group.ides": "Available IDEs",
  "group.mode": "This session",
  "ide.detail": "{workspace} · {host}:{port}",
  "ide.workspaceMismatch": "Outside this session's workspace",
  "workspace.unknown": "unknown workspace",
  "auto.label": "Automatic (workspace match)",
  "auto.target": "Connects to {name} — {workspace}",
  "auto.none": "No workspace-matching IDE is reachable",
  "off.label": "Disable IDE integration",
  "off.detail": "Stop reading IDE selections for this session",
} as const;

/** Simplified Chinese dictionary. */
export const zh = {
  "command.description": "选择本会话由哪个本地 IDE 提供选区",
  "status.connected": "IDE 已连接",
  "status.disconnected": "尚未连接任何 IDE",
  "picker.title": "选择 IDE",
  "picker.auto": "自动选择",
  "picker.autoTarget": "按工作区匹配 · {name}",
  "picker.manual": "手动选择",
  "picker.loading": "正在读取 IDE 列表…",
  "picker.empty": "当前没有可连接的 IDE",
  "picker.session": "请打开一个会话以选择 IDE",
  "picker.retry": "重试",
  "status.selected": "已选中",
  "status.lines": "已选中 {count} 行",
  "error.list": "读取 IDE 列表失败",
  "error.payload": "IDE 列表的数据无法识别",
  "error.choice": "切换 IDE 失败",
  "group.ides": "可连接的 IDE",
  "group.mode": "本会话",
  "ide.detail": "{workspace} · {host}:{port}",
  "ide.workspaceMismatch": "不在本会话工作区内",
  "workspace.unknown": "未知工作区",
  "auto.label": "自动（按工作区匹配）",
  "auto.target": "将连接 {name} — {workspace}",
  "auto.none": "当前没有匹配工作区的 IDE",
  "off.label": "关闭 IDE 集成",
  "off.detail": "本会话不再读取 IDE 选区",
} as const;

/**
 * Render one key from the English dictionary.
 * @param key - dictionary key.
 * @param params - optional `{name}` template values.
 * @returns the interpolated text, or the key itself when it is unknown.
 */
export function fallbackText(key: string, params?: Record<string, unknown>): string {
  const template = (en as Record<string, string>)[key] ?? key;
  return params ? interpolate(template, params) : template;
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}
