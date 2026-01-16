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

  handleMessage(message:any, sender:any, sendResponse:(response:any) => void):boolean {
    return false
  }

  toString():string {
    return this.moduleName()
  }

  refreshConfiguration() {
    // Can be overridden by subclasses to activate latest configurations...
  }
}

const registeredExtensionModules:WebmunkServiceWorkerModule[] = []

export function registerWebmunkModule(webmunkModule:WebmunkServiceWorkerModule) {
  if (!registeredExtensionModules.includes(webmunkModule)) {
    registeredExtensionModules.push(webmunkModule)

    webmunkModule.setup()
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

    if (message.messageType === 'refreshConfiguration') {
      webmunkCorePlugin.fetchConfiguration()
        .then((configuration:WebmunkConfiguration) => {
          console.log('[webmunk-core] Fetched configuration:')
          console.log(configuration)

          chrome.storage.local.get('webmunkIdentifier')
            .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const idResponse:WebmunkIdentifierResponse = response as WebmunkIdentifierResponse
              const identifier = idResponse.webmunkIdentifier

              const configUrlStr = configuration['configuration_url'] as string

              const configUrl:URL = new URL(configUrlStr.replaceAll('<IDENTIFIER>', identifier))

              fetch(configUrl)
                .then((response: Response) => {
                  if (response.ok) {
                    response.json().then((jsonData:WebmunkConfiguration) => {
                      console.log(`${configUrl}:`)
                      console.log(jsonData)

                      webmunkCorePlugin.updateConfiguration(jsonData)
                        .then((response:string) => {
                          for (const extensionModule of registeredExtensionModules) {
                            extensionModule.refreshConfiguration()
                          }

                          sendResponse(jsonData)
                        })
                    })
                } else {
                  sendResponse(null)
                }
              })
          })
        })

      return true
    }

    if (message.messageType === 'setIdentifier') {
      chrome.storage.local.set({
        webmunkIdentifier: message.identifier
      }).then(() => {
        sendResponse(message.identifier)
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

    if (message.messageType == 'openWindow') {
      const optionsUrl = chrome.runtime.getURL('index.html')

      chrome.tabs.query({})
        .then((extensionTabs:chrome.tabs.Tab[]) => {
          for (let i = 0; i < extensionTabs.length; i++) {
            const extensionTab = extensionTabs[i]

            if (extensionTab !== undefined) {
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
          }).then((newWindow:chrome.windows.Window | undefined) => {
            if (newWindow !== undefined) {
              sendResponse(newWindow.id)
            }
          })
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

    let handled:boolean = false

    for (const extensionModule of registeredExtensionModules) {
      if (extensionModule.handleMessage !== undefined) {
        if (extensionModule.handleMessage(message, sender, sendResponse)) {
          handled = true
        }
      }
    }

    return handled
  },
  initializeConfiguration: (configuration:WebmunkConfiguration): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get('webmunkConfiguration')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const configResponse:WebmunkConfigurationResponse = response as WebmunkConfigurationResponse

          if (configResponse.webmunkConfiguration !== undefined) {
            resolve('Error: Configuration already initialized.')
          } else {
            chrome.storage.local.set({
              webmunkConfiguration: configuration
            }).then(() => {
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
