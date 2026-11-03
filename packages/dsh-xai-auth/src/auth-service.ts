// ABOUTME: Exposes SuperGrok sign-in to the Plugins page over the host Remote gateway.
// ABOUTME: Methods are marked without decorators so Node can load this file by stripping types.

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { PLUGIN_NAME, PROVIDER_ID, PROVIDER_LABEL } from './constants.ts'
import { SuperGrokRuntime } from './runtime.ts'

const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'

function exposeRemoteMethod(prototype: object, method: string): void {
  const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHODS)
  const previous = property?.value as { methods?: readonly object[] } | undefined
  const methods = Array.isArray(previous?.methods) ? previous.methods : []
  Object.defineProperty(prototype, REMOTE_METHODS, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze([
        ...methods,
        Object.freeze({
          method,
          invocation: Object.freeze({ kind: 'direct' }),
        }),
      ]),
    }),
  })
}

/** Host Remote `xaiSupergrok/*` for the plugin configuration page. */
export class SuperGrokAuthService extends TypertRemoteService {
  static inject = ['llm']

  readonly runtime: SuperGrokRuntime

  constructor(ctx: Context) {
    super(ctx, 'xaiSupergrok')
    this.runtime = new SuperGrokRuntime(ctx)
    ctx.llm.registerAdapter([PROVIDER_ID], this.runtime.adapter)
    ctx.llm.registerConfigurableProviders([
      {
        provider: PROVIDER_ID,
        displayName: PROVIDER_LABEL,
        settingsNs: PLUGIN_NAME,
        settingsPath: [],
        declared: true,
        defaultBaseURL: 'https://cli-chat-proxy.grok.com/v1',
        nativeAuth: { env: [], oauth: true },
      },
    ])
    void this.runtime.restore().catch((error: unknown) => {
      ctx.logger.warn('dsh-xai-auth: could not restore the SuperGrok sign-in')
      ctx.logger.warn(error)
    })
  }

  status(): ReturnType<SuperGrokRuntime['accountStatus']> {
    return this.runtime.accountStatus()
  }

  start(): Promise<{ url: string; code: string }> {
    return this.runtime.startDeviceLogin()
  }

  cancel(): { cancelled: true } {
    this.runtime.cancelLogin()
    return { cancelled: true }
  }

  async signOut(): Promise<{ signedOut: true }> {
    await this.runtime.signOut()
    return { signedOut: true }
  }

  refreshModels(): Promise<{ models: string[] }> {
    return this.runtime.refreshModels()
  }
}

exposeRemoteMethod(SuperGrokAuthService.prototype, 'status')
exposeRemoteMethod(SuperGrokAuthService.prototype, 'start')
exposeRemoteMethod(SuperGrokAuthService.prototype, 'cancel')
exposeRemoteMethod(SuperGrokAuthService.prototype, 'signOut')
exposeRemoteMethod(SuperGrokAuthService.prototype, 'refreshModels')
