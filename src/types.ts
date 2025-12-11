type _Methods = 'get' | 'post' | 'put' | 'delete' | 'options' | 'head' | 'patch'
export type Methods = _Methods | Uppercase<_Methods>

export interface IRequestInfo {
  url: URL
  data: any
}

export interface InjectConfig {
  url: string | RegExp
  method: Methods
  callback?: Function
  preCallback?: PreCallbackHandler
  lastCallback?: LastCallbackHandler
  beforeSendCallback?: BeforeSendCallbackHandler
}

export type PreCallbackHandler = (
  resp: string | object,
  respInfo: IRequestInfo
) => IPreCallbackResult | Promise<IPreCallbackResult>

export type BeforeSendCallbackHandler = (
  requestInfo: IRequestInfo
) => BeforeSendCallBackResult | Promise<BeforeSendCallBackResult>

export type LastCallbackHandler = (resp: string | object, respInfo: IRequestInfo) => any | Promise<any>

export type BeforeSendCallBackResult = { url?: URL; data?: any } | void
export type IPreCallbackResult = [boolean, { uri?: string; data?: any }]

export interface XMLHttpRequestWithUrl extends XMLHttpRequest {
  uri?: string
  method?: Methods
  _requestHeaders?: Map<string, { name: string; value: string }>
  _originalSetRequestHeader?: typeof XMLHttpRequest.prototype.setRequestHeader
}

export interface XMLHttpRequestProxy {
  status: number
  response: any
  statusText: string
  responseType: string
  responseText: string
  responseXML: Document | null
  readyState: number
}
