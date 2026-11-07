// ABOUTME: Provides Plugins-page sign-in and edge-docked subscription usage for xAI SuperGrok.
// ABOUTME: The browser half uses the dsh web controls and never imports a Grok session file.

window.__ModuleLoader__.load({
  id: "@balaenis/dsh-xai-auth",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const react = require("react");
    const reactDom = require("react-dom");
    const ui = require("@deepseek-ai/dsh-client-ui-primitives");

    const POLL_MS = 2000;
    const NS = "dsh-xai-auth";
    const inject = ["slots", "connection", "locale", "configForms", "modelDirectories"];
    const GROK_PROVIDER_ID = "xai-supergrok";
    const STYLE_ID = "dsh-xai-auth-config";
    const zh = {
      showSidebarUsage: "显示悬浮用量",
      onlyShowUsageForGrok: "仅在会话切换 Grok 模型时显示",
      saveSettingsFailed: "无法保存用量显示设置",
      signIn: "登录",
      lead: "使用 xAI SuperGrok 订阅登录。批准后，在模型列表中选择 xai-supergrok。",
      status: "状态",
      failed: "登录失败",
      signedIn: "已登录",
      signedOut: "未登录",
      waiting: "等待批准",
      account: "账号",
      verify: "验证",
      openVerify: "打开验证页",
      models: "模型",
      usage: "用量",
      signOut: "退出登录",
      refreshModels: "刷新模型",
      cancel: "取消",
      signInFailed: "xAI SuperGrok 登录失败",
      usageLoading: "正在读取用量",
      quota: "额度",
      quotaWeek: "每周额度",
      quotaMonth: "每月额度",
      quotaDay: "每天额度",
      quotaOnDemand: "按量额度",
      remaining: "{left}% 剩余",
      remainingLabel: "{title} {left}% 剩余",
      resetDue: "已到重置时间",
      resetsIn: "{time}后重置",
      underOneMinute: "不足 1 分钟",
      days: "{n} 天",
      hours: "{n} 小时",
      minutes: "{n} 分钟",
      prepaid: "预付 {amount}",
      onDemand: "按量 {amount}",
      onDemandOff: "按量未开启",
      onDemandDisabled: "按量 {amount}（未开启）",
      unified: "统一计费",
      prepaidLabel: "预付",
      usedReading: "Grok 用量 {percent}",
    };
    const en = {
      showSidebarUsage: "Show floating usage",
      onlyShowUsageForGrok: "Show only in conversations using Grok",
      saveSettingsFailed: "Could not save the usage display setting",
      signIn: "Sign in",
      lead: "Sign in with an xAI SuperGrok subscription. After approval, choose xai-supergrok in the model list.",
      status: "Status",
      failed: "Sign-in failed",
      signedIn: "Signed in",
      signedOut: "Signed out",
      waiting: "Waiting for approval",
      account: "Account",
      verify: "Verification",
      openVerify: "Open verification page",
      models: "Models",
      usage: "Usage",
      signOut: "Sign out",
      refreshModels: "Refresh models",
      cancel: "Cancel",
      signInFailed: "xAI SuperGrok sign-in failed",
      usageLoading: "Reading usage…",
      quota: "Quota",
      quotaWeek: "Weekly quota",
      quotaMonth: "Monthly quota",
      quotaDay: "Daily quota",
      quotaOnDemand: "On-demand quota",
      remaining: "{left}% left",
      remainingLabel: "{title}, {left}% left",
      resetDue: "Reset is due",
      resetsIn: "Resets in {time}",
      underOneMinute: "under 1 minute",
      days: "{n}d",
      hours: "{n}h",
      minutes: "{n}m",
      prepaid: "Prepaid {amount}",
      onDemand: "On-demand {amount}",
      onDemandOff: "On-demand is off",
      onDemandDisabled: "On-demand {amount} (off)",
      unified: "Unified billing",
      prepaidLabel: "Prepaid",
      usedReading: "Grok usage {percent}",
    };

    function call(ctx, endpoint, args) {
      return ctx.connection.rpc.call("/api", endpoint, { args: args ?? {} });
    }

    function failureText(error, t) {
      return error instanceof Error ? error.message : t("signInFailed");
    }

    function installStyle() {
      const style = document.getElementById(STYLE_ID) ?? document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = [
        "[data-xai-supergrok]{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}",
        "[data-xai-supergrok] .preference{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2);font-size:13px;line-height:20px}",
        "[data-xai-supergrok] .lead{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}",
        "[data-xai-supergrok] h4{margin:0;font-size:14px;line-height:20px;font-weight:500}",
        "[data-xai-supergrok] dl{margin:0}",
        "[data-xai-supergrok] dl>div{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:44px;padding:8px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
        "[data-xai-supergrok] dt{flex:none;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
        "[data-xai-supergrok] dd{min-width:0;margin:0;font-size:13px;line-height:20px;text-align:end;overflow-wrap:anywhere}",
        "[data-xai-supergrok] code{padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-module-platform);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px}",
        "[data-xai-supergrok] .status{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px}",
        "[data-xai-supergrok] .models{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}",
        "[data-xai-supergrok] a{color:var(--dsw-alias-label-primary);text-underline-offset:2px}",
        "[data-xai-supergrok] .error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}",
        "[data-xai-supergrok] .actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}",
        "[data-xai-supergrok] .usageRow{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:12px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
        "[data-xai-supergrok] .usageLabel{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
        "[data-xai-supergrok] .limits{display:flex;flex-direction:column;gap:20px}",
        "[data-xai-supergrok] .limit{display:flex;flex-direction:column;gap:8px}",
        "[data-xai-supergrok] .limitHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}",
        "[data-xai-supergrok] .limitTitle{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}",
        "[data-xai-supergrok] .limitReset{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
        "[data-xai-supergrok] .limitLeft{flex:none;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}",
        "[data-xai-supergrok] .limitTrack{display:block;height:6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);overflow:hidden}",
        "[data-xai-supergrok] .limitFill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-label-primary)}",
        "[data-xai-supergrok] .note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
        `[data-xai-usage-pill]{position:fixed;display:flex;width:${INDICATOR_WIDTH_PX}px;height:${INDICATOR_HEIGHT_PX}px}`,
        `[data-xai-usage-pill] .trigger{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;height:100%;padding:0;border:${BADGE_BORDER_PX}px solid color-mix(in srgb,var(--dsw-static-blue-450) 24%,transparent);border-radius:${BADGE_CORNER_RADIUS_PX}px;corner-shape:round;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-secondary);cursor:grab;touch-action:none;user-select:none;-webkit-app-region:no-drag;--dsw-elevation-stroke-color:transparent;box-shadow:var(--dsw-elevation-prominent);transition:box-shadow ${BADGE_GLOW_TRANSITION_MS}ms ease}`,
        `[data-xai-usage-pill][data-edge=left]:not([data-dragging=true]) .trigger{border-radius:0 ${BADGE_CORNER_RADIUS_PX}px ${BADGE_CORNER_RADIUS_PX}px 0;border-left-color:transparent}`,
        `[data-xai-usage-pill][data-edge=right]:not([data-dragging=true]) .trigger{border-radius:${BADGE_CORNER_RADIUS_PX}px 0 0 ${BADGE_CORNER_RADIUS_PX}px;border-right-color:transparent}`,
        "[data-xai-usage-pill][data-dragging=true] .trigger{cursor:grabbing}",
        `[data-xai-usage-pill] .trigger[aria-expanded=true],[data-xai-usage-pill] .trigger:hover{box-shadow:0 0 ${BADGE_GLOW_NEAR_BLUR_PX}px color-mix(in srgb,var(--dsw-static-blue-450) ${BADGE_GLOW_NEAR_ALPHA_PERCENT}%,transparent),0 0 ${BADGE_GLOW_FAR_BLUR_PX}px color-mix(in srgb,var(--dsw-static-blue-300) ${BADGE_GLOW_FAR_ALPHA_PERCENT}%,transparent),var(--dsw-elevation-prominent)}`,
        "@media (prefers-reduced-motion:reduce){[data-xai-usage-pill] .trigger{transition:none}}",
        "[data-xai-usage-pill] button.trigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}",
        "[data-xai-usage-pill] .trigger>svg{flex:none}",

        "[data-xai-usage-pending] .trigger{cursor:default}",
        `[data-xai-usage-pill] .ringTrack{fill:none;stroke:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);stroke-width:${RING_STROKE_PX}}`,
        `[data-xai-usage-pill] .ringFill{fill:none;stroke:var(--dsw-alias-label-primary);stroke-width:${RING_STROKE_PX};stroke-linecap:round}`,
        "[data-xai-usage-pill] .ringFill.low{stroke:var(--dsw-alias-state-error-primary)}",
        "[data-xai-usage-pill] .ringPercent{fill:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}",
        "[data-xai-usage-pill] .ringPercent.low{fill:var(--dsw-alias-state-error-primary)}",
        "[data-xai-usage-panel]{position:fixed;z-index:1100;box-sizing:border-box;width:min(264px,calc(100vw - 24px));padding:12px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);cursor:default}",
        "[data-xai-usage-panel] .header{display:flex;align-items:center;gap:6px}",
        "[data-xai-usage-panel] .headline{color:var(--dsw-alias-label-tertiary)}",
        "[data-xai-usage-panel] .headline:empty{display:none}",
        "[data-xai-usage-panel] .percent{font-weight:500;color:var(--dsw-alias-label-primary)}",
        "[data-xai-usage-panel] .figures{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
        "[data-xai-usage-panel] .bar{display:block;margin:10px 0 12px;height:6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);overflow:hidden}",
        "[data-xai-usage-panel] .segment{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-label-primary)}",
        "[data-xai-usage-panel] .rows{margin:6px 0 0}",
        "[data-xai-usage-panel] .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0}",
        "[data-xai-usage-panel] .row dt{color:var(--dsw-alias-label-secondary)}",
        "[data-xai-usage-panel] .row dd{margin:0;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
        "[data-xai-usage-panel] .error{margin:8px 0 0;color:var(--dsw-alias-label-error)}",
      ].join("");
      document.head.appendChild(style);
    }

    function fact(label, value) {
      return react.createElement(
        "div",
        null,
        react.createElement("dt", null, label),
        react.createElement("dd", null, value),
      );
    }

    function remainingPercent(usedPercent) {
      const used = Math.max(0, Math.min(100, Number(usedPercent) || 0));
      return Math.round(100 - used);
    }

    function usedShare(usedPercent) {
      const used = Number(usedPercent);
      if (!Number.isFinite(used)) return 0;
      return Math.round(Math.max(0, Math.min(100, used)));
    }

    function quotaKind(usage) {
      if (
        usage?.periodKind === "week" ||
        usage?.periodKind === "month" ||
        usage?.periodKind === "day"
      )
        return usage.periodKind;
      const period = usage?.period;
      if (typeof period !== "string") return undefined;
      if (period.startsWith("每周")) return "week";
      if (period.startsWith("每月")) return "month";
      if (period.startsWith("每天")) return "day";
      return undefined;
    }

    function quotaTitle(usage, t) {
      const kind = quotaKind(usage);
      if (kind === "week") return t("quotaWeek");
      if (kind === "month") return t("quotaMonth");
      if (kind === "day") return t("quotaDay");
      return t("quota");
    }

    function legacyResetCompact(text) {
      if (text === "已到重置时间") return "due";
      if (text === "不足 1 分钟") return "<1m";
      const compact = text
        .replace(/(\d+)\s*天/g, "$1d")
        .replace(/(\d+)\s*小时/g, "$1h")
        .replace(/(\d+)\s*分钟/g, "$1m")
        .replace(/\s+/g, " ")
        .trim();
      return /^(?:\d+d(?: \d+h)?|\d+h(?: \d+m)?|\d+m|<1m|due)$/.test(compact) ? compact : undefined;
    }

    function formatDuration(compact, t) {
      return compact
        .replace(/(\d+)d/g, (_, n) => t("days", { n }))
        .replace(/(\d+)h/g, (_, n) => t("hours", { n }))
        .replace(/(\d+)m/g, (_, n) => t("minutes", { n }))
        .replace(/\s+/g, " ")
        .trim();
    }

    function resetLine(credits, t) {
      if (credits === undefined) return undefined;
      const compact =
        typeof credits.resetsCompact === "string"
          ? credits.resetsCompact
          : typeof credits.resetsIn === "string"
            ? (legacyResetCompact(credits.resetsIn) ??
              (/^(?:\d+d(?: \d+h)?|\d+h(?: \d+m)?|\d+m|<1m|due)$/.test(credits.resetsIn)
                ? credits.resetsIn
                : undefined))
            : undefined;
      if (compact === undefined)
        return typeof credits.resetsIn === "string" ? credits.resetsIn : undefined;
      if (compact === "due") return t("resetDue");
      if (compact === "<1m") return t("resetsIn", { time: t("underOneMinute") });
      return t("resetsIn", { time: formatDuration(compact, t) });
    }

    function limitCard(title, usedPercent, resetText, t) {
      const left = remainingPercent(usedPercent);
      return react.createElement(
        "div",
        { className: "limit" },
        react.createElement(
          "div",
          { className: "limitHead" },
          react.createElement(
            "div",
            null,
            react.createElement("p", { className: "limitTitle" }, title),
            resetText === undefined
              ? null
              : react.createElement("p", { className: "limitReset" }, resetText),
          ),
          react.createElement("span", { className: "limitLeft" }, t("remaining", { left })),
        ),
        react.createElement(
          "span",
          {
            className: "limitTrack",
            role: "meter",
            "aria-label": t("remainingLabel", { title, left }),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": left,
          },
          react.createElement("span", { className: "limitFill", style: { width: `${left}%` } }),
        ),
      );
    }

    function usageBody(current, message, pending, t) {
      if (current === undefined) {
        if (message !== "")
          return react.createElement("p", { className: "error", role: "alert" }, message);
        return pending ? react.createElement("p", { className: "note" }, t("usageLoading")) : null;
      }
      const cards = [];
      if (current.credits !== undefined) {
        cards.push(
          limitCard(
            quotaTitle(current, t),
            current.credits.percent,
            resetLine(current.credits, t),
            t,
          ),
        );
      }
      if (current.effective !== undefined)
        cards.push(limitCard(t("quotaOnDemand"), current.effective.percent, undefined, t));
      const notes = [];
      if (current.tier !== undefined) notes.push(current.tier);
      if (Array.isArray(current.products) && current.products.length > 0) {
        notes.push(
          current.products
            .map((product) => `${product.label} ${Math.round(product.percent)}%`)
            .join(" · "),
        );
      }
      if (current.unified === true) notes.push(t("unified"));
      if (current.prepaid !== undefined) notes.push(t("prepaid", { amount: current.prepaid }));
      if (current.onDemand !== undefined || current.onDemandDisabled === true) {
        notes.push(
          current.onDemand === undefined
            ? t("onDemandOff")
            : current.onDemandDisabled === true
              ? t("onDemandDisabled", { amount: current.onDemand })
              : t("onDemand", { amount: current.onDemand }),
        );
      }
      if (cards.length === 0 && notes.length === 0 && message === "") return null;
      return react.createElement(
        "div",
        { className: "limits" },
        ...cards,
        notes.length === 0
          ? null
          : react.createElement("p", { className: "note" }, notes.join(" · ")),
        message === ""
          ? null
          : react.createElement("p", { className: "error", role: "alert" }, message),
      );
    }

    function meterRow(label, value) {
      return react.createElement(
        "div",
        { className: "row" },
        react.createElement("dt", null, label),
        react.createElement("dd", null, value),
      );
    }

    /** Account usage details opened by the floating indicator. */
    function usagePanel(current, message, pending, t) {
      if (current?.credits === undefined) {
        if (message !== "")
          return react.createElement("p", { className: "error", role: "alert" }, message);
        return pending ? react.createElement("p", { className: "note" }, t("usageLoading")) : null;
      }
      const used = usedShare(current.credits.percent);
      const left = remainingPercent(current.credits.percent);
      const parts = t("usedReading", { percent: "\u0000" }).split("\u0000");
      const before = (parts[0] ?? "").trim();
      const after = (parts[1] ?? "").trim();
      const reset = resetLine(current.credits, t);
      const rows = [];
      if (current.tier !== undefined) rows.push(meterRow(t("usage"), current.tier));
      for (const product of current.products ?? [])
        rows.push(meterRow(product.label, `${Math.round(product.percent)}%`));
      if (current.prepaid !== undefined) rows.push(meterRow(t("prepaidLabel"), current.prepaid));
      if (current.onDemand !== undefined || current.onDemandDisabled === true) {
        const value =
          current.onDemand === undefined
            ? t("onDemandOff")
            : current.onDemandDisabled === true
              ? t("onDemandDisabled", { amount: current.onDemand })
              : current.onDemand;
        rows.push(meterRow(t("quotaOnDemand"), value));
      } else if (current.effective !== undefined) {
        rows.push(meterRow(t("quotaOnDemand"), `${usedShare(current.effective.percent)}%`));
      }
      return react.createElement(
        react.Fragment,
        null,
        react.createElement(
          "div",
          { className: "header" },
          before === "" ? null : react.createElement("span", { className: "headline" }, before),
          react.createElement("span", { className: "percent" }, `${used}%`),
          after === "" ? null : react.createElement("span", { className: "headline" }, after),
          reset === undefined ? null : react.createElement("span", { className: "figures" }, reset),
        ),
        react.createElement(
          "div",
          {
            className: "bar",
            role: "meter",
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": left,
            "aria-label": t("remainingLabel", { title: t("usage"), left }),
          },
          left === 0
            ? null
            : react.createElement("div", { className: "segment", style: { width: `${left}%` } }),
        ),
        rows.length === 0 ? null : react.createElement("dl", { className: "rows" }, rows),
        message === ""
          ? null
          : react.createElement("p", { className: "error", role: "alert" }, message),
      );
    }

    function UsageSetting({ form, t, field }) {
      const subscribe = react.useCallback((listener) => form.subscribe(listener), [form]);
      const getSnapshot = react.useCallback(() => form.getSnapshot(), [form]);
      const snapshot = react.useSyncExternalStore(subscribe, getSnapshot);
      const [busy, setBusy] = react.useState(false);
      const [failed, setFailed] = react.useState(false);
      const save = async (next) => {
        setBusy(true);
        setFailed(false);
        try {
          if (!(await form.set(field, next))) setFailed(true);
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      };
      return react.createElement(
        react.Fragment,
        null,
        react.createElement(
          "div",
          { className: "preference" },
          react.createElement("span", null, t(field)),
          react.createElement(ui.Switch, {
            checked: snapshot.value?.[field] === true,
            disabled: busy || snapshot.status !== "ready" || !snapshot.writable,
            label: t(field),
            onChange: (next) => {
              void save(next);
            },
          }),
        ),
        failed
          ? react.createElement("p", { className: "error", role: "alert" }, t("saveSettingsFailed"))
          : null,
      );
    }

    function LoginPanel(props) {
      const { ctx, t, form } = props;
      const tRef = react.useRef(t);
      tRef.current = t;
      const [status, setStatus] = react.useState(undefined);
      const [error, setError] = react.useState("");
      const [busy, setBusy] = react.useState(false);

      const refresh = react.useCallback(async () => {
        const result = await call(ctx, "xaiSupergrok/status");
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setStatus(result.value);
      }, [ctx]);

      react.useEffect(() => {
        installStyle();
        let timer;
        let stopped = false;
        const tick = async () => {
          try {
            await refresh();
          } catch (caught) {
            if (!stopped) setError(failureText(caught, tRef.current));
          }
        };
        void tick();
        timer = setInterval(() => {
          void tick();
        }, POLL_MS);
        return () => {
          stopped = true;
          clearInterval(timer);
        };
      }, [refresh]);

      const run = async (endpoint) => {
        setBusy(true);
        setError("");
        try {
          const result = await call(ctx, endpoint);
          if (!result.ok) setError(result.error.message);
          await refresh();
        } catch (caught) {
          setError(failureText(caught, t));
        } finally {
          setBusy(false);
        }
      };

      const pending = status?.pending;
      const signedIn = status?.signedIn === true;
      const models = Array.isArray(status?.models) ? status.models : [];
      const shownError = error || status?.error;
      const state = shownError
        ? "error"
        : signedIn
          ? "done"
          : pending === undefined
            ? "idle"
            : "ongoing";
      const stateText = shownError
        ? t("failed")
        : signedIn
          ? t("signedIn")
          : pending === undefined
            ? t("signedOut")
            : t("waiting");
      const refreshIcon =
        ui.IconRefreshOutlineRegular === undefined
          ? undefined
          : react.createElement(ui.IconRefreshOutlineRegular, { size: 13 });

      return react.createElement(
        "div",
        { "data-xai-supergrok": "" },
        form === undefined
          ? null
          : ["showSidebarUsage", "onlyShowUsageForGrok"].map((field) =>
              react.createElement(UsageSetting, { key: field, form, t, field }),
            ),
        react.createElement("h4", null, t("signIn")),
        react.createElement("p", { className: "lead" }, t("lead")),
        react.createElement(
          "dl",
          null,
          fact(
            t("status"),
            react.createElement(
              "span",
              { className: "status" },
              ui.StateDot === undefined ? null : react.createElement(ui.StateDot, { state }),
              stateText,
            ),
          ),
          signedIn && status.account !== undefined ? fact(t("account"), status.account) : null,
          pending === undefined
            ? null
            : fact(
                t("verify"),
                react.createElement(
                  "span",
                  null,
                  react.createElement(
                    "a",
                    { href: pending.url, target: "_blank", rel: "noreferrer" },
                    t("openVerify"),
                  ),
                  ` · ${pending.code}`,
                ),
              ),
          !signedIn || models.length === 0
            ? null
            : fact(
                t("models"),
                react.createElement(
                  "span",
                  { className: "models" },
                  models.map((id) => react.createElement("code", { key: id }, id)),
                ),
              ),
          (() => {
            if (!signedIn) return null;
            const body = usageBody(
              status?.usage,
              status?.usageError || "",
              status?.usagePending === true,
              t,
            );
            if (body === null) return null;
            return react.createElement(
              "div",
              { className: "usageRow" },
              react.createElement("div", { className: "usageLabel" }, t("usage")),
              body,
            );
          })(),
        ),
        shownError === undefined
          ? null
          : react.createElement("p", { className: "error", role: "alert" }, shownError),
        react.createElement(
          "div",
          { className: "actions" },
          signedIn
            ? react.createElement(
                ui.Button,
                {
                  variant: "outline",
                  size: "sm",
                  disabled: busy,
                  onClick: () => {
                    void run("xaiSupergrok/signOut");
                  },
                },
                t("signOut"),
              )
            : react.createElement(
                ui.Button,
                {
                  variant: "primary",
                  size: "sm",
                  disabled: busy || pending !== undefined,
                  onClick: () => {
                    void run("xaiSupergrok/start");
                  },
                },
                t("signIn"),
              ),
          signedIn
            ? react.createElement(
                ui.Button,
                {
                  variant: "outline",
                  size: "sm",
                  icon: refreshIcon,
                  disabled: busy,
                  onClick: () => {
                    void run("xaiSupergrok/refreshModels");
                  },
                },
                t("refreshModels"),
              )
            : null,
          pending === undefined
            ? null
            : react.createElement(
                ui.Button,
                {
                  variant: "ghost",
                  size: "sm",
                  disabled: busy,
                  onClick: () => {
                    void run("xaiSupergrok/cancel");
                  },
                },
                t("cancel"),
              ),
        ),
      );
    }

    const FULL_PERCENT = 100;
    const BADGE_SCALE_PERCENT = 80;
    const RING_BASE_SIZE_PX = 48;
    const RING_SIZE_PX = scaledBadgePixels(RING_BASE_SIZE_PX);
    const BADGE_BORDER_PX = scaledBadgePixels(1);
    const BADGE_CORNER_RADIUS_PX = scaledBadgePixels(16);
    const BADGE_GLOW_NEAR_BLUR_PX = scaledBadgePixels(12);
    const BADGE_GLOW_FAR_BLUR_PX = scaledBadgePixels(24);
    const BADGE_GLOW_NEAR_ALPHA_PERCENT = 28;
    const BADGE_GLOW_FAR_ALPHA_PERCENT = 16;
    const BADGE_GLOW_TRANSITION_MS = 160;
    const DOCK_TRAVEL_MS = 220;
    const DOCK_JELLY_MS = 480;
    const DOCK_TRAVEL_EASING = "cubic-bezier(0.22,1,0.36,1)";
    const DOCK_IMPACT_OFFSET = DOCK_TRAVEL_MS / DOCK_JELLY_MS;
    const DOCK_REBOUND_OFFSET = 0.7;
    const DOCK_SETTLE_OFFSET = 0.86;
    const DOCK_IMPACT_SCALE_X = 0.88;
    const DOCK_IMPACT_SCALE_Y = 1.08;
    const DOCK_REBOUND_SCALE_X = 1.06;
    const DOCK_REBOUND_SCALE_Y = 0.96;
    const DOCK_SETTLE_SCALE_X = 0.98;
    const DOCK_SETTLE_SCALE_Y = 1.02;
    const INDICATOR_WIDTH_PX = 50;
    const INDICATOR_HEIGHT_PX = 40;
    const RING_CENTER_PX = RING_BASE_SIZE_PX / 2;
    const RING_RADIUS_PX = 19;
    const RING_STROKE_PX = 3;
    const RING_START_ANGLE_DEG = -90;
    const LOW_REMAINING_PERCENT = 5;
    const EDGE_MARGIN_PX = 12;
    const INITIAL_VERTICAL_FRACTION = 0.5;
    const DRAG_THRESHOLD_PX = 4;
    const TOOLTIP_DELAY_MS = 200;
    const POPOVER_GAP_PX = 8;
    const POPOVER_MARGIN_PX = 12;
    const USAGE_SLOT_ORDER = 2;
    const useAnchoredPosition = ui.useAnchoredPosition ?? (() => null);
    const useDismissOnOutsidePointer = ui.useDismissOnOutsidePointer ?? (() => {});

    function scaledBadgePixels(value) {
      return (value * BADGE_SCALE_PERCENT) / FULL_PERCENT;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    // The right-column marker is a layout seam; its preceding sibling is the main column.
    // Do not depend on the shell's generated CSS class names.
    function useContentBounds(rootRef, visible) {
      const [bounds, setBounds] = react.useState(null);
      react.useLayoutEffect(() => {
        if (!visible) return undefined;
        const frame = rootRef.current?.closest("[data-shell-overlay]")?.parentElement;
        const center = frame?.querySelector("[data-rightbar-col]")?.previousElementSibling;
        if (!center) return undefined;
        const measure = () => {
          const rect = center.getBoundingClientRect();
          const top = rect.top + EDGE_MARGIN_PX;
          const bottom = rect.bottom - EDGE_MARGIN_PX - INDICATOR_HEIGHT_PX;
          const right = rect.right - INDICATOR_WIDTH_PX;
          const hidden =
            center.inert ||
            frame.hasAttribute("data-rightbar-fullscreen") ||
            right < rect.left ||
            bottom < top;
          const next = { left: rect.left, right, top, bottom, hidden };
          setBounds((previous) =>
            previous && Object.keys(next).every((key) => previous[key] === next[key])
              ? previous
              : next,
          );
        };
        measure();
        const resize = new ResizeObserver(measure);
        resize.observe(center);
        resize.observe(frame);
        const mutation = new MutationObserver(measure);
        mutation.observe(frame, { attributes: true });
        mutation.observe(center, { attributes: true, attributeFilter: ["inert"] });
        window.addEventListener("resize", measure);
        return () => {
          resize.disconnect();
          mutation.disconnect();
          window.removeEventListener("resize", measure);
        };
      }, [rootRef, visible]);
      return bounds;
    }

    function usageRing(remaining) {
      const circle = { cx: RING_CENTER_PX, cy: RING_CENTER_PX, r: RING_RADIUS_PX };
      return react.createElement(
        "svg",
        {
          viewBox: `0 0 ${RING_BASE_SIZE_PX} ${RING_BASE_SIZE_PX}`,
          width: RING_SIZE_PX,
          height: RING_SIZE_PX,
          "aria-hidden": true,
        },
        react.createElement("circle", { ...circle, className: "ringTrack" }),
        remaining === undefined || remaining === 0
          ? null
          : react.createElement("circle", {
              ...circle,
              className: remaining < LOW_REMAINING_PERCENT ? "ringFill low" : "ringFill",
              pathLength: FULL_PERCENT,
              strokeDasharray: `${remaining} ${FULL_PERCENT - remaining}`,
              strokeDashoffset: remaining,
              transform: `rotate(${RING_START_ANGLE_DEG} ${RING_CENTER_PX} ${RING_CENTER_PX})`,
            }),
        remaining === undefined
          ? null
          : react.createElement(
              "text",
              {
                className: remaining < LOW_REMAINING_PERCENT ? "ringPercent low" : "ringPercent",
                x: RING_CENTER_PX,
                y: RING_CENTER_PX,
                textAnchor: "middle",
                dominantBaseline: "central",
              },
              `${remaining}%`,
            ),
      );
    }

    function useGrokSelection(ctx, useSessions, enabled) {
      const sessionId = useSessions((state) =>
        enabled
          ? Object.values(state.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id
          : undefined,
      );
      const directory =
        sessionId === undefined ? undefined : ctx.modelDirectories.directoryFor(sessionId);
      const subscribe = react.useCallback(
        (listener) => directory?.store.subscribe(listener) ?? (() => {}),
        [directory],
      );
      const getSnapshot = react.useCallback(
        () => directory?.store.getSnapshot() ?? null,
        [directory],
      );
      const snapshot = react.useSyncExternalStore(subscribe, getSnapshot);
      react.useEffect(() => {
        if (directory) void directory.load().catch(() => {});
      }, [directory]);
      return snapshot?.current?.provider === GROK_PROVIDER_ID;
    }

    function FloatingUsagePill(props) {
      const { ctx, t, useSessions, usePanelInfo } = props;
      const conversationVisible = usePanelInfo((info) => info.activePanelId === null);
      const [status, setStatus] = react.useState(undefined);
      const [open, setOpen] = react.useState(false);
      const rootRef = react.useRef(null);
      const panelRef = react.useRef(null);
      const dragRef = react.useRef(null);
      const suppressClickRef = react.useRef(false);
      const pendingDockRef = react.useRef(null);
      const dockAnimationsRef = react.useRef([]);
      const [dock, setDock] = react.useState({
        edge: "right",
        fraction: INITIAL_VERTICAL_FRACTION,
      });
      const [point, setPoint] = react.useState(null);
      const credits = status?.usage?.credits;
      const used = credits === undefined ? undefined : usedShare(credits.percent);
      const remaining = credits === undefined ? undefined : remainingPercent(credits.percent);
      const signedIn = status?.signedIn === true;
      const showSidebarUsage = status?.showSidebarUsage === true;
      const onlyShowUsageForGrok = status?.onlyShowUsageForGrok === true;
      const grokSelected = useGrokSelection(
        ctx,
        useSessions,
        onlyShowUsageForGrok && showSidebarUsage && signedIn && conversationVisible,
      );
      const modelVisible = !onlyShowUsageForGrok || (conversationVisible && grokSelected);
      const visible =
        showSidebarUsage &&
        signedIn &&
        modelVisible &&
        (used !== undefined || status?.usagePending === true);
      const bounds = useContentBounds(rootRef, visible);
      const available = visible && used !== undefined;
      const interactive = available && bounds !== null && !bounds.hidden;
      const placement =
        bounds === null
          ? { visibility: "hidden", left: 0, top: 0 }
          : {
              visibility: bounds.hidden ? "hidden" : "visible",
              left: point
                ? clamp(point.x, bounds.left, bounds.right)
                : dock.edge === "left"
                  ? bounds.left
                  : bounds.right,
              top: point
                ? clamp(point.y, bounds.top, bounds.bottom)
                : bounds.top + dock.fraction * (bounds.bottom - bounds.top),
            };
      const dismiss = () => setOpen(false);
      const move = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId || !bounds) return;
        if (
          !drag.moved &&
          Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX
        )
          return;
        if (!drag.moved) dismiss();
        drag.moved = true;
        drag.point = {
          x: clamp(event.clientX - drag.offsetX, bounds.left, bounds.right),
          y: clamp(event.clientY - drag.offsetY, bounds.top, bounds.bottom),
        };
        setPoint(drag.point);
      };
      const finish = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        dragRef.current = null;
        if (drag.moved && bounds) {
          const { x, y } = drag.point;
          pendingDockRef.current = {
            x: clamp(x, bounds.left, bounds.right),
            y: clamp(y, bounds.top, bounds.bottom),
          };
          setDock({
            edge: x - bounds.left < bounds.right - x ? "left" : "right",
            fraction:
              bounds.bottom === bounds.top
                ? INITIAL_VERTICAL_FRACTION
                : clamp((y - bounds.top) / (bounds.bottom - bounds.top), 0, 1),
          });
          suppressClickRef.current = true;
        }
        setPoint(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      };
      react.useLayoutEffect(() => {
        const from = pendingDockRef.current;
        pendingDockRef.current = null;
        if (!from || point !== null || !interactive) return undefined;
        const root = rootRef.current;
        const trigger = root?.querySelector(".trigger");
        const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (
          motion?.matches ||
          typeof root?.animate !== "function" ||
          typeof trigger?.animate !== "function"
        )
          return undefined;
        const corner = `${BADGE_CORNER_RADIUS_PX}px`;
        const dockedCorners =
          dock.edge === "left" ? `0 ${corner} ${corner} 0` : `${corner} 0 0 ${corner}`;
        const dockBorder = dock.edge === "left" ? "borderLeftColor" : "borderRightColor";
        const borderColor = window.getComputedStyle(trigger).borderTopColor;
        const origin = `${dock.edge} center`;
        const animations = [
          root.animate(
            [
              { transform: `translate(${from.x - placement.left}px,${from.y - placement.top}px)` },
              { transform: "translate(0px,0px)" },
            ],
            { duration: DOCK_TRAVEL_MS, easing: DOCK_TRAVEL_EASING },
          ),
          trigger.animate(
            [
              {
                offset: 0,
                transform: "scale(1,1)",
                borderRadius: corner,
                [dockBorder]: borderColor,
              },
              {
                offset: DOCK_IMPACT_OFFSET,
                transform: `scale(${DOCK_IMPACT_SCALE_X},${DOCK_IMPACT_SCALE_Y})`,
                borderRadius: dockedCorners,
                [dockBorder]: "transparent",
              },
              {
                offset: DOCK_REBOUND_OFFSET,
                transform: `scale(${DOCK_REBOUND_SCALE_X},${DOCK_REBOUND_SCALE_Y})`,
                borderRadius: dockedCorners,
                [dockBorder]: "transparent",
              },
              {
                offset: DOCK_SETTLE_OFFSET,
                transform: `scale(${DOCK_SETTLE_SCALE_X},${DOCK_SETTLE_SCALE_Y})`,
                borderRadius: dockedCorners,
                [dockBorder]: "transparent",
              },
              {
                offset: 1,
                transform: "scale(1,1)",
                borderRadius: dockedCorners,
                [dockBorder]: "transparent",
              },
            ].map((frame) => ({ ...frame, transformOrigin: origin })),
            {
              duration: DOCK_JELLY_MS,
              easing: "ease-in-out",
            },
          ),
        ];
        dockAnimationsRef.current = animations;
        const cancel = () => {
          for (const animation of animations) animation.cancel();
          dockAnimationsRef.current = [];
        };
        const onMotionChange = (event) => {
          if (event.matches) cancel();
        };
        motion?.addEventListener("change", onMotionChange);
        return () => {
          motion?.removeEventListener("change", onMotionChange);
          cancel();
        };
      }, [dock, point, bounds, interactive]);

      const position = useAnchoredPosition({
        open: open && interactive,
        anchorRef: rootRef,
        panelRef,
        side: "top",
        align: dock.edge === "right" ? "end" : "start",
        gap: POPOVER_GAP_PX,
        margin: POPOVER_MARGIN_PX,
      });
      useDismissOnOutsidePointer(rootRef, open && interactive, dismiss, panelRef);

      react.useEffect(() => {
        installStyle();
      }, []);

      react.useEffect(() => {
        let stopped = false;
        const tick = async () => {
          try {
            const result = await call(ctx, "xaiSupergrok/status");
            if (!stopped && result.ok) setStatus(result.value);
          } catch {
            // The pill stays on the last reading when a status poll fails.
          }
        };
        void tick();
        const timer = setInterval(() => {
          void tick();
        }, POLL_MS);
        return () => {
          stopped = true;
          clearInterval(timer);
        };
      }, [ctx]);

      react.useEffect(() => {
        if (!interactive && open) dismiss();
      }, [interactive, open]);

      react.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === "Escape") dismiss();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("keydown", onKeyDown);
        };
      }, [open]);

      if (!showSidebarUsage || !signedIn || !modelVisible) return null;
      if (!available) {
        if (status.usagePending !== true) return null;
        return react.createElement(
          "span",
          {
            ref: rootRef,
            "data-xai-usage-pill": "",
            "data-xai-usage-pending": "",
            "data-edge": dock.edge,
            style: placement,
          },
          react.createElement(
            "span",
            { className: "trigger", role: "status", "aria-label": t("usageLoading") },
            usageRing(undefined),
          ),
        );
      }
      const label = t("usedReading", { percent: `${used}%` });
      const trigger = react.createElement(
        "button",
        {
          type: "button",
          className: "trigger",
          "aria-label": label,
          title: ui.Tooltip === undefined ? label : undefined,
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          onPointerDown: (event) => {
            if (event.button !== 0 || !event.isPrimary || !bounds) return;
            for (const animation of dockAnimationsRef.current) animation.cancel();
            dockAnimationsRef.current = [];
            suppressClickRef.current = false;
            dragRef.current = {
              id: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              offsetX: event.clientX - placement.left,
              offsetY: event.clientY - placement.top,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          },
          onPointerMove: move,
          onPointerUp: finish,
          onPointerCancel: finish,
          onLostPointerCapture: finish,
          onClick: (event) => {
            if (suppressClickRef.current && event?.detail !== 0) {
              suppressClickRef.current = false;
              return;
            }
            setOpen((current) => !current);
          },
        },
        usageRing(remaining),
      );
      const body = usagePanel(
        status.usage,
        status.usageError || "",
        status.usagePending === true,
        t,
      );
      const panel =
        open && interactive && body !== null && typeof reactDom.createPortal === "function"
          ? reactDom.createPortal(
              react.createElement(
                "div",
                {
                  ref: panelRef,
                  "data-xai-usage-panel": "",
                  role: "dialog",
                  "aria-label": label,
                  style: position ?? { visibility: "hidden", left: 0, top: 0 },
                },
                body,
              ),
              document.body,
            )
          : null;
      const button =
        ui.Tooltip === undefined
          ? trigger
          : react.createElement(
              ui.Tooltip,
              {
                label,
                side: dock.edge === "left" ? "right" : "left",
                delayMs: TOOLTIP_DELAY_MS,
                disabled: open || point !== null || !interactive,
                portal: true,
              },
              trigger,
            );
      return react.createElement(
        "span",
        {
          ref: rootRef,
          "data-xai-usage-pill": "",
          "data-edge": dock.edge,
          "data-dragging": point !== null,
          style: placement,
        },
        button,
        panel,
      );
    }

    function isThisBundle(subject) {
      return subject?.kind === "bundle" && subject.pkg?.name === "@balaenis/dsh-xai-auth";
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-xai-auth: dictionaries");
      // After the bundle page's own rows and source block, so sign-in sits at the bottom.
      ctx.slots.inject("plugins.detail.section", () =>
        ctx.slots.register(
          {
            name: "plugins.detail.section",
            id: "dsh-xai-auth-sign-in",
            order: 1000,
            locale: NS,
          },
          (props) => {
            if (!isThisBundle(props.subject)) return null;
            const row = props.subject.pkg.rows?.find(
              (entry) => entry.moduleName === "@balaenis/dsh-xai-auth",
            );
            const form = row === undefined ? undefined : ctx.configForms.get(row.rowId);
            return react.createElement(LoginPanel, { ctx, t: props.t, form });
          },
        ),
      );
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "xai-supergrok-usage",
            order: USAGE_SLOT_ORDER,
            locale: NS,
          },
          (props) =>
            react.createElement(FloatingUsagePill, {
              ctx,
              t: props.t,
              useSessions: props.useSessions,
              usePanelInfo: props.usePanelInfo,
            }),
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
