'use strict';

(function initializeLocalAlert(global) {
  const core = global.__sharedMdAlertModules
  if (!core || !core.storage || !core.content || !core.close || !core.modal) {
    throw new Error('LocalAlert 模块加载不完整. 请检查 modloader.mod.json 的 injections 顺序.')
  }
  if (core.entryInstalled) {
    return
  }
  core.entryInstalled = true
  const storage = core.storage
  const configuration = core.configuration
  const asOptions = function (value) { return value && typeof value === 'object' ? value : {} }
  const getPersistence = function (options) {
    return storage.normalizePersistence(
      options.persistence === undefined ? configuration.persistence : options.persistence
    )
  }
  const getPriority = function (options) {
    const priority = options.priority === undefined ? 0 : Number(options.priority)
    if (!Number.isFinite(priority)) {
      throw new Error('priority 必须是有限数字.')
    }
    return priority
  }

  function acknowledgeRequestContexts(contexts, currentContext, fallbackBackend) {
    let persistenceBackend = fallbackBackend
    contexts.forEach(function (context) {
      const backend = storage.acknowledge(
        context.id,
        context.display,
        context.persistence,
        context.displayScope
      )
      if (context === currentContext) persistenceBackend = backend
    })
    return persistenceBackend
  }

  function configure(options) {
    const settings = asOptions(options)
    if (settings.persistence !== undefined) {
      configuration.persistence = storage.normalizePersistence(settings.persistence)
    }
    if (settings.libraries && typeof settings.libraries === 'object') {
      configuration.libraries = Object.assign({}, configuration.libraries, settings.libraries)
    }
    return {
      persistence: configuration.persistence,
      libraries: Object.assign({}, configuration.libraries),
    }
  }

  async function show(rawOptions) {
    await core.ready

    const options = asOptions(rawOptions)
    const id = storage.normalizeId(options.id)
    const content = core.content.normalize(options.content)
    const display = storage.normalizeDisplay(options.display)
    const displayScope = storage.getDisplayScope(display, content, options.content)
    const persistence = getPersistence(options)
    const priority = getPriority(options)
    const context = { id: id, display: display, displayScope: displayScope, persistence: persistence }
    const contexts = core.registerRequestContext(id, context)

    // 相同 id 的并发请求共用同一个弹窗和结果.
    const request = core.enqueue(id, async function () {
      // 等待期间可能已有同类弹窗确认, 必须在实际展示前重新判断.
      const decision = storage.shouldShow(id, display, options.force === true, persistence, displayScope)
      if (!decision.show) {
        return {
          shown: false,
          id: id,
          reason: decision.reason,
          persistence: acknowledgeRequestContexts(contexts, context, decision.backend),
        }
      }
      core.activeId = id
      try {
        const result = await core.modal.present(options, content, core.close.normalize(options.close), id)
        let persistenceBackend = decision.backend
        if (result.isConfirmed) {
          persistenceBackend = acknowledgeRequestContexts(contexts, context, persistenceBackend)
        }
        return {
          shown: true,
          id: id,
          acknowledged: Boolean(result.isConfirmed),
          persistence: persistenceBackend,
          result: result,
        }
      } finally {
        core.activeId = null
      }
    }, priority)
    request.then(function () {
      core.clearRequestContexts(id, contexts)
    }, function () {
      core.clearRequestContexts(id, contexts)
    })
    return request
  }

  function reset(id, options) {
    return storage.removeState(storage.normalizeId(id), getPersistence(asOptions(options)))
  }

  function resetAll(options) {
    return storage.resetAll(getPersistence(asOptions(options)))
  }

  global.LocalAlert = {
    configure: configure,
    show: show,
    reset: reset,
    resetAll: resetAll,
    getState: function (id, options) {
      const settings = asOptions(options)
      return storage.readState(storage.normalizeId(id), getPersistence(settings)).state
    },
  }

  if (core.document.readyState === 'complete' || typeof global.addEventListener !== 'function') {
    core.markReady()
  } else {
    global.addEventListener('load', core.markReady, { once: true })
  }
})(window)
