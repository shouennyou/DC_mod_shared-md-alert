'use strict';

(async function showExampleAlert() {
  function getApi() {
    const api = window.LocalAlert
    return api && typeof api.show === 'function' ? api : null
  }

  function waitForApi(timeoutMs) {
    const startedAt = Date.now()
    return new Promise(function (resolve, reject) {
      function check() {
        const api = getApi()
        if (api) {
          resolve(api)
          return
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('等待 LocalAlert 超时. 请调整模组加载顺序.'))
          return
        }
        window.setTimeout(check, 100)
      }
      check()
    })
  }

  try {
    const LocalAlert = await waitForApi(10000)
    const result = await LocalAlert.show({
      id: 'example-direct-injection-notice',
      priority: 5,
      title: '注入脚本示例',
      icon: 'info',
      content: {
        type: 'markdown',
        value: '# LocalAlert\n\n此弹窗由其他模组直接注入的 JS 创建.',
        markdownOptions: {
          html: false,
          breaks: false,
          linkify: true,
        },
        openLinksInNewTab: true,
      },
      display: {
        mode: 'version',
        version: '1.0.0',
      },
      close: {
        waitSeconds: 2,
        input: {
          expected: '确认',
          label: '请输入 确认 后关闭.',
          validationMessage: '输入内容不正确.',
        },
        confirmText: '关闭',
      },
      persistence: 'best-effort',
      swalOptions: {
        position: 'center',
      },
    })
    console.info('[example] LocalAlert 完成.', result)
  } catch (error) {
    console.error('[example] LocalAlert 失败.', error)
  }
})()
