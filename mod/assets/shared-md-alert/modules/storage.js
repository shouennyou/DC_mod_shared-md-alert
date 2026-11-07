'use strict';

(function initializeStorage(global) {
  const core = global.__sharedMdAlertModules
  if (!core) throw new Error('LocalAlert 核心模块未加载.')

  const prefix = core.constants.storagePrefix
  const configFile = 'config/shared-md-alert.json'
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

  function getConfigApi() {
    const api = global.modloader
    if (!api || typeof api.readFileSync !== 'function' || typeof api.writeFileSync !== 'function') {
      return null
    }
    return api
  }

  function readConfigData(api) {
    const content = api.readFileSync(configFile)
    if (content === null) return { exists: false, states: {} }

    const data = JSON.parse(content)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('配置文件格式无效.')
    }
    if (data.states === undefined) return { exists: true, states: {} }
    if (!data.states || typeof data.states !== 'object' || Array.isArray(data.states)) {
      throw new Error('配置状态格式无效.')
    }
    return { exists: true, states: data.states }
  }

  function writeConfigStates(api, states) {
    const result = api.writeFileSync(configFile, JSON.stringify({ version: 1, states: states }, null, 2))
    if (!result || !result.success) {
      throw new Error(result && result.error ? result.error : '配置文件写入失败.')
    }
  }

  function getStorageBackend(persistence) {
    if (getConfigApi()) return 'config'
    try {
      if (!global.localStorage) throw new Error('localStorage 不可用.')
      global.localStorage.getItem(prefix)
      return 'local'
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储不可用, 无法保证显示策略.')
      return 'memory'
    }
  }

  function getStorageKey(id) { return prefix + encodeURIComponent(id) }

  function readState(id, persistence) {
    const key = getStorageKey(id)
    const backend = getStorageBackend(persistence)
    if (backend === 'memory') return memoryResult(key, backend)
    try {
      if (backend === 'config') {
        const states = readConfigData(getConfigApi()).states
        return { state: Object.prototype.hasOwnProperty.call(states, key) ? states[key] : null, backend: backend }
      }
      const value = global.localStorage.getItem(key)
      return { state: value ? JSON.parse(value) : null, backend: backend }
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储读取失败.')
      return memoryResult(key, 'memory')
    }
  }

  function writeState(id, state, persistence) {
    const key = getStorageKey(id)
    try {
      const backend = getStorageBackend(persistence)
      if (backend === 'memory') throw new Error('持久化存储不可用.')
      if (backend === 'config') {
        const api = getConfigApi()
        const data = readConfigData(api)
        data.states[key] = state
        writeConfigStates(api, data.states)
      } else {
        global.localStorage.setItem(key, JSON.stringify(state))
      }
      core.memoryStates.delete(key)
      return backend
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
      backend = getStorageBackend(persistence)
      if (backend === 'config') {
        const api = getConfigApi()
        const data = readConfigData(api)
        if (Object.prototype.hasOwnProperty.call(data.states, key)) {
          delete data.states[key]
          writeConfigStates(api, data.states)
        }
      } else if (backend === 'local') {
        global.localStorage.removeItem(key)
      }
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
    const key = settings.key === undefined || settings.key === null ? '' : String(settings.key).trim()
    if (['always', 'once', 'version', 'hash'].indexOf(mode) === -1) {
      throw new Error('display.mode 只能是 always, once, version 或 hash.')
    }
    if (mode === 'version' && !version) throw new Error('display.mode 为 version 时必须提供 display.version.')
    return { mode: mode, version: version, key: key }
  }

  function getUrlScope(content, rawContent) {
    const rawValue = rawContent && rawContent.value !== undefined && rawContent.value !== null
      ? rawContent.value
      : content.value
    let value = String(rawValue).trim().replace(/\\/g, '/')
    const hashIndex = value.indexOf('#')
    if (hashIndex >= 0) value = value.slice(0, hashIndex)

    // 远程 URL 的域名属于资源身份, 本地资源则忽略会随游戏移动变化的目录部分.
    if (/^(https?:)?\/\//i.test(value)) return 'url:' + value

    while (value.indexOf('./') === 0) value = value.slice(2)
    const assetsIndex = value.toLowerCase().lastIndexOf('/assets/')
    if (assetsIndex >= 0) return 'url:' + value.slice(assetsIndex + 1)
    return 'url:' + value
  }

  function getDisplayScope(display, content, rawContent) {
    if (display.mode !== 'version' && display.mode !== 'hash') return ''
    if (display.key) return 'key:' + display.key
    if (content && content.type === 'url' && content.value) return getUrlScope(content, rawContent)
    return ''
  }

  function getScopedState(state, scope) {
    if (!scope) return state
    if (!state || !state.scopes || typeof state.scopes !== 'object' || Array.isArray(state.scopes)) {
      return null
    }
    return Object.prototype.hasOwnProperty.call(state.scopes, scope) ? state.scopes[scope] : null
  }

  function shouldShow(id, display, force, persistence, scope, sha256) {
    if (force || display.mode === 'always') return { show: true, backend: 'not-used' }
    const stored = readState(id, persistence)
    const state = getScopedState(stored.state, scope)
    if (display.mode === 'once' && state && state.acknowledged) {
      return { show: false, reason: 'acknowledged', backend: stored.backend }
    }
    if (display.mode === 'version' && state && state.version === display.version) {
      return { show: false, reason: 'current-version-acknowledged', backend: stored.backend }
    }
    if (display.mode === 'hash' && state && state.sha256 === sha256) {
      return { show: false, reason: 'current-content-acknowledged', backend: stored.backend }
    }
    return { show: true, backend: stored.backend }
  }

  function acknowledge(id, display, persistence, scope, sha256) {
    if (display.mode === 'always') return 'not-used'
    const rootState = readState(id, persistence).state || {}
    let state = rootState
    if (scope) {
      if (!rootState.scopes || typeof rootState.scopes !== 'object' || Array.isArray(rootState.scopes)) {
        rootState.scopes = {}
      }
      state = getScopedState(rootState, scope) || {}
      rootState.scopes[scope] = state
    }
    state.acknowledged = true
    state.updatedAt = new Date().toISOString()
    if (display.mode === 'version') state.version = display.version
    if (display.mode === 'hash') state.sha256 = sha256
    return writeState(id, rootState, persistence)
  }

  function resetAll(persistence) {
    let backend = getStorageBackend(persistence)
    try {
      if (backend === 'config') {
        const api = getConfigApi()
        const data = readConfigData(api)
        if (data.exists && Object.keys(data.states).length > 0) {
          writeConfigStates(api, {})
        }
      } else {
        for (let index = global.localStorage.length - 1; backend === 'local' && index >= 0; index -= 1) {
          const key = global.localStorage.key(index)
          if (key && key.indexOf(prefix) === 0) global.localStorage.removeItem(key)
        }
      }
    } catch (error) {
      if (persistence === 'required') throw new Error('持久化存储删除失败.')
      backend = 'memory'
    }
    core.memoryStates.clear()
    return backend
  }

  core.storage = { normalizeId: normalizeId, normalizePersistence: normalizePersistence, readState: readState, removeState: removeState, normalizeDisplay: normalizeDisplay, getDisplayScope: getDisplayScope, shouldShow: shouldShow, acknowledge: acknowledge, resetAll: resetAll }
})(window)
