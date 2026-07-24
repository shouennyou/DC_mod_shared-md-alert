'use strict';

(function initializeContent(global) {
  const core = global.__sharedMdAlertModules
  if (!core) {
    throw new Error('LocalAlert 核心模块未加载.')
  }

  const document = core.document
  const hostClass = core.constants.contentHostClass
  const DEFAULT_FETCH_TIMEOUT_MS = 10000
  const breakTagPattern = /<br\s*\/?\s*>|&lt;br\s*\/?\s*&gt;/gi
  const contentStyle = [
    '.shared-md-alert__text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;}',
    '.shared-md-alert__markdown{line-height:1.7;overflow-wrap:anywhere;}',
    '.shared-md-alert__markdown>:first-child{margin-top:0;}',
    '.shared-md-alert__markdown>:last-child{margin-bottom:0;}',
    '.shared-md-alert__markdown pre{overflow:auto;padding:1em;border-radius:4px;background:#1f2937;color:#f9fafb;}',
    '.shared-md-alert__markdown code{font-family:ui-monospace,Consolas,monospace;}',
    '.shared-md-alert__markdown :not(pre)>code{padding:.1em .35em;border-radius:3px;background:#f1f5f9;color:#b91c1c;}',
    '.shared-md-alert__markdown img{max-width:100%;height:auto;}',
    '.shared-md-alert__frame{display:block;width:100%;height:min(70vh,720px);border:0;background:#fff;}',
    '@media (max-width:600px){.shared-md-alert__frame{height:65vh;}}',
  ].join('')

  function escapeHtml(value) {
    const characters = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return String(value).replace(/[&<>"']/g, function (character) { return characters[character] })
  }

  function normalizeFrameUrl(value) {
    let source = String(value).trim()
    if (!source) {
      throw new Error('url 类型必须提供网页地址.')
    }

    const isWindowsFilePath = source.length > 2 && source.charAt(1) === ':' &&
      (source.charAt(2) === '/' || source.charAt(2) === String.fromCharCode(92))
    if (isWindowsFilePath) {
      source = 'file:///' + source.split(String.fromCharCode(92)).join('/')
    }

    let url
    try {
      url = new global.URL(source, document.baseURI || global.location.href)
    } catch (error) {
      throw new Error('无法解析网页地址: ' + value)
    }
    if (['http:', 'https:', 'file:'].indexOf(url.protocol) === -1) {
      throw new Error('网页地址仅支持 http:, https: 和本地文件.')
    }

    return url.href
  }

  function isMarkdownUrl(value) {
    try {
      const pathname = new global.URL(value).pathname.toLowerCase()
      return pathname.endsWith('.md') || pathname.endsWith('.markdown')
    } catch (error) {
      return false
    }
  }

  function normalize(content) {
    if (!content || typeof content !== 'object') {
      throw new Error('必须提供 content.type 和 content.value.')
    }

    const aliases = { md: 'markdown', text: 'markdown', page: 'url' }
    const type = aliases[content.type || 'markdown'] || content.type || 'markdown'
    if (['url', 'markdown', 'plain', 'html'].indexOf(type) === -1) {
      throw new Error('content.type 只能是 url, markdown, plain 或 html.')
    }

    const value = content.value === undefined || content.value === null ? '' : String(content.value)
    const allowUnsafeHtml = content.allowUnsafeHtml === true
    if (type === 'html' && !allowUnsafeHtml) {
      throw new Error('html 内容必须显式设置 allowUnsafeHtml: true.')
    }

    const normalizedValue = type === 'url' ? normalizeFrameUrl(value) : value
    const markdownUrl = type === 'url' && isMarkdownUrl(normalizedValue)
    return {
      type: type,
      value: normalizedValue,
      isMarkdownUrl: markdownUrl,
      requiresMarkdown: type === 'markdown' || markdownUrl,
      markdownOptions: content.markdownOptions,
      allowUnsafeHtml: allowUnsafeHtml,
      openLinksInNewTab: content.openLinksInNewTab !== false,
      iframe: content.iframe,
      width: content.width,
      fetchTimeoutMs: content.fetchTimeoutMs,
    }
  }

  async function resolveMarkdownUrl(content) {
    if (!content.isMarkdownUrl) {
      return content
    }
    if (typeof global.fetch !== 'function') {
      throw new Error('当前浏览器不支持 fetch, 无法加载 Markdown 地址.')
    }

    const timeoutMs = content.fetchTimeoutMs === undefined
      ? DEFAULT_FETCH_TIMEOUT_MS
      : Number(content.fetchTimeoutMs)
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('content.fetchTimeoutMs 必须是大于 0 的数字.')
    }

    let response
    let timeoutId = null
    let timedOut = false
    const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null
    const requestOptions = { credentials: 'same-origin' }
    if (controller) {
      requestOptions.signal = controller.signal
    }

    try {
      const request = global.fetch(content.value, requestOptions)
      const timeout = new Promise(function (resolve, reject) {
        timeoutId = global.setTimeout(function () {
          timedOut = true
          if (controller) controller.abort()
          reject(new Error('timeout'))
        }, timeoutMs)
      })
      response = await Promise.race([request, timeout])
    } catch (error) {
      if (timedOut) {
        throw new Error('加载 Markdown 地址超时: ' + content.value)
      }
      throw new Error('无法加载 Markdown 地址: ' + content.value + '. 请确认地址可访问且允许跨域读取.')
    } finally {
      if (timeoutId) global.clearTimeout(timeoutId)
    }
    if (!response || !response.ok) {
      const status = response && response.status ? ' HTTP ' + response.status : ''
      throw new Error('无法加载 Markdown 地址:' + status + ' ' + content.value)
    }

    try {
      return Object.assign({}, content, { type: 'markdown', value: await response.text() })
    } catch (error) {
      throw new Error('无法读取 Markdown 地址内容: ' + content.value)
    }
  }

  function installBreakTagNormalizer(parser) {
    parser.core.ruler.after('inline', 'shared-md-alert-break-tags', function (state) {
      state.tokens.forEach(function (block) {
        if (!block.children) return
        block.children.forEach(function (token) {
          if (token.type === 'text' || token.type === 'text_special') {
            token.content = token.content.replace(breakTagPattern, '\n')
          }
        })
      })
    })
  }

  function renderMarkdown(content) {
    const requestedOptions = content.markdownOptions && typeof content.markdownOptions === 'object'
      ? content.markdownOptions
      : {}
    const options = Object.assign({ html: false, breaks: false, linkify: true }, requestedOptions)
    const convertBreakTags = options.normalizeBreakTags !== false
    delete options.normalizeBreakTags
    if (!content.allowUnsafeHtml) {
      options.html = false
    }
    const parser = global.markdownit(options)
    if (convertBreakTags && !options.html) {
      installBreakTagNormalizer(parser)
    }
    if (content.openLinksInNewTab) {
      const defaultLinkOpen = parser.renderer.rules.link_open || function (tokens, index, rendererOptions, environment, self) {
        return self.renderToken(tokens, index, rendererOptions)
      }
      parser.renderer.rules.link_open = function (tokens, index, rendererOptions, environment, self) {
        const token = tokens[index]
        if (!token.attrGet('target')) token.attrPush(['target', '_blank'])
        if (!token.attrGet('rel')) token.attrPush(['rel', 'noopener noreferrer'])
        return defaultLinkOpen(tokens, index, rendererOptions, environment, self)
      }
    }
    return '<article class="shared-md-alert__markdown">' +
      parser.render(content.value) + '</article>'
  }

  function renderUrl(content, title) {
    const frame = content.iframe && typeof content.iframe === 'object' ? content.iframe : {}
    const sandboxValue = frame.sandbox === undefined ? 'allow-forms allow-popups allow-scripts' : frame.sandbox
    const sandbox = sandboxValue === false ? '' : ' sandbox="' + escapeHtml(String(sandboxValue)) + '"'
    const allow = frame.allow ? ' allow="' + escapeHtml(String(frame.allow)) + '"' : ''
    const referrerPolicy = frame.referrerPolicy ? ' referrerpolicy="' + escapeHtml(String(frame.referrerPolicy)) + '"' : ''
    const frameTitle = frame.title || title || '网页内容'
    return '<iframe class="shared-md-alert__frame" src="' + escapeHtml(content.value) + '" title="' +
      escapeHtml(frameTitle) + '" loading="lazy"' + sandbox + allow + referrerPolicy + '></iframe>'
  }

  function render(content, title) {
    if (content.type === 'markdown') return renderMarkdown(content)
    if (content.type === 'url') return renderUrl(content, title)
    if (content.type === 'html') return content.value
    return '<div class="shared-md-alert__text">' + escapeHtml(content.value) + '</div>'
  }

  function mount(popup, contentHtml) {
    if (!popup || typeof popup.querySelector !== 'function') return
    const host = popup.querySelector('.' + hostClass)
    if (!host) return
    if (typeof host.attachShadow !== 'function') {
      host.innerHTML = contentHtml
      return
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<style>' + getShadowStyle() + '</style>' + contentHtml
  }

  function getShadowStyle() {
    return ':host{display:block;min-width:0;}*,*:before,*:after{box-sizing:border-box;}' + contentStyle
  }

  core.content = {
    normalize: normalize,
    resolveMarkdownUrl: resolveMarkdownUrl,
    render: render,
    mount: mount,
    getStyle: function () { return contentStyle },
  }
})(window)
