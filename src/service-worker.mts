import { WebmunkConfiguration } from "./extension.mts"

export interface WebmunkConfigurationResponse {
  webmunkConfiguration:WebmunkConfiguration
}

export interface WebmunkIdentifierResponse {
  webmunkIdentifier:string
}

class WebmunkServiceWorkerModule {
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
}

export function registerWebmunkModule(webmunkModule:WebmunkServiceWorkerModule) {
  console.log(`Register ${webmunkModule}`)
}

const webmunkCorePlugin = {
  openExtensionWindow: () => {
    const optionsUrl = chrome.runtime.getURL('index.html')

    chrome.tabs.query({}, function (extensionTabs) {
      for (let i = 0; i < extensionTabs.length; i++) {
        if (optionsUrl === extensionTabs[i].url) {
          chrome.windows.remove(extensionTabs[i].windowId)
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

        if (tab.url.startsWith('https://') || tab.url.startsWith('http://')) {
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
  handleMessage: (message:any, sender:any, sendResponse:(response:any) => void): boolean => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (message.messageType == 'loadInitialConfiguration') {
      webmunkCorePlugin.initializeConfiguration(message.configuration)
        .then((response:string) => {
          sendResponse(response)
        })

      return true
    }

    if (message.messageType === 'fetchConfiguration') {
      chrome.storage.local.get('webmunkConfiguration')
        .then((response:WebmunkConfigurationResponse) => {
          sendResponse(response.webmunkConfiguration)
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
        .then((response:WebmunkIdentifierResponse) => {
          sendResponse(response.webmunkIdentifier)
        })

      return true
    }

  },
  initializeConfiguration: (configuration:WebmunkConfiguration): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get('webmunkConfiguration')
        .then((response:WebmunkConfigurationResponse) => {
          if (response.webmunkConfiguration !== undefined) {
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
  }
}

export default webmunkCorePlugin
