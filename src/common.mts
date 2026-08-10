export interface REXUIDefinition {
  title:string,
  identifier:string,
  depends_on:string[]
  load_dynamic?:boolean
}

export interface REXConfiguration {
  ui:REXUIDefinition[],
  configuration_url:string,
  [key: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Applies configuration-scope entries as query parameters to a resolved
// configuration URL. The scope vocabulary is client-defined (a study id, a
// cohort, ...) — rex-core only transports it. A key already present in the URL
// is left alone: an explicitly configured parameter wins over the stored scope.
// Scoping goes through URLSearchParams rather than string concatenation, so
// separator and escaping handling belong to the URL API, not to this function.
//
// Only remote http(s) configurations are scoped. A configuration_url may also be
// a rex-config:// URL (a configuration bundled in the extension, resolved here
// against extensionBaseUrl so serverless setups work in every context), an
// already-resolved chrome-extension:// URL, or a bare relative path
// ('config.json'); all three are extension-local and need no scope. The
// resolution uses extensionBaseUrl, which callers supply
// (chrome.runtime.getURL('/')) so this stays free of extension APIs.
export function scopeConfigurationUrl(configUrlStr:string, scope:{ [key: string]: string }, extensionBaseUrl:string):URL {
  const lowerUrlStr = configUrlStr.toLowerCase()

  if (lowerUrlStr.startsWith('rex-config://')) {
    const bundledPath = configUrlStr.slice('rex-config://'.length).replace(/^\/+/, '')

    return new URL(bundledPath, extensionBaseUrl)
  }

  if (!lowerUrlStr.startsWith('http://') && !lowerUrlStr.startsWith('https://')) {
    return new URL(configUrlStr, extensionBaseUrl)
  }

  const scopedUrl = new URL(configUrlStr)

  for (const scopeKey of Object.keys(scope)) {
    const scopeValue = scope[scopeKey]

    if (scopeValue === undefined || scopedUrl.searchParams.has(scopeKey)) {
      continue
    }

    scopedUrl.searchParams.set(scopeKey, scopeValue)
  }

  return scopedUrl
}

export function hash(cleartext:string, algorithm: string|undefined):Promise<string> {
  if (algorithm === undefined) {
    algorithm = 'SHA-256'
  }

  return new Promise<string>((resolve) => {
    const msgUint8 = new TextEncoder().encode(cleartext); // encode as (utf-8) Uint8Array

    crypto.subtle.digest(algorithm, msgUint8).then((hashBuffer) => {
      const hexBytes = new Uint8Array(hashBuffer)

      const hashHex = Array.from(hexBytes, (byte) => 
        byte.toString(16).padStart(2, '0')
      ).join('');      

      resolve(hashHex)
    })
  })
}

export function sha256(cleartext:string):Promise<string> {
  return hash(cleartext, 'SHA-256')
}

export function sha512(cleartext:string):Promise<string> {
  return hash(cleartext, 'SHA-512')
}