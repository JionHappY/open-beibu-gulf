import { logger } from '@/shared'

/**
 * 底图瓦片错误的统一处理（从 CesiumRenderer 抽出：渲染器有体量棘轮，新增内容另开文件）。
 *
 * 本模块**不 import cesium**（2D 首屏 eager 链禁入 cesium，见 cesium-import-allowlist 判据）：
 * 「首次失败要做的事」由调用方以 `onFirstError` 传进来，这里只负责去重、attach 记账与日志。
 *
 * `errorEvent` 在 ImageryProvider 上而非 ImageryLayerCollection（挂后者抛 TypeError 致 3D
 * 初始化失败）。handler 必须交给调用方持有并在销毁时 removeEventListener——provider 挂在
 * 单例 Viewer 上常驻，不移除则闭包永久持有首个 renderer 实例。
 */

/** provider 上与错误回调相关的最小形状（结构类型，避免把 cesium 类型带进本模块） */
interface ImageryProviderLike {
  errorEvent?: { addEventListener: (listener: (err: unknown) => void) => void }
}

interface ImageryErrorBindingOptions {
  /** 首个瓦片错误时执行一次（调用方负责改底色/打标记这类需要 cesium 实例的动作） */
  onFirstError: () => void
}

interface ImageryErrorBinding<T extends ImageryProviderLike> {
  /** 首个错误回调（调用方持有，销毁时从各 provider 上摘除） */
  handler: (err: unknown) => void
  /** 给 provider 挂上回调并记账；provider 不存在或没有 errorEvent 时静默跳过 */
  attach: (provider: T) => void
  /** 已挂过回调的 provider（销毁时逐个 removeEventListener 用） */
  providers: T[]
}

export function createImageryErrorBinding<T extends ImageryProviderLike>(
  options: ImageryErrorBindingOptions
): ImageryErrorBinding<T> {
  const providers: T[] = []
  let logged = false

  const handler = (err: unknown): void => {
    if (logged) return
    logged = true
    logger.warn(
      '[CesiumRenderer] 底图瓦片加载失败（首次）:',
      err instanceof Error ? err.message : err
    )
    options.onFirstError()
  }

  const attach = (provider: T): void => {
    if (!provider?.errorEvent) return
    provider.errorEvent.addEventListener(handler)
    providers.push(provider)
  }

  return { handler, attach, providers }
}
