import { type WebmunkConfiguration } from "./extension.mjs"

export interface WebmunkConfigurationResponse {
  webmunkConfiguration:WebmunkConfiguration
}

export interface WebmunkIdentifierResponse {
  webmunkIdentifier:string
}

export class WebmunkServiceWorkerModule {
  instantiationTarget:string

  constructor() {
    if (new.target === WebmunkServiceWorkerModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`TODO: Implement in ${this.instantiationTarget}...`)
  }

  logEvent(event:object) {
    if (event !== undefined) {
      console.log('WebmunkServiceWorkerModule: implement "logEvent" in subclass...')
    }
  }

  moduleName() {
    return 'WebmunkServiceWorkerModule'
  }
}

const registeredExtensionModules:WebmunkServiceWorkerModule[] = []

async function maybeRedirectOnInstall(configuration: WebmunkConfiguration): Promise<void> {
  const redirectConfig = configuration?.redirect_on_install
  if (!redirectConfig?.enabled) return

  const rawUrl = (redirectConfig.url ?? '').trim()
  if (!rawUrl) return

  // Don't redirect until we actually have an identifier (otherwise the redirect
  // happens immediately on install before the user can enter it, which breaks
  // config selection via identifier).
  const idResult = await chrome.storage.local.get('webmunkIdentifier')
  const identifier = idResult.webmunkIdentifier as string | undefined
  if (!identifier || identifier.length === 0) return

  const doneResult = await chrome.storage.local.get('webmunk_redirect_on_install_done')
  const alreadyDone = doneResult.webmunk_redirect_on_install_done as boolean | undefined
  if (alreadyDone) return

  await chrome.storage.local.set({
    webmunk_redirect_on_install_done: true,
    webmunk_redirect_on_install_done_at: new Date().toISOString()
  })

  const url =
    rawUrl.startsWith('http://') ||
    rawUrl.startsWith('https://') ||
    rawUrl.startsWith('chrome-extension://')
      ? rawUrl
      : chrome.runtime.getURL(rawUrl.replace(/^\//, ''))

  // Log via the normal module dispatch channel.
  dispatchEvent({
    name: 'page-redirect',
    url,
    timestamp: new Date().toISOString()
  })

  chrome.tabs.create({ url })
}

export function registerWebmunkModule(webmunkModule:WebmunkServiceWorkerModule) {
  console.log(`Registering ${webmunkModule.moduleName()}...`)
  if (!registeredExtensionModules.includes(webmunkModule)) {
    registeredExtensionModules.push(webmunkModule)

    webmunkModule.setup()
    console.log(`Registered ${webmunkModule.moduleName()}!`)
  }
}

export function dispatchEvent(event: { name: string; [key: string]: unknown }) {
  console.log(`[webmunk-core] dispatchEvent: ${event.name} -- ${registeredExtensionModules.length} modules`)

  for (const extensionModule of registeredExtensionModules) {
    if (extensionModule.logEvent !== undefined) {
      extensionModule.logEvent(event)
    }
  }
}

const webmunkCorePlugin = { // TODO rename to "engine" or something...
  openExtensionWindow: () => {
    const optionsUrl = chrome.runtime.getURL('index.html')

    chrome.tabs.query({}, function (extensionTabs) {
      if (extensionTabs !== undefined) {
        for (const extensionTab of extensionTabs) {
          if (optionsUrl === extensionTab.url) {
            chrome.windows.remove(extensionTab.windowId)
          }
        }
      }

      chrome.windows.create({
        height: 480,
        width: 640,
        type: 'panel',
        url: chrome.runtime.getURL('index.html')
      })
    })
  },
  setup: () => {
    chrome.runtime.onInstalled.addListener(function (details:object) { // eslint-disable-line @typescript-eslint/no-unused-vars
      webmunkCorePlugin.openExtensionWindow()
    })

    chrome.action.onClicked.addListener(function (tab) { // eslint-disable-line @typescript-eslint/no-unused-vars
      webmunkCorePlugin.openExtensionWindow()
    })

    const loadedScripts = new Set()

    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {

      if (changeInfo.status === 'complete') {
        loadedScripts.delete(`${tabId}-${tab.url}`)
      } else if (changeInfo.status === 'loading' && loadedScripts.has(`${tabId}-${tab.url}`) === false) {
        loadedScripts.add(`${tabId}-${tab.url}`)

        if (tab.url !== undefined && (tab.url.startsWith('https://') || tab.url.startsWith('http://'))) {
          chrome.scripting.executeScript({
            target: {
            tabId: tabId,
            allFrames: true
            },
            files: ['/js/browser/bundle.js']
          }, function (result) { // eslint-disable-line @typescript-eslint/no-unused-vars
            console.log('[webmunk-core] Content script loaded.')
          })
        }
      }
    })

    chrome.runtime.onMessage.addListener(webmunkCorePlugin.handleMessage)
  },
  handleMessage: (message:any, sender:any, sendResponse:(response:any) => void):boolean => { // eslint-disable-line @typescript-eslint/no-explicit-any
    //receive message from extension
    if (message.messageType == 'loadInitialConfiguration') {
      webmunkCorePlugin.initializeConfiguration(message.configuration)
        .then((response:string) => {
          sendResponse(response)
        })

      return true
    }

    if (message.messageType == 'updateConfiguration') {
      webmunkCorePlugin.updateConfiguration(message.configuration)
        .then((response:string) => {
          sendResponse(response)
        })

      return true
    }

    if (message.messageType === 'fetchConfiguration') {
      webmunkCorePlugin.fetchConfiguration()
        .then((configuration:WebmunkConfiguration) => {
          sendResponse(configuration)
        })

      return true
    }

    if (message.messageType === 'setIdentifier') {
      chrome.storage.local.set({
        webmunkIdentifier: message.identifier
      }).then(() => {
        // If the remote configuration was already fetched/stored (we fetch it
        // during identifier validation), this is the first moment we can safely
        // apply redirect-on-install semantics.
        webmunkCorePlugin.fetchConfiguration()
          .then((configuration: WebmunkConfiguration) => maybeRedirectOnInstall(configuration))
          .catch(() => undefined)
          .finally(() => sendResponse(message.identifier))
      })

      return true
    }

    if (message.messageType == 'getIdentifier') {
      chrome.storage.local.get('webmunkIdentifier')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const idResponse:WebmunkIdentifierResponse = response as WebmunkIdentifierResponse
          sendResponse(idResponse.webmunkIdentifier)
        })

      return true
    }

    if (message.messageType == 'logEvent') {
      // message.event = { name:string, ... }

      for (const extensionModule of registeredExtensionModules) {
        if (extensionModule.logEvent !== undefined) {
          extensionModule.logEvent(message.event)
        }
      }

      return true
    }

    return false
  },
  initializeConfiguration: (configuration:WebmunkConfiguration): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get('webmunkConfiguration')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any

          const configResponse:WebmunkConfigurationResponse = response as WebmunkConfigurationResponse

          if (configResponse.webmunkConfiguration !== undefined) {
            // Idempotent: the extension UI may call "loadInitialConfiguration"
            // multiple times (e.g., whenever the UI window is opened). Returning
            // an error here causes noisy console warnings even though nothing is
            // actually wrong. Do not overwrite existing configuration.
            resolve('Success: Configuration already initialized.')
          } else {
            chrome.storage.local.set({
              webmunkConfiguration: configuration
            }).then(() => {
              // Only redirect once we have an identifier (see maybeRedirectOnInstall).
              maybeRedirectOnInstall(configuration).catch(() => undefined)
              resolve('Success: Configuration initialized.')
            })
          }
        })
    })
  },
  updateConfiguration: (configuration:WebmunkConfiguration): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        webmunkConfiguration: configuration
      }).then(() => {
        // If identifier already exists, this may be the moment we can redirect.
        maybeRedirectOnInstall(configuration).catch(() => undefined)
        resolve('Success: Configuration updated.')
      })
    })
  },
  fetchConfiguration(): Promise<WebmunkConfiguration> {
    return new Promise((resolve, reject) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      chrome.storage.local.get('webmunkConfiguration')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const idResponse:WebmunkConfigurationResponse = response as WebmunkConfigurationResponse
          resolve(idResponse.webmunkConfiguration)
        })
    })
  }
}

export default webmunkCorePlugin
