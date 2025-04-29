# xhr-fetch-interceptor

一个用于拦截和修改 XHR 和 Fetch 请求的工具库，特别适用于油猴脚本开发。

## 安装

```bash
pnpm add xhr-fetch-interceptor
# or npm
npm install xhr-fetch-interceptor
```

## 使用

```js
import XHRAndFetchInterceptor from 'xhr-fetch-interceptor'

// 基本用法
const interceptor = new XHRAndFetchInterceptor({
  url: 'https://example.com/api/target',
  method: 'POST',
  callback: (responseData) => {
    // 处理响应数据
    console.log(responseData)
  }
})

// 当需要停止拦截并恢复原始行为时
// interceptor.restore()
```

## API

### 构造函数

```js
new XHRAndFetchInterceptor(options)
```

参数 `options` 可以是单个配置对象或配置对象数组：

```js
// 单个配置
const interceptor = new XHRAndFetchInterceptor({
  url: 'https://example.com/api',
  method: 'GET',
  // 其他回调...
})

// 多个配置
const interceptor = new XHRAndFetchInterceptor([
  {
    url: 'https://example.com/api1',
    method: 'GET',
    // 回调...
  },
  {
    url: 'https://example.com/api2',
    method: 'POST',
    // 回调...
  }
])
```

### 配置选项

每个拦截配置对象支持以下属性：

| 属性 | 类型 | 描述 |
|------|------|------|
| `url` | `string \| RegExp` | 要拦截的 URL，可以是字符串或正则表达式 |
| `method` | `string` | HTTP 方法，如 'GET'、'POST' 等 |
| `beforeSendCallback` | `Function` | 请求发送前的回调，可用于修改请求 |
| `callback` | `Function` | 响应处理回调 |
| `preCallback` | `Function` | 预处理响应的回调，可用于拦截并修改响应 |
| `lastCallback` | `Function` | 最终处理响应的回调，可用于修改响应数据 |

### 回调函数

#### beforeSendCallback

在请求发送前调用，可以修改请求 URL 和数据。

```js
beforeSendCallback: (requestInfo) => {
  // requestInfo 包含 url 和 data
  console.log(requestInfo.url) // URL 对象
  console.log(requestInfo.data) // 请求数据
  
  // 返回修改后的请求信息（可选）
  return {
    url: new URL('https://example.com/modified'),
    data: { modified: true }
  }
}
```

#### callback

响应数据的简单处理回调。

```js
callback: (responseData) => {
  // responseData 是响应数据（字符串或对象）
  console.log(responseData)
}
```

#### preCallback

预处理响应的回调，可以拦截原始响应并发送新请求。

```js
preCallback: (responseData, requestInfo) => {
  // 返回 [是否有效, 新请求信息]
  // 如果第一个参数为 false，将发送新请求
  return [false, {
    uri: 'https://example.com/new-request',
    data: { newRequest: true }
  }]
}
```

#### lastCallback

最终处理响应的回调，可以修改响应数据。

```js
lastCallback: (responseData, requestInfo) => {
  // 修改响应数据
  responseData.modified = true
  return responseData
}
```

### 实例方法

#### addConfig

添加新的拦截配置。

```js
interceptor.addConfig({
  url: 'https://example.com/another-api',
  method: 'GET',
  callback: (data) => console.log(data)
})

// 或添加多个配置
interceptor.addConfig([
  { url: '/api1', method: 'GET', callback: handleApi1 },
  { url: '/api2', method: 'POST', callback: handleApi2 }
])
```

#### restore

恢复原始的 XHR 和 Fetch 行为，停止拦截。

```js
interceptor.restore()
```

## 完整示例

```js
import XHRAndFetchInterceptor from 'xhr-fetch-interceptor'

const interceptor = new XHRAndFetchInterceptor({
  url: 'https://example.com/api/data',
  method: 'GET',
  
  // 请求发送前修改
  beforeSendCallback: (requestInfo) => {
    console.log('准备发送请求:', requestInfo.url.toString())
    // 添加查询参数
    const url = requestInfo.url
    url.searchParams.append('token', 'my-auth-token')
    return { url }
  },
  
  // 简单响应处理
  callback: (data) => {
    console.log('收到响应:', data)
  },
  
  // 预处理响应
  preCallback: (responseData, requestInfo) => {
    if (responseData.needsRedirect) {
      // 拦截并发送新请求
      return [false, {
        uri: 'https://example.com/api/redirect',
        data: JSON.stringify({ originalData: responseData })
      }]
    }
    // 不拦截
    return [true, {}]
  },
  
  // 最终处理响应
  lastCallback: (responseData, requestInfo) => {
    // 修改响应数据
    return {
      ...responseData,
      processed: true,
      timestamp: Date.now()
    }
  }
})

// 稍后添加更多拦截配置
interceptor.addConfig({
  url: /api\/users\/\d+/,  // 使用正则表达式匹配 URL
  method: 'GET',
  callback: (userData) => {
    console.log('用户数据:', userData)
  }
})

// 当不再需要拦截时
// interceptor.restore()
```

## License
MIT