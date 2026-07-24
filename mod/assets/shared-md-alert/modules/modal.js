'use strict';

(function initializeModal(global) {
  const core = global.__sharedMdAlertModules
  if (!core || !core.content || !core.close || !core.libraries) throw new Error('LocalAlert 依赖模块未加载.')

  const document = core.document
  const zIndex = core.constants.tyranoZIndex

  function getPopupDomId(id) { return 'shared-md-alert-' + id.replace(/[^a-zA-Z0-9_-]/g, '-') }
  function setImportantStyle(element, property, value) {
    if (!element || !element.style) return
    if (typeof element.style.setProperty === 'function') { element.style.setProperty(property, value, 'important'); return }
    const fallback = { 'flex-direction': 'flexDirection', 'max-height': 'maxHeight', 'min-height': 'minHeight', 'overflow-x': 'overflowX', 'overflow-y': 'overflowY', 'overscroll-behavior': 'overscrollBehavior', 'flex-shrink': 'flexShrink' }
    element.style[fallback[property] || property] = value
  }
  function lockPopupLayout(popup) {
    if (!popup) return
    setImportantStyle(popup, 'display', 'flex'); setImportantStyle(popup, 'flex-direction', 'column'); setImportantStyle(popup, 'max-height', 'calc(100vh - 24px)'); setImportantStyle(popup, 'overflow', 'hidden')
    if (typeof popup.querySelector !== 'function') return
    const htmlContainer = popup.querySelector('.swal2-html-container')
    if (!htmlContainer) return
    setImportantStyle(htmlContainer, 'flex', '1 1 auto'); setImportantStyle(htmlContainer, 'min-height', '0'); setImportantStyle(htmlContainer, 'max-height', 'none'); setImportantStyle(htmlContainer, 'overflow-x', 'hidden'); setImportantStyle(htmlContainer, 'overflow-y', 'auto'); setImportantStyle(htmlContainer, 'overscroll-behavior', 'contain')
    Array.prototype.forEach.call(popup.children || [], function (child) { if (child !== htmlContainer) setImportantStyle(child, 'flex-shrink', '0') })
  }
  function forceContainerToBody(popup) {
    if (!popup) return null
    const container = typeof popup.closest === 'function' ? popup.closest('.shared-md-alert-container') : popup.parentElement
    if (!container) return null
    if (document.body && container.parentNode !== document.body) document.body.appendChild(container)
    ;['display:grid', 'z-index:' + zIndex, 'position:fixed', 'inset:0', 'width:100vw', 'height:100vh', 'box-sizing:border-box', 'visibility:visible', 'opacity:1', 'pointer-events:auto'].forEach(function (rule) {
      const parts = rule.split(':'); setImportantStyle(container, parts[0], parts.slice(1).join(':'))
    })
    return container
  }
  function createTouchUnlock(container) {
    if (!container || typeof container.addEventListener !== 'function') return { cleanup: function () {} }
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click']
    const stop = function (event) { event.stopPropagation() }
    types.forEach(function (type) { container.addEventListener(type, stop, { capture: false, passive: true }) })
    return { cleanup: function () { types.forEach(function (type) { container.removeEventListener(type, stop, { capture: false }) }) } }
  }
  function installStyle() {
    if (document.getElementById(core.constants.styleId)) return
    const style = document.createElement('style')
    style.id = core.constants.styleId
    style.textContent = '.swal2-container.shared-md-alert-container{position:fixed!important;z-index:' + zIndex + '!important;pointer-events:auto!important;touch-action:manipulation;}.shared-md-alert-popup{max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:hidden;}.shared-md-alert-html{margin:0!important;padding:0 1.5em 1em!important;text-align:left!important;}.shared-md-alert__shadow-host{display:block;min-width:0;}.swal2-container.shared-md-alert-container .swal2-html-container{min-height:0;overflow-x:hidden!important;overflow-y:auto!important;touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}' + core.content.getStyle() + '@media (max-width:600px){.shared-md-alert-html{padding:0 1em .75em!important;}}'
    document.head.appendChild(style)
  }
  async function present(options, content, close, id) {
    await core.libraries.ensure(content, options.libraries)
    const resolvedContent = await core.content.resolveMarkdownUrl(content)
    installStyle()
    const extra = core.close.getExtraSwalOptions(options, close)
    const extraClasses = extra.customClass && typeof extra.customClass === 'object' ? extra.customClass : {}
    const extraDidOpen = typeof extra.didOpen === 'function' ? extra.didOpen : null
    const extraWillClose = typeof extra.willClose === 'function' ? extra.willClose : null
    const extraPreConfirm = typeof extra.preConfirm === 'function' ? extra.preConfirm : null
    const title = options.title === undefined || options.title === null ? '' : String(options.title)
    let countdown = null; let closeGuard = null; let touchUnlock = null
    try {
      return await global.Swal.fire(Object.assign({}, extra, {
        target: document.body, title: title, html: '<div class="' + core.constants.contentHostClass + '"></div>', icon: options.icon, width: options.width || resolvedContent.width || 'min(90vw, 900px)', showConfirmButton: close.showConfirmButton, confirmButtonText: close.confirmText, showCancelButton: close.showCancelButton, cancelButtonText: close.cancelText, showCloseButton: close.showCloseButton, allowOutsideClick: close.allowOutsideClick, allowEscapeKey: close.allowEscapeKey, showDenyButton: close.locked ? false : extra.showDenyButton, timer: close.locked ? undefined : extra.timer, timerProgressBar: close.locked ? false : extra.timerProgressBar, toast: close.locked ? false : extra.toast, input: close.input ? 'text' : undefined, inputLabel: close.input ? close.input.label : undefined, inputPlaceholder: close.input ? close.input.placeholder : undefined, inputAttributes: close.input ? close.input.attributes : undefined,
        customClass: Object.assign({}, extraClasses, { container: (extraClasses.container ? extraClasses.container + ' ' : '') + 'shared-md-alert-container', popup: (extraClasses.popup ? extraClasses.popup + ' ' : '') + 'shared-md-alert-popup', htmlContainer: (extraClasses.htmlContainer ? extraClasses.htmlContainer + ' ' : '') + 'shared-md-alert-html' }),
        didOpen: function (popup) { popup.id = getPopupDomId(id); core.content.mount(popup, core.content.render(resolvedContent, title)); lockPopupLayout(popup); countdown = core.close.createCountdown(close); closeGuard = core.close.createCloseGuard(close, function () { return typeof global.Swal.getPopup === 'function' ? global.Swal.getPopup() === popup : popup.isConnected !== false }); touchUnlock = createTouchUnlock(forceContainerToBody(popup)); if (extraDidOpen) extraDidOpen(popup) },
        willClose: function (popup) { if (closeGuard) closeGuard.restore(); if (countdown) countdown.cleanup(); if (touchUnlock) touchUnlock.cleanup(); if (extraWillClose) extraWillClose(popup) },
        preConfirm: async function (value) { if (countdown && !countdown.isFinished()) { global.Swal.showValidationMessage('请等待倒计时结束.'); return false } if (close.input && !core.close.matchesExpectedValue(value, close.input)) { global.Swal.showValidationMessage(close.input.validationMessage); return false } if (extraPreConfirm) { const customResult = await extraPreConfirm(value); if (customResult !== undefined) return customResult } return close.input ? value : true },
      }))
    } finally { if (closeGuard) closeGuard.restore(); if (countdown) countdown.cleanup(); if (touchUnlock) touchUnlock.cleanup() }
  }
  core.modal = { present: present }
})(window)
