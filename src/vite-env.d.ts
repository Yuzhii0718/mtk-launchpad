/// <reference types="vite/client" />

declare module '*.bin?url' {
  const url: string
  export default url
}

declare module '*.img?url' {
  const url: string
  export default url
}
