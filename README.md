# LocalAlert 调用示例

使用前请确保 `shared-md-alert` 的加载顺序早于调用方模组. 调用方应通过 `window.LocalAlert.show()` 创建弹窗, 不要直接调用 `Swal.fire()`.

## 文件

- `example/direct-injection.js`: 可直接加入其他模组 `injections` 的 JS 示例.

## 最小调用

```js
const result = await window.LocalAlert.show({
  id: 'my-mod-notice',
  priority: 0,
  title: '提示',
  content: {
    type: 'markdown',
    value: '# 标题\n\n这是内容.',
  },
})
```

## 队列和 ID

所有通过 `LocalAlert.show()` 创建的弹窗共享队列.

- `priority` 默认为 `0`, 数值越大越优先.
- 相同优先级按调用顺序显示.
- 同一 ID 在等待或显示期间再次调用时, 会复用首个请求的执行结果, 不会重复入队或显示.
- 首个同 ID 调用的配置和优先级生效. 需要独立弹窗时请使用不同 ID.
- 外部代码直接调用 `Swal.fire()` 不会进入 LocalAlert 队列.

## 常用配置

`content.type` 支持 `markdown`, `plain`, `url` 和 `html`.

- `markdown`: 默认禁止 HTML 和自动 `<br>` 输出. 可传入 `markdownOptions` 覆盖 markdown-it 配置.
- `url`: `.md` 或 `.markdown` 地址会作为 Markdown 获取. 默认超时 10 秒, 可通过 `content.fetchTimeoutMs` 调整.
- `html`: 必须设置 `allowUnsafeHtml: true`, 仅应使用受信任内容.

`display.mode` 支持 `always`, `once` 和 `version`. `once` 与 `version` 只会在用户确认后写入状态. `force: true` 可跳过显示规则.

`close` 可通过 `waitSeconds`, `input`, `confirmText`, `showCloseButton`, `allowOutsideClick` 和 `allowEscapeKey` 控制关闭行为. 设置输入校验或倒计时时会自动启用关闭保护.

`libraries` 通常无需设置. 只有需要替换本地依赖位置时才配置 `baseUrl`, `markdownItSrc` 或 `sweetAlertSrc`.
