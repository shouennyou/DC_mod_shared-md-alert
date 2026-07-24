'use strict';

(function initializeStorage(global) {
  const core = global.__sharedMdAlertModules
  if (!core) throw new Error('LocalAlert 核心模块未加载.')

  const prefix = core.constants.storagePrefix
  const memoryResult = function (key, backend) {
    return { state: core.memoryStates.get(key) || null, backend: backend }
  }

  function normalizeId(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('弹窗必须提供非空的 id.')
    return id.trim()
  }

  function normalizePersistence(value) {
    const mode = value || core.configuration.persistence
    if (mode !== 'best-effort' && mode !== 'required') {
      throw new Error('persistence 只能是 best-effort 或 required.')
    }
    return mode
  }

  function getStorageBackend(key, persistence) {
    try {
      if (!global.localStorage) throw new Error('localStorage 不可用.')
      global.localStorage.getItem(key)
      return 'local'
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储不可用, 无法保证显示策略.')
      return 'memory'
    }
  }

  function getStorageKey(id) { return prefix + encodeURIComponent(id) }

  function readState(id, persistence) {
    const key = getStorageKey(id)
    const backend = getStorageBackend(key, persistence)
    if (backend === 'memory') return memoryResult(key, backend)
    try {
      const value = global.localStorage.getItem(key)
      return { state: value ? JSON.parse(value) : null, backend: backend }
    } catch (error) {
      return memoryResult(key, getStorageBackend(key, persistence))
    }
  }

  function writeState(id, state, persistence) {
    const key = getStorageKey(id)
    const serialized = JSON.stringify(state)
    try {
      if (getStorageBackend(key, persistence) !== 'local') throw new Error('localStorage 不可用.')
      global.localStorage.setItem(key, serialized)
      core.memoryStates.delete(key)
      return 'local'
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储写入失败.')
      core.memoryStates.set(key, state)
      return 'memory'
    }
  }

  function removeState(id, persistence) {
    const key = getStorageKey(id)
    let backend = 'memory'
    try {
      backend = getStorageBackend(key, persistence)
      if (backend === 'local') global.localStorage.removeItem(key)
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储删除失败.')
      backend = 'memory'
    }
    core.memoryStates.delete(key)
    return backend
  }

  function normalizeDisplay(display) {
    const settings = display && typeof display === 'object' ? display : {}
    const mode = settings.mode || 'always'
    const version = settings.version === undefined || settings.version === null ? '' : String(settings.version)
    if (['always', 'once', 'version'].indexOf(mode) === -1) {
      throw new Error('display.mode 只能是 always, once 或 version.')
    }
    if (mode === 'version' && !version) throw new Error('display.mode 为 version 时必须提供 display.version.')
    return { mode: mode, version: version }
  }

  function shouldShow(id, display, force, persistence) {
    if (force || display.mode === 'always') return { show: true, backend: 'not-used' }
    const stored = readState(id, persistence)
    if (display.mode === 'once' && stored.state && stored.state.acknowledged) {
      return { show: false, reason: 'acknowledged', backend: stored.backend }
    }
    if (display.mode === 'version' && stored.state && stored.state.version === display.version) {
      return { show: false, reason: 'current-version-acknowledged', backend: stored.backend }
    }
    return { show: true, backend: stored.backend }
  }

  function acknowledge(id, display, persistence) {
    if (display.mode === 'always') return 'not-used'
    const state = readState(id, persistence).state || {}
    state.acknowledged = true
    state.updatedAt = new Date().toISOString()
    if (display.mode === 'version') state.version = display.version
    return writeState(id, state, persistence)
  }

  function resetAll(persistence) {
    let backend = getStorageBackend(prefix + 'reset-all', persistence)
    try {
      for (let index = global.localStorage.length - 1; backend === 'local' && index >= 0; index -= 1) {
        const key = global.localStorage.key(index)
        if (key && key.indexOf(prefix) === 0) global.localStorage.removeItem(key)
      }
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储删除失败.')
      backend = 'memory'
    }
    core.memoryStates.clear()
    return backend
  }

  core.storage = { normalizeId: normalizeId, normalizePersistence: normalizePersistence, readState: readState, removeState: removeState, normalizeDisplay: normalizeDisplay, shouldShow: shouldShow, acknowledge: acknowledge, resetAll: resetAll }
})(window)
