// ABOUTME: Plugins-page sign-in for the xAI SuperGrok subscription, at the bottom of the bundle page.
// ABOUTME: The browser half uses the dsh web controls and never imports a Grok session file.

window.__ModuleLoader__.load({
  id: 'dsh-xai-auth',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const react = require('react')
    const reactDom = require('react-dom')
    const ui = require('@deepseek-ai/dsh-client-ui-primitives')

    const POLL_MS = 2000
    const NS = 'dsh-xai-auth'
    const inject = ['slots', 'connection', 'locale']
    const STYLE_ID = 'dsh-xai-auth-config'
    const zh = {
      signIn: '登录',
      lead: '使用 xAI SuperGrok 订阅登录。批准后，在模型列表中选择 xai-supergrok。',
      status: '状态',
      failed: '登录失败',
      signedIn: '已登录',
      signedOut: '未登录',
      waiting: '等待批准',
      account: '账号',
      verify: '验证',
      openVerify: '打开验证页',
      models: '模型',
      usage: '用量',
      signOut: '退出登录',
      refreshModels: '刷新模型',
      cancel: '取消',
      signInFailed: 'xAI SuperGrok 登录失败',
      usageLoading: '正在读取用量',
      quota: '额度',
      quotaWeek: '每周额度',
      quotaMonth: '每月额度',
      quotaDay: '每天额度',
      quotaOnDemand: '按量额度',
      remaining: '{left}% 剩余',
      remainingLabel: '{title} {left}% 剩余',
      resetDue: '已到重置时间',
      resetsIn: '{time}后重置',
      underOneMinute: '不足 1 分钟',
      days: '{n} 天',
      hours: '{n} 小时',
      minutes: '{n} 分钟',
      prepaid: '预付 {amount}',
      onDemand: '按量 {amount}',
      onDemandOff: '按量未开启',
      onDemandDisabled: '按量 {amount}（未开启）',
      unified: '统一计费',
      prepaidLabel: '预付',
      usedReading: 'Grok 用量 {percent}',
    }
    const en = {
      signIn: 'Sign in',
      lead: 'Sign in with an xAI SuperGrok subscription. After approval, choose xai-supergrok in the model list.',
      status: 'Status',
      failed: 'Sign-in failed',
      signedIn: 'Signed in',
      signedOut: 'Signed out',
      waiting: 'Waiting for approval',
      account: 'Account',
      verify: 'Verification',
      openVerify: 'Open verification page',
      models: 'Models',
      usage: 'Usage',
      signOut: 'Sign out',
      refreshModels: 'Refresh models',
      cancel: 'Cancel',
      signInFailed: 'xAI SuperGrok sign-in failed',
      usageLoading: 'Reading usage…',
      quota: 'Quota',
      quotaWeek: 'Weekly quota',
      quotaMonth: 'Monthly quota',
      quotaDay: 'Daily quota',
      quotaOnDemand: 'On-demand quota',
      remaining: '{left}% left',
      remainingLabel: '{title}, {left}% left',
      resetDue: 'Reset is due',
      resetsIn: 'Resets in {time}',
      underOneMinute: 'under 1 minute',
      days: '{n}d',
      hours: '{n}h',
      minutes: '{n}m',
      prepaid: 'Prepaid {amount}',
      onDemand: 'On-demand {amount}',
      onDemandOff: 'On-demand is off',
      onDemandDisabled: 'On-demand {amount} (off)',
      unified: 'Unified billing',
      prepaidLabel: 'Prepaid',
      usedReading: 'Grok usage {percent}',
    }

    function call(ctx, endpoint, args) {
      return ctx.connection.rpc.call('/api', endpoint, { args: args ?? {} })
    }

    function failureText(error, t) {
      return error instanceof Error ? error.message : t('signInFailed')
    }

    function installStyle() {
      const style = document.getElementById(STYLE_ID) ?? document.createElement('style')
      style.id = STYLE_ID
      style.textContent = [
        '[data-xai-supergrok]{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}',
        '[data-xai-supergrok] .lead{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}',
        '[data-xai-supergrok] h4{margin:0;font-size:14px;line-height:20px;font-weight:500}',
        '[data-xai-supergrok] dl{margin:0}',
        '[data-xai-supergrok] dl>div{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:44px;padding:8px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
        '[data-xai-supergrok] dt{flex:none;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
        '[data-xai-supergrok] dd{min-width:0;margin:0;font-size:13px;line-height:20px;text-align:end;overflow-wrap:anywhere}',
        '[data-xai-supergrok] code{padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-module-platform);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px}',
        '[data-xai-supergrok] .status{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px}',
        '[data-xai-supergrok] .models{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}',
        '[data-xai-supergrok] a{color:var(--dsw-alias-label-primary);text-underline-offset:2px}',
        '[data-xai-supergrok] .error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}',
        '[data-xai-supergrok] .actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}',
        '[data-xai-supergrok] .usageRow{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:12px 2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
        '[data-xai-supergrok] .usageLabel{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
        '[data-xai-supergrok] .limits{display:flex;flex-direction:column;gap:20px}',
        '[data-xai-supergrok] .limit{display:flex;flex-direction:column;gap:8px}',
        '[data-xai-supergrok] .limitHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
        '[data-xai-supergrok] .limitTitle{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}',
        '[data-xai-supergrok] .limitReset{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
        '[data-xai-supergrok] .limitLeft{flex:none;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
        '[data-xai-supergrok] .limitTrack{display:block;height:6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);overflow:hidden}',
        '[data-xai-supergrok] .limitFill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-label-primary)}',
        '[data-xai-supergrok] .note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
        '[data-xai-usage-pill]{display:inline-flex;flex:none;order:1}',
        '[data-xai-usage-pill] .trigger{display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));cursor:pointer}',
        '[data-xai-usage-pill] .trigger[aria-expanded=true],[data-xai-usage-pill] .trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
        '[data-xai-usage-pill] .ringTrack{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2}',
        '[data-xai-usage-pill] .ringFill{fill:none;stroke:var(--dsw-alias-label-tertiary);stroke-width:2;stroke-linecap:round}',
        '[data-xai-usage-panel]{position:fixed;z-index:1100;box-sizing:border-box;width:min(264px,calc(100vw - 24px));padding:12px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);cursor:default}',
        '[data-xai-usage-panel] .header{display:flex;align-items:center;gap:6px}',
        '[data-xai-usage-panel] .headline{color:var(--dsw-alias-label-tertiary)}',
        '[data-xai-usage-panel] .headline:empty{display:none}',
        '[data-xai-usage-panel] .percent{font-weight:500;color:var(--dsw-alias-label-primary)}',
        '[data-xai-usage-panel] .figures{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
        '[data-xai-usage-panel] .bar{display:flex;gap:1px;margin:10px 0 12px;height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}',
        '[data-xai-usage-panel] .segment{flex:none;min-width:2px;height:100%;border-radius:1px;background:var(--dsw-static-blue-450)}',
        '[data-xai-usage-panel] .rows{margin:6px 0 0}',
        '[data-xai-usage-panel] .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0}',
        '[data-xai-usage-panel] .row dt{color:var(--dsw-alias-label-secondary)}',
        '[data-xai-usage-panel] .row dd{margin:0;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
        '[data-xai-usage-panel] .error{margin:8px 0 0;color:var(--dsw-alias-label-error)}',
      ].join('')
      document.head.appendChild(style)
    }

    function fact(label, value) {
      return react.createElement(
        'div',
        null,
        react.createElement('dt', null, label),
        react.createElement('dd', null, value),
      )
    }

    function remainingPercent(usedPercent) {
      const used = Math.max(0, Math.min(100, Number(usedPercent) || 0))
      return Math.round(100 - used)
    }

    function usedShare(usedPercent) {
      const used = Number(usedPercent)
      if (!Number.isFinite(used)) return 0
      return Math.round(Math.max(0, Math.min(100, used)))
    }

    function quotaKind(usage) {
      if (
        usage?.periodKind === 'week' ||
        usage?.periodKind === 'month' ||
        usage?.periodKind === 'day'
      )
        return usage.periodKind
      const period = usage?.period
      if (typeof period !== 'string') return undefined
      if (period.startsWith('每周')) return 'week'
      if (period.startsWith('每月')) return 'month'
      if (period.startsWith('每天')) return 'day'
      return undefined
    }

    function quotaTitle(usage, t) {
      const kind = quotaKind(usage)
      if (kind === 'week') return t('quotaWeek')
      if (kind === 'month') return t('quotaMonth')
      if (kind === 'day') return t('quotaDay')
      return t('quota')
    }

    function legacyResetCompact(text) {
      if (text === '已到重置时间') return 'due'
      if (text === '不足 1 分钟') return '<1m'
      const compact = text
        .replace(/(\d+)\s*天/g, '$1d')
        .replace(/(\d+)\s*小时/g, '$1h')
        .replace(/(\d+)\s*分钟/g, '$1m')
        .replace(/\s+/g, ' ')
        .trim()
      return /^(?:\d+d(?: \d+h)?|\d+h(?: \d+m)?|\d+m|<1m|due)$/.test(compact) ? compact : undefined
    }

    function formatDuration(compact, t) {
      return compact
        .replace(/(\d+)d/g, (_, n) => t('days', { n }))
        .replace(/(\d+)h/g, (_, n) => t('hours', { n }))
        .replace(/(\d+)m/g, (_, n) => t('minutes', { n }))
        .replace(/\s+/g, ' ')
        .trim()
    }

    function resetLine(credits, t) {
      if (credits === undefined) return undefined
      const compact =
        typeof credits.resetsCompact === 'string'
          ? credits.resetsCompact
          : typeof credits.resetsIn === 'string'
            ? (legacyResetCompact(credits.resetsIn) ??
              (/^(?:\d+d(?: \d+h)?|\d+h(?: \d+m)?|\d+m|<1m|due)$/.test(credits.resetsIn)
                ? credits.resetsIn
                : undefined))
            : undefined
      if (compact === undefined)
        return typeof credits.resetsIn === 'string' ? credits.resetsIn : undefined
      if (compact === 'due') return t('resetDue')
      if (compact === '<1m') return t('resetsIn', { time: t('underOneMinute') })
      return t('resetsIn', { time: formatDuration(compact, t) })
    }

    function limitCard(title, usedPercent, resetText, t) {
      const left = remainingPercent(usedPercent)
      return react.createElement(
        'div',
        { className: 'limit' },
        react.createElement(
          'div',
          { className: 'limitHead' },
          react.createElement(
            'div',
            null,
            react.createElement('p', { className: 'limitTitle' }, title),
            resetText === undefined
              ? null
              : react.createElement('p', { className: 'limitReset' }, resetText),
          ),
          react.createElement('span', { className: 'limitLeft' }, t('remaining', { left })),
        ),
        react.createElement(
          'span',
          {
            className: 'limitTrack',
            role: 'meter',
            'aria-label': t('remainingLabel', { title, left }),
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': left,
          },
          react.createElement('span', { className: 'limitFill', style: { width: `${left}%` } }),
        ),
      )
    }

    function usageBody(current, message, pending, t) {
      if (current === undefined) {
        if (message !== '')
          return react.createElement('p', { className: 'error', role: 'alert' }, message)
        return pending ? react.createElement('p', { className: 'note' }, t('usageLoading')) : null
      }
      const cards = []
      if (current.credits !== undefined) {
        cards.push(
          limitCard(
            quotaTitle(current, t),
            current.credits.percent,
            resetLine(current.credits, t),
            t,
          ),
        )
      }
      if (current.effective !== undefined)
        cards.push(limitCard(t('quotaOnDemand'), current.effective.percent, undefined, t))
      const notes = []
      if (current.tier !== undefined) notes.push(current.tier)
      if (Array.isArray(current.products) && current.products.length > 0) {
        notes.push(
          current.products
            .map((product) => `${product.label} ${Math.round(product.percent)}%`)
            .join(' · '),
        )
      }
      if (current.unified === true) notes.push(t('unified'))
      if (current.prepaid !== undefined) notes.push(t('prepaid', { amount: current.prepaid }))
      if (current.onDemand !== undefined || current.onDemandDisabled === true) {
        notes.push(
          current.onDemand === undefined
            ? t('onDemandOff')
            : current.onDemandDisabled === true
              ? t('onDemandDisabled', { amount: current.onDemand })
              : t('onDemand', { amount: current.onDemand }),
        )
      }
      if (cards.length === 0 && notes.length === 0 && message === '') return null
      return react.createElement(
        'div',
        { className: 'limits' },
        ...cards,
        notes.length === 0
          ? null
          : react.createElement('p', { className: 'note' }, notes.join(' · ')),
        message === ''
          ? null
          : react.createElement('p', { className: 'error', role: 'alert' }, message),
      )
    }

    function meterRow(label, value) {
      return react.createElement(
        'div',
        { className: 'row' },
        react.createElement('dt', null, label),
        react.createElement('dd', null, value),
      )
    }

    /** Session popover, laid out like the composer context-used panel. */
    function sessionPanel(current, message, pending, t) {
      if (current?.credits === undefined) {
        if (message !== '')
          return react.createElement('p', { className: 'error', role: 'alert' }, message)
        return pending ? react.createElement('p', { className: 'note' }, t('usageLoading')) : null
      }
      const used = usedShare(current.credits.percent)
      const parts = t('usedReading', { percent: '\u0000' }).split('\u0000')
      const before = (parts[0] ?? '').trim()
      const after = (parts[1] ?? '').trim()
      const reset = resetLine(current.credits, t)
      const rows = []
      if (current.tier !== undefined) rows.push(meterRow(t('usage'), current.tier))
      for (const product of current.products ?? [])
        rows.push(meterRow(product.label, `${Math.round(product.percent)}%`))
      if (current.prepaid !== undefined) rows.push(meterRow(t('prepaidLabel'), current.prepaid))
      if (current.onDemand !== undefined || current.onDemandDisabled === true) {
        const value =
          current.onDemand === undefined
            ? t('onDemandOff')
            : current.onDemandDisabled === true
              ? t('onDemandDisabled', { amount: current.onDemand })
              : current.onDemand
        rows.push(meterRow(t('quotaOnDemand'), value))
      } else if (current.effective !== undefined) {
        rows.push(meterRow(t('quotaOnDemand'), `${usedShare(current.effective.percent)}%`))
      }
      return react.createElement(
        react.Fragment,
        null,
        react.createElement(
          'div',
          { className: 'header' },
          before === '' ? null : react.createElement('span', { className: 'headline' }, before),
          react.createElement('span', { className: 'percent' }, `${used}%`),
          after === '' ? null : react.createElement('span', { className: 'headline' }, after),
          reset === undefined ? null : react.createElement('span', { className: 'figures' }, reset),
        ),
        react.createElement(
          'div',
          {
            className: 'bar',
            role: 'meter',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': used,
          },
          used === 0
            ? null
            : react.createElement('div', { className: 'segment', style: { width: `${used}%` } }),
        ),
        rows.length === 0 ? null : react.createElement('dl', { className: 'rows' }, rows),
        message === ''
          ? null
          : react.createElement('p', { className: 'error', role: 'alert' }, message),
      )
    }

    function LoginPanel(props) {
      const { ctx, t } = props
      const tRef = react.useRef(t)
      tRef.current = t
      const [status, setStatus] = react.useState(undefined)
      const [error, setError] = react.useState('')
      const [busy, setBusy] = react.useState(false)

      const refresh = react.useCallback(async () => {
        const result = await call(ctx, 'xaiSupergrok/status')
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        setStatus(result.value)
      }, [ctx])

      react.useEffect(() => {
        installStyle()
        let timer
        let stopped = false
        const tick = async () => {
          try {
            await refresh()
          } catch (caught) {
            if (!stopped) setError(failureText(caught, tRef.current))
          }
        }
        void tick()
        timer = setInterval(() => {
          void tick()
        }, POLL_MS)
        return () => {
          stopped = true
          clearInterval(timer)
        }
      }, [refresh])

      const run = async (endpoint) => {
        setBusy(true)
        setError('')
        try {
          const result = await call(ctx, endpoint)
          if (!result.ok) setError(result.error.message)
          await refresh()
        } catch (caught) {
          setError(failureText(caught, t))
        } finally {
          setBusy(false)
        }
      }

      const pending = status?.pending
      const signedIn = status?.signedIn === true
      const models = Array.isArray(status?.models) ? status.models : []
      const shownError = error || status?.error
      const state = shownError
        ? 'error'
        : signedIn
          ? 'done'
          : pending === undefined
            ? 'idle'
            : 'ongoing'
      const stateText = shownError
        ? t('failed')
        : signedIn
          ? t('signedIn')
          : pending === undefined
            ? t('signedOut')
            : t('waiting')
      const refreshIcon =
        ui.IconRefreshOutlineRegular === undefined
          ? undefined
          : react.createElement(ui.IconRefreshOutlineRegular, { size: 13 })

      return react.createElement(
        'div',
        { 'data-xai-supergrok': '' },
        react.createElement('h4', null, t('signIn')),
        react.createElement('p', { className: 'lead' }, t('lead')),
        react.createElement(
          'dl',
          null,
          fact(
            t('status'),
            react.createElement(
              'span',
              { className: 'status' },
              ui.StateDot === undefined ? null : react.createElement(ui.StateDot, { state }),
              stateText,
            ),
          ),
          signedIn && status.account !== undefined ? fact(t('account'), status.account) : null,
          pending === undefined
            ? null
            : fact(
                t('verify'),
                react.createElement(
                  'span',
                  null,
                  react.createElement(
                    'a',
                    { href: pending.url, target: '_blank', rel: 'noreferrer' },
                    t('openVerify'),
                  ),
                  ` · ${pending.code}`,
                ),
              ),
          !signedIn || models.length === 0
            ? null
            : fact(
                t('models'),
                react.createElement(
                  'span',
                  { className: 'models' },
                  models.map((id) => react.createElement('code', { key: id }, id)),
                ),
              ),
          (() => {
            if (!signedIn) return null
            const body = usageBody(
              status?.usage,
              status?.usageError || '',
              status?.usagePending === true,
              t,
            )
            if (body === null) return null
            return react.createElement(
              'div',
              { className: 'usageRow' },
              react.createElement('div', { className: 'usageLabel' }, t('usage')),
              body,
            )
          })(),
        ),
        shownError === undefined
          ? null
          : react.createElement('p', { className: 'error', role: 'alert' }, shownError),
        react.createElement(
          'div',
          { className: 'actions' },
          signedIn
            ? react.createElement(
                ui.Button,
                {
                  variant: 'outline',
                  size: 'sm',
                  disabled: busy,
                  onClick: () => {
                    void run('xaiSupergrok/signOut')
                  },
                },
                t('signOut'),
              )
            : react.createElement(
                ui.Button,
                {
                  variant: 'primary',
                  size: 'sm',
                  disabled: busy || pending !== undefined,
                  onClick: () => {
                    void run('xaiSupergrok/start')
                  },
                },
                t('signIn'),
              ),
          signedIn
            ? react.createElement(
                ui.Button,
                {
                  variant: 'outline',
                  size: 'sm',
                  icon: refreshIcon,
                  disabled: busy,
                  onClick: () => {
                    void run('xaiSupergrok/refreshModels')
                  },
                },
                t('refreshModels'),
              )
            : null,
          pending === undefined
            ? null
            : react.createElement(
                ui.Button,
                {
                  variant: 'ghost',
                  size: 'sm',
                  disabled: busy,
                  onClick: () => {
                    void run('xaiSupergrok/cancel')
                  },
                },
                t('cancel'),
              ),
        ),
      )
    }

    const RING_RADIUS = 5.5
    const RING_LENGTH = 2 * Math.PI * RING_RADIUS
    const GROK_PROVIDER = 'xai-supergrok'
    const useAnchoredPosition = ui.useAnchoredPosition ?? (() => null)
    const useDismissOnOutsidePointer = ui.useDismissOnOutsidePointer ?? (() => {})

    function isGrokSelection(value) {
      const next = value !== null && typeof value === 'object' ? value.next : undefined
      return next !== null && typeof next === 'object' && next.provider === GROK_PROVIDER
    }

    function SessionUsagePill(props) {
      const { ctx, t, useProjection } = props
      const grok =
        typeof useProjection === 'function'
          ? useProjection('modelSelection', isGrokSelection) === true
          : false
      const [status, setStatus] = react.useState(undefined)
      const [open, setOpen] = react.useState(false)
      const rootRef = react.useRef(null)
      const panelRef = react.useRef(null)
      const credits = status?.usage?.credits
      const used = credits === undefined ? undefined : usedShare(credits.percent)
      const available = grok && used !== undefined
      const position = useAnchoredPosition({
        open: open && available,
        anchorRef: rootRef,
        panelRef,
        side: 'top',
        gap: 8,
        margin: 12,
      })
      useDismissOnOutsidePointer(rootRef, open && available, setOpen, panelRef)

      react.useEffect(() => {
        installStyle()
      }, [])

      react.useEffect(() => {
        if (!grok) return undefined
        let stopped = false
        const tick = async () => {
          try {
            const result = await call(ctx, 'xaiSupergrok/status')
            if (!stopped && result.ok) setStatus(result.value)
          } catch {
            // The pill stays on the last reading when a status poll fails.
          }
        }
        void tick()
        const timer = setInterval(() => {
          void tick()
        }, POLL_MS)
        return () => {
          stopped = true
          clearInterval(timer)
        }
      }, [grok, ctx])

      react.useEffect(() => {
        if (!available && open) setOpen(false)
      }, [available, open])

      react.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      if (!available) return null
      const label = t('usedReading', { percent: `${used}%` })
      const trigger = react.createElement(
        'button',
        {
          type: 'button',
          className: 'trigger',
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: () => {
            setOpen((current) => !current)
          },
        },
        react.createElement(
          'svg',
          { viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': true },
          react.createElement('circle', { className: 'ringTrack', cx: 7, cy: 7, r: RING_RADIUS }),
          react.createElement('circle', {
            className: 'ringFill',
            cx: 7,
            cy: 7,
            r: RING_RADIUS,
            strokeDasharray: `${(RING_LENGTH * used) / 100} ${RING_LENGTH}`,
            transform: 'rotate(-90 7 7)',
          }),
        ),
        react.createElement('span', null, label),
      )
      const body = sessionPanel(
        status.usage,
        status.usageError || '',
        status.usagePending === true,
        t,
      )
      const panel =
        open && body !== null && typeof reactDom.createPortal === 'function'
          ? reactDom.createPortal(
              react.createElement(
                'div',
                {
                  ref: panelRef,
                  'data-xai-usage-panel': '',
                  role: 'dialog',
                  'aria-label': label,
                  style: position ?? { visibility: 'hidden', left: 0, top: 0 },
                },
                body,
              ),
              document.body,
            )
          : null
      const button =
        ui.Tooltip === undefined
          ? trigger
          : react.createElement(
              ui.Tooltip,
              { label, side: 'top', delayMs: 200, disabled: open },
              trigger,
            )
      return react.createElement('span', { ref: rootRef, 'data-xai-usage-pill': '' }, button, panel)
    }

    function isThisBundle(subject) {
      return subject?.kind === 'bundle' && subject.pkg?.name === 'dsh-xai-auth'
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-xai-auth: dictionaries')
      // After the bundle page's own rows and source block, so sign-in sits at the bottom.
      ctx.slots.inject('plugins.detail.section', () =>
        ctx.slots.register(
          {
            name: 'plugins.detail.section',
            id: 'dsh-xai-auth-sign-in',
            order: 1000,
            locale: NS,
          },
          (props) =>
            isThisBundle(props.subject)
              ? react.createElement(LoginPanel, { ctx, t: props.t })
              : null,
        ),
      )
      // The composer dock mounts only after the Session leaves the blank Hero.
      // The Hero options row is the same reading before the first message.
      for (const name of ['conversation.hero.options', 'conversation.composer.dock']) {
        ctx.slots.inject(name, () =>
          ctx.slots.register(
            {
              name,
              id: 'xai-supergrok-usage',
              order: 2,
              locale: NS,
            },
            (props) =>
              react.createElement(SessionUsagePill, {
                ctx,
                t: props.t,
                useProjection: props.useProjection,
              }),
          ),
        )
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
