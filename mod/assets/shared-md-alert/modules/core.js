'use strict';

(function initializeCore(global) {
  if (typeof global === 'undefined' || !global.document) {
    throw new Error('LocalAlert 只能在浏览器环境中运行.')
  }

  const MODULE_KEY = '__sharedMdAlertModules'
  if (global[MODULE_KEY]) {
    return
  }

  let resolveReady = null
  const ready = new Promise(function (resolve) {
    resolveReady = resolve
  })
  const queue = []
  const requestsById = new Map()
  const requestContextsById = new Map()
  let queueRunning = false
  let queueSequence = 0

  function runQueue() {
    if (queueRunning || queue.length === 0) {
      return
    }

    const entry = queue.shift()
    queueRunning = true
    Promise.resolve()
      .then(entry.run)
      .then(entry.resolve, entry.reject)
      .then(function () {
        queueRunning = false
        runQueue()
      })
  }

  function enqueue(id, run, priority) {
    const existing = requestsById.get(id)
    if (existing) {
      return existing
    }

    let request = null
    request = new Promise(function (resolve, reject) {
      queue.push({ run: run, priority: priority, sequence: queueSequence++, resolve: resolve, reject: reject })
      queue.sort(function (left, right) {
        return right.priority - left.priority || left.sequence - right.sequence
      })
      runQueue()
    })
    requestsById.set(id, request)
    request.then(function () {
      if (requestsById.get(id) === request) requestsById.delete(id)
    }, function () {
      if (requestsById.get(id) === request) requestsById.delete(id)
    })
    return request
  }

  function registerRequestContext(id, context) {
    let contexts = requestContextsById.get(id)
    if (!contexts) {
      contexts = []
      requestContextsById.set(id, contexts)
    }
    contexts.push(context)
    return contexts
  }

  function clearRequestContexts(id, contexts) {
    if (requestContextsById.get(id) === contexts) requestContextsById.delete(id)
  }

  global[MODULE_KEY] = {
    document: global.document,
    constants: {
      storagePrefix: 'shared-md-alert:',
      styleId: 'shared-md-alert-hook-style',
      contentHostClass: 'shared-md-alert__shadow-host',
      tyranoZIndex: '2147483647',
      markdownItFile: 'markdown-it@15.0.0/browser/markdown-it.umd.min.js',
      sweetAlertFile: 'sweetalert2@11.26.25/sweetalert2.all.min.js',
    },
    configuration: {
      persistence: 'best-effort',
      libraries: {
        autoLoad: true,
        loadTimeoutMs: 5000,
        baseUrl: './assets/lib/',
        markdownItSrc: null,
        sweetAlertSrc: null,
      },
    },
    scriptRequests: new Map(),
    memoryStates: new Map(),
    activeId: null,
    enqueue: enqueue,
    registerRequestContext: registerRequestContext,
    clearRequestContexts: clearRequestContexts,
    ready: ready,
    markReady: function () {
      if (!resolveReady) {
        return
      }

      resolveReady()
      resolveReady = null
    },
  }
})(window)
