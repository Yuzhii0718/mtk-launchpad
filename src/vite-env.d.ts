/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __APP_AUTHOR__: string

declare module '*.bin?url' {
  const url: string
  export default url
}

declare module '*.img?url' {
  const url: string
  export default url
}
