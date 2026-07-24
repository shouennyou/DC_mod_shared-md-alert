'use strict';

(function initializeCloseControls(global) {
  const core = global.__sharedMdAlertModules
  if (!core) throw new Error('LocalAlert 核心模块未加载.')

  function normalizeInput(input) {
    if (input === undefined || input === null || input === false) return null
    if (typeof input === 'string') {
      return { expected: input, label: '请输入指定内容后继续.', placeholder: '', validationMessage: '输入内容不正确.', caseSensitive: true, trim: true, attributes: {} }
    }
    if (typeof input !== 'object' || !Object.prototype.hasOwnProperty.call(input, 'expected')) {
      throw new Error('close.input 必须是指定文本或包含 expected 的对象.')
    }
    return {
      expected: String(input.expected),
      label: input.label || '请输入指定内容后继续.',
      placeholder: input.placeholder || '',
      validationMessage: input.validationMessage || '输入内容不正确.',
      caseSensitive: input.caseSensitive !== false,
      trim: input.trim !== false,
      attributes: input.attributes && typeof input.attributes === 'object' ? input.attributes : {},
    }
  }

  function normalize(close) {
    const settings = close && typeof close === 'object' ? close : {}
    const input = normalizeInput(settings.input)
    const rawWait = settings.waitSeconds === undefined ? settings.wait : settings.waitSeconds
    const waitSeconds = rawWait === undefined ? 0 : Number(rawWait)
    if (!Number.isFinite(waitSeconds) || waitSeconds < 0) {
      throw new Error('close.waitSeconds 必须是大于或等于 0 的数字.')
    }
    const roundedWait = Math.ceil(waitSeconds)
    const locked = Boolean(input) || roundedWait > 0
    return {
      input: input,
      waitSeconds: roundedWait,
      locked: locked,
      confirmText: settings.confirmText || '关闭',
      cancelText: settings.cancelText || '取消',
      showConfirmButton: locked || settings.showConfirmButton !== false,
      showCancelButton: !locked && settings.showCancelButton === true,
      showCloseButton: !locked && settings.showCloseButton === true,
      allowOutsideClick: !locked && settings.allowOutsideClick !== false,
      allowEscapeKey: !locked && settings.allowEscapeKey !== false,
      allowUnsafeHooks: settings.allowUnsafeHooks === true,
    }
  }

  function matchesExpectedValue(value, input) {
    let actual = String(value === undefined || value === null ? '' : value)
    let expected = input.expected
    if (input.trim) { actual = actual.trim(); expected = expected.trim() }
    if (!input.caseSensitive) { actual = actual.toLocaleLowerCase(); expected = expected.toLocaleLowerCase() }
    return actual === expected
  }

  function createCountdown(close) {
    let finished = close.waitSeconds === 0
    let intervalId = null
    const endAt = Date.now() + close.waitSeconds * 1000
    function refreshButton() {
      const button = global.Swal.getConfirmButton()
      if (!button) return
      if (finished) { button.disabled = false; button.textContent = close.confirmText; return }
      const remaining = Math.max(1, Math.ceil((endAt - Date.now()) / 1000))
      button.disabled = true
      button.textContent = close.confirmText + ' (' + remaining + 's)'
    }
    function update() {
      if (Date.now() >= endAt) {
        finished = true
        if (intervalId) { global.clearInterval(intervalId); intervalId = null }
      }
      refreshButton()
    }
    if (!finished) { refreshButton(); intervalId = global.setInterval(update, 200) }
    return {
      isFinished: function () { return finished },
      cleanup: function () { if (intervalId) { global.clearInterval(intervalId); intervalId = null } },
    }
  }

  function getExtraSwalOptions(options, close) {
    const extra = options.swalOptions && typeof options.swalOptions === 'object' ? Object.assign({}, options.swalOptions) : {}
    if (close.locked && !close.allowUnsafeHooks) {
      ['willOpen', 'didOpen', 'didRender', 'willClose', 'didClose', 'didDestroy', 'preConfirm', 'inputValidator'].forEach(function (key) { delete extra[key] })
    }
    return extra
  }

  function createCloseGuard(close, isProtectedPopup) {
    const noop = { restore: function () {} }
    if (!close.locked || typeof global.Swal.close !== 'function') return noop
    const originalClose = global.Swal.close
    const guardedClose = function () {
      let protectedPopup = false
      try { protectedPopup = typeof isProtectedPopup === 'function' && isProtectedPopup() } catch (error) {}
      if (!protectedPopup) return originalClose.apply(this, arguments)
      global.Swal.showValidationMessage('请先完成关闭条件.')
      return false
    }
    let installed = false
    try { global.Swal.close = guardedClose; installed = global.Swal.close === guardedClose } catch (error) { return noop }
    return { restore: function () { if (installed && global.Swal.close === guardedClose) global.Swal.close = originalClose } }
  }

  core.close = { normalize: normalize, matchesExpectedValue: matchesExpectedValue, createCountdown: createCountdown, getExtraSwalOptions: getExtraSwalOptions, createCloseGuard: createCloseGuard }
})(window)
