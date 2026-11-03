// ABOUTME: Own the picker's bilingual copy and its English fallback.
// ABOUTME: Keep the dictionary flat so the locale service's typed lookup stays optional.

/** Locale namespace owned by this plugin's browser copy. */
export const LOCALE_NS = "ide-selection";

/** English dictionary; also the fallback when no locale service is mounted. */
export const en = {
  "group.ides": "Connected IDEs",
  "group.mode": "This session",
  "ide.detail": "{workspace} · {host}:{port}",
  "workspace.unknown": "unknown workspace",
  "auto.label": "Automatic (workspace match)",
  "auto.target": "Connects to {name} — {workspace}",
  "auto.none": "No workspace-matching IDE is reachable",
  "off.label": "Disable IDE integration",
  "off.detail": "Stop reading IDE selections and hide the status pill for this session",
} as const;

/** Simplified Chinese dictionary. */
export const zh = {
  "group.ides": "可连接的 IDE",
  "group.mode": "本会话",
  "ide.detail": "{workspace} · {host}:{port}",
  "workspace.unknown": "未知工作区",
  "auto.label": "自动（按工作区匹配）",
  "auto.target": "将连接 {name} — {workspace}",
  "auto.none": "当前没有匹配工作区的 IDE",
  "off.label": "关闭 IDE 集成",
  "off.detail": "本会话不再读取 IDE 选区，并隐藏状态栏",
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
