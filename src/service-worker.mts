class WebmunkServiceWorkerModule {
  instantiationTarget: String

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
    chrome.runtime.onInstalled.addListener(function (details:Object) {
      webmunkCorePlugin.openExtensionWindow()
    })

    chrome.action.onClicked.addListener(function (tab) {
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
            tabId: tabId, // eslint-disable-line object-shorthand
            allFrames: true
            },
            files: ['/js/browser/bundle.js']
          }, function (result) {
            console.log('[webmunk-core] Content script loaded.')
            // Script loaded
          })
        }
      }
    })

    chrome.runtime.onMessage.addListener(webmunkCorePlugin.handleMessage)
  },
  handleMessage: (message: any, sender: any, sendResponse: Function): boolean => {
    if (message.messageType == 'loadInitialConfiguration') {
      webmunkCorePlugin.initializeConfiguration(message.configuration)
        .then((response: String) => {
          sendResponse(response)
        })

      return true
    }

    if (message.messageType == 'fetchConfiguration') {
      chrome.storage.local.get('webmunkConfiguration')
        .then((response: { [name: string]: any}) => {
          sendResponse(response.webmunkConfiguration)
        })

      return true
    }

    if (message.messageType == 'setIdentifier') {
      chrome.storage.local.set({
        webmunkIdentifier: message.identifier
      }).then(() => {
        sendResponse()
      })

      return true
    }

    if (message.messageType == 'getIdentifier') {
      chrome.storage.local.get('webmunkIdentifier')
        .then((response: { [name: string]: any}) => {
          sendResponse(response.webmunkIdentifier)
        })

      return true
    }

  },
  initializeConfiguration: (configuration: any): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get('webmunkConfiguration')
        .then((response: { [name: string]: any}) => {
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
