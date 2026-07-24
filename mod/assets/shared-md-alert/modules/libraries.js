'use strict';

(function initializeLibraries(global) {
  const core = global.__sharedMdAlertModules
  if (!core) {
    throw new Error('LocalAlert 核心模块未加载.')
  }

  const document = core.document

  function resolveLibrarySource(settings, property, fileName) {
    if (settings[property]) {
      return settings[property]
    }
    if (typeof settings.baseUrl !== 'string' || !settings.baseUrl.trim()) {
      throw new Error('无法解析 ' + fileName + ' 的本地路径.')
    }

    return settings.baseUrl.trim().replace(/[\\/]+$/, '') + '/' + fileName
  }

  function isSwalReady() {
    return Boolean(
      global.Swal &&
      typeof global.Swal.fire === 'function' &&
      typeof global.Swal.getConfirmButton === 'function' &&
      typeof global.Swal.showValidationMessage === 'function'
    )
  }

  function loadScript(source, name, isReady, timeoutMs) {
    if (isReady()) {
      return Promise.resolve()
    }
    if (!source) {
      return Promise.reject(new Error(name + ' 未提供本地文件路径.'))
    }

    const key = name + ':' + source
    if (core.scriptRequests.has(key)) {
      return core.scriptRequests.get(key)
    }

    const timeout = Number(timeoutMs)
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return Promise.reject(new Error(name + ' 的加载超时必须大于 0.'))
    }

    const request = new Promise(function (resolve, reject) {
      const script = document.createElement('script')
      let finished = false
      let timeoutId = null

      function finish(callback, value, removeScript) {
        if (finished) {
          return
        }

        finished = true
        global.clearTimeout(timeoutId)
        script.onload = null
        script.onerror = null
        if (removeScript && script.parentNode) {
          script.parentNode.removeChild(script)
        }
        callback(value)
      }

      script.src = source
      script.async = true
      script.onload = function () {
        if (isReady()) {
          finish(resolve)
          return
        }
        finish(reject, new Error(name + ' 加载后未提供预期的全局变量.'), true)
      }
      script.onerror = function () {
        finish(reject, new Error(name + ' 加载失败: ' + source), true)
      }
      timeoutId = global.setTimeout(function () {
        finish(reject, new Error(name + ' 加载超时: ' + source), true)
      }, timeout)

      try {
        document.head.appendChild(script)
      } catch (error) {
        finish(reject, error, true)
      }
    })

    core.scriptRequests.set(key, request)
    return request.catch(function (error) {
      core.scriptRequests.delete(key)
      throw error
    })
  }

  async function ensureLibraries(content, libraries) {
    const settings = Object.assign({}, core.configuration.libraries, libraries || {})
    const requests = []

    if (!isSwalReady()) {
      if (!settings.autoLoad) {
        throw new Error('未找到可用的 window.Swal. 请先加载 sweetalert2.js.')
      }
      requests.push(loadScript(
        resolveLibrarySource(settings, 'sweetAlertSrc', core.constants.sweetAlertFile),
        core.constants.sweetAlertFile,
        isSwalReady,
        settings.loadTimeoutMs
      ))
    }

    if (content.requiresMarkdown && typeof global.markdownit !== 'function') {
      if (!settings.autoLoad) {
        throw new Error('未找到 window.markdownit. 请先加载 markdown-it.js.')
      }
      requests.push(loadScript(
        resolveLibrarySource(settings, 'markdownItSrc', core.constants.markdownItFile),
        core.constants.markdownItFile,
        function () { return typeof global.markdownit === 'function' },
        settings.loadTimeoutMs
      ))
    }

    await Promise.all(requests)
    if (!isSwalReady()) {
      throw new Error('sweetalert2.js 未正确加载.')
    }
    if (content.requiresMarkdown && typeof global.markdownit !== 'function') {
      throw new Error('markdown-it.js 未正确加载.')
    }
  }

  core.libraries = { ensure: ensureLibraries }
})(window)
