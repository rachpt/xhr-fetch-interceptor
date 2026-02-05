import { unsafeWindow } from 'vite-plugin-monkey/dist/client'
import type { Methods, InjectConfig, IRequestInfo, XMLHttpRequestProxy, XMLHttpRequestWithUrl } from './types'

let INSTANCE: XHRAndFetchInterceptor | null = null

/**
 * 拦截网页的 XHR 请求
 *
 * 使用示例
 *  const interceptor = new XHRAndFetchInterceptor()
 * 当需要停止拦截并恢复原始行为时
 *   interceptor.restore();
 */
class XHRAndFetchInterceptor {
  private static isHijacked: boolean = false
  private originalXHRopen!: typeof XMLHttpRequest.prototype.open
  private originalXHRsend!: typeof XMLHttpRequest.prototype.send
  private interceptConfigs: InjectConfig[] = []
  private originalFetch!: typeof fetch

  constructor(options: InjectConfig | InjectConfig[]) {
    if (XHRAndFetchInterceptor.isHijacked) {
      if (INSTANCE) {
        INSTANCE.addConfig(options)
        return INSTANCE
      }
      console.warn('XHRAndFetchInterceptor: Already activated, avoid duplicate interception.')
      return
    }
    this.interceptConfigs = Array.isArray(options) ? options : [options]
    this.originalXHRopen = XMLHttpRequest.prototype.open
    this.originalXHRsend = XMLHttpRequest.prototype.send
    this.originalFetch = unsafeWindow.fetch
    this.hijackXHR()
    this.hijackFetch()
    XHRAndFetchInterceptor.isHijacked = true
    INSTANCE = this
  }

  // 新增方法：添加其他需要拦截处理的配置
  public addConfig(config: InjectConfig | InjectConfig[]): void {
    const newConfigs = Array.isArray(config) ? config : [config]
    newConfigs.forEach(newCf => {
      const isExist = this.interceptConfigs.some(cf => cf.url === newCf.url && cf.method === newCf.method)
      if (!isExist) this.interceptConfigs.push(newCf)
    })
  }

  private hijackXHR() {
    const self = this

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequestWithUrl,
      method: Methods,
      uri: string,
      async: boolean = true,
      user?: string,
      password?: string
    ): void {
      this.uri = uri
      this.method = method
      // 保存原始的 setRequestHeader 方法
      if (!this._originalSetRequestHeader) {
        this._originalSetRequestHeader = this.setRequestHeader
        this._requestHeaders = new Map()

        // 重写 setRequestHeader 来保存请求头
        this.setRequestHeader = function (name: string, value: string) {
          this._requestHeaders!.set(name.toLowerCase(), { name, value })
          return this._originalSetRequestHeader!.call(this, name, value)
        }
      }
      self.originalXHRopen.apply(this, [method, uri, async, user, password])
    }

    XMLHttpRequest.prototype.send = async function (
      this: XMLHttpRequestWithUrl,
      body?: Document | XMLHttpRequestBodyInit | null
    ): Promise<void> {
      const originalOnreadystatechange = this.onreadystatechange
      const originalSend = self.originalXHRsend.bind(this)
      const proxy: XMLHttpRequestProxy = {
        status: 0,
        statusText: '',
        response: null,
        responseText: '',
        responseXML: null,
        responseType: '',
        readyState: 0,
      }

      const xhr = new Proxy(this, {
        get: (target, prop) => {
          if (prop === 'readyState') return proxy.readyState
          return Reflect.get(target, prop)
        },
      })
      const requestUrl = this.uri?.startsWith('/') ? `${location.origin}${this.uri}` : this.uri!

      // 在发送请求前执行 beforeSendCallback
      for (const config of self.interceptConfigs) {
        if (isTargetUrl(requestUrl, config.url) && isMethodEqual(this.method!, config.method)) {
          if (config.beforeSendCallback) {
            const requestInfo: IRequestInfo = {
              url: new URL(requestUrl),
              data: body,
            }
            const { data: newBody, url: newUrl } = (await config.beforeSendCallback(requestInfo)) || {}
            if (newBody) body = newBody
            if (newUrl) {
              this.uri = newUrl.toString()
              // 保存当前的请求头
              const savedHeaders = new Map(this._requestHeaders!)
              // 重新调用 open 方法
              self.originalXHRopen.apply(this, [this.method!, this.uri, true])
              // 恢复请求头（跳过 content-length，因为 body 可能被修改）
              savedHeaders.forEach(header => {
                if (header.name.toLowerCase() !== 'content-length') {
                  this.setRequestHeader(header.name, header.value)
                }
              })
            }
          }
          break // 只应用第一个匹配的配置
        }
      }

      // 重写onreadystatechange事件处理函数
      this.onreadystatechange = async function (this: XMLHttpRequestWithUrl, ev: Event) {
        let shouldResponse = true // 区分是否被 preCallback 拦截响应
        // 当请求完成时
        if (this.readyState === 4 && this.status === 200) {
          for (const config of self.interceptConfigs) {
            if (!isTargetUrl(this.responseURL, config.url) || !isMethodEqual(this.method, config.method)) continue

            const requestInfo: IRequestInfo = {
              url: genUrl(this.responseURL),
              data: body,
            }
            if (config.preCallback) {
              const [isValid, newBody] = await config.preCallback(getResponseData(this), requestInfo)

              if (!isValid) {
                shouldResponse = false
                // 创建一个新的 XMLHttpRequest 对象来发送修改后的请求
                const newRequest = new XMLHttpRequest()
                newRequest.open(this.method!, newBody.uri!, true)
                newRequest.onreadystatechange = async () => {
                  if (newRequest.readyState === 4) {
                    // 更新代理对象而不是直接修改原始XHR对象
                    proxy.status = newRequest.status
                    proxy.statusText = newRequest.statusText
                    proxy.response = newRequest.response
                    proxy.responseText = newRequest.responseText
                    proxy.responseXML = newRequest.responseXML
                    proxy.readyState = newRequest.readyState

                    if (config.lastCallback) {
                      const modifiedResponse = await config.lastCallback(
                        getResponseData(proxy as XMLHttpRequest),
                        requestInfo
                      )
                      proxy.response = modifiedResponse
                      proxy.responseText = JSON.stringify(modifiedResponse)
                    }

                    // 使用代理对象的值来模拟XHR对象的行为
                    Object.defineProperties(this, {
                      status: { get: () => proxy.status, configurable: true },
                      response: { get: () => proxy.response, configurable: true },
                      statusText: { get: () => proxy.statusText, configurable: true },
                      responseXML: { get: () => proxy.responseXML, configurable: true },
                      responseText: { get: () => proxy.responseText, configurable: true },
                      responseType: { get: () => proxy.responseType, configurable: true },
                      readyState: { get: () => proxy.readyState, configurable: true },
                    })
                    // 执行原始事件, 仅响应完成的状态
                    if (originalOnreadystatechange) originalOnreadystatechange.call(xhr, ev)
                  }
                }
                return newRequest.send(newBody?.data)
              }
            }

            const responseData = getResponseData(this)
            if (config.callback) {
              await config.callback(responseData)
            }

            if (config.lastCallback) {
              const modifiedResponse = await config.lastCallback(responseData, requestInfo)
              proxy.response = modifiedResponse
              proxy.responseText = JSON.stringify(modifiedResponse)
              Object.defineProperties(this, {
                response: { get: () => proxy.response, configurable: true },
                responseText: { get: () => proxy.responseText, configurable: true },
              })
            }
          }
        }
        // 执行原始事件, 如果没有被 preCallback 劫持
        if (originalOnreadystatechange && shouldResponse) originalOnreadystatechange.call(this, ev)
      }
      // 发送请求
      return originalSend(body)
    }
  }

  // 暂不支持 preCallback 和 lastCallback
  private hijackFetch() {
    const self = this
    unsafeWindow.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      // 在这里可以对请求进行处理，比如修改请求的 URL、请求头等
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init && init.method ? init.method : 'GET'

      // 处理 beforeSendCallback
      let modifiedInput = input
      let modifiedInit = init

      for (const config of self.interceptConfigs) {
        if (isTargetUrl(url, config.url) && isMethodEqual(method, config.method)) {
          if (config.beforeSendCallback) {
            const requestInfo: IRequestInfo = {
              url: genUrl(url),
              data: init?.body,
            }
            const result = await config.beforeSendCallback(requestInfo)
            if (result) {
              if (result.url) {
                modifiedInput = result.url.toString()
              }
              if (result.data) {
                modifiedInit = { ...init, body: result.data }
              }
            }
          }
          break // 只应用第一个匹配的配置
        }
      }

      const response = await self.originalFetch.call(unsafeWindow, modifiedInput, modifiedInit)

      // 处理响应
      for (const config of self.interceptConfigs) {
        if (isTargetUrl(response.url, config.url) && isMethodEqual(method, config.method)) {
          const clonedResponse = response.clone()
          const content = await clonedResponse.text()
          let responseData: any

          try {
            // 尝试解析为 JSON
            responseData = JSON.parse(content)
          } catch {
            // 如果不是 JSON，则使用原始文本
            responseData = content
          }

          const requestInfo: IRequestInfo = {
            url: genUrl(response.url),
            data: init?.body,
          }

          // 执行 callback
          if (config.callback) {
            await config.callback(responseData)
          }

          // 执行 lastCallback 并修改响应
          if (config.lastCallback) {
            const modifiedData = await config.lastCallback(responseData, requestInfo)

            // 创建新的响应对象
            const modifiedContent = typeof modifiedData === 'string' ? modifiedData : JSON.stringify(modifiedData)

            return new Response(modifiedContent, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            })
          }
        }
      }

      return response
    }
  }

  public restore() {
    XMLHttpRequest.prototype.open = this.originalXHRopen
    XMLHttpRequest.prototype.send = this.originalXHRsend
    unsafeWindow.fetch = this.originalFetch
  }
}

/**
 * 重建 URL
 * @param url 原始 URL
 * @returns 补全域名的 URL
 */
function genUrl(url: string): URL {
  if (url.startsWith('/')) {
    return new URL(`${location.origin}${url}`)
  }
  return new URL(url)
}

/**
 * 比较是否为目标 URL
 * @param url
 * @param targetUrl
 * @returns
 */
function isTargetUrl(url: string, targetUrl: string | RegExp): boolean {
  if (targetUrl instanceof RegExp) {
    return targetUrl.test(url)
  }

  try {
    const urlObj = new URL(url)
    const targetUrlObj = new URL(targetUrl)
    return (
      urlObj.host === targetUrlObj.host &&
      urlObj.protocol === targetUrlObj.protocol &&
      urlObj.pathname === targetUrlObj.pathname
    )
  } catch {
    return false
  }
}

/**
 * 请求方法是否相同
 * @param method
 * @param targetMethod
 * @returns
 */
function isMethodEqual(method: string | undefined, targetMethod: string): boolean {
  return method?.toLocaleLowerCase() === targetMethod?.toLocaleLowerCase()
}

function getResponseData(xhr: XMLHttpRequest) {
  return xhr.responseType === 'json' ? xhr.response : xhr.responseText
}

// 导出所有类型
export * from './types'

// 导出默认实例
export default XHRAndFetchInterceptor
export { XHRAndFetchInterceptor }
