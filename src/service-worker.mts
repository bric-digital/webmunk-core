import { type REXConfiguration, hash } from "./common.mjs"

export interface EventPayload {
  'name':string,
  [key: string]: unknown,
}

export interface REXConfigurationResponse {
  REXConfiguration:REXConfiguration
}

export interface REXIdentifierResponse {
  rexIdentifier:string
}

export class REXServiceWorkerModule {
  instantiationTarget:string

  constructor() {
    if (new.target === REXServiceWorkerModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`TODO: Implement in ${this.instantiationTarget}...`)
  }

  logEvent(event:object) {
    if (event !== undefined) {
      // console.log('REXServiceWorkerModule: implement "logEvent" in subclass...')
    }
  }

  moduleName() {
    return 'REXServiceWorkerModule'
  }

  handleMessage(message:any, sender:any, sendResponse:(response:any) => void):boolean { // eslint-disable-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    return false
  }

  toString():string {
    return this.moduleName()
  }

  refreshConfiguration() {
    // Can be overridden by subclasses to activate latest configurations...
  }

  configurationDetails():any {// eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      module_name: {
        enabled: 'Boolean, true if module is active, false otherwise.',
        other_params: 'Add JSON-serializable parameters to extend configuration.'
      }
    }
  }
}

const REX_DATABASE_VERSION = 1

const registeredExtensionModules:REXServiceWorkerModule[] = []

export function registerREXModule(rexModule:REXServiceWorkerModule) {
  if (!registeredExtensionModules.includes(rexModule)) {
    registeredExtensionModules.push(rexModule)

    rexModule.setup()
  }
}

export function dispatchEvent(event:EventPayload) {
  for (const extensionModule of registeredExtensionModules) {
    if (extensionModule.logEvent !== undefined) {
      extensionModule.logEvent(event)
    }
  }
}

// Resolves a configured configuration_url to a fetchable URL. A rex-config://
// URL points at a configuration bundled in the extension and is rewritten to a
// chrome-extension:// URL, allowing a fully local (serverless) setup with no
// remote fetch. Any other URL is treated as remote and has its <IDENTIFIER>
// token substituted as before.
function resolveConfigurationUrl(configUrlStr:string, identifier:string):string {
  if (configUrlStr.startsWith('rex-config://')) {
    const path = configUrlStr.replace('rex-config://', '').replace(/^\/+/, '')
    const resolved = chrome.runtime.getURL(path)

    console.log(`[rex-core] Using local bundled configuration: ${resolved}`)

    return resolved
  }

  return configUrlStr.replaceAll('<IDENTIFIER>', identifier)
}

let rexDatabase:IDBDatabase|null = null

const rexCorePlugin = { // TODO rename to "engine" or something...
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
    })

    chrome.windows.create({
      height: 480,
      width: 640,
      type: 'panel',
      url: optionsUrl
    })
  },
  setup: () => {
    console.log(`[rex-core] Running setup...`)

    chrome.runtime.onInstalled.addListener(function (details:object) { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Record the install time once, the first time it is seen. Stored here so
      // every extension has it via the getInstallTime message instead of each
      // study extension recording its own. Set-if-absent so updates/reloads
      // never overwrite the original install timestamp.
      chrome.storage.local.get('rexInstallTime')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (response.rexInstallTime === undefined) {
            chrome.storage.local.set({ rexInstallTime: Date.now() })
          }
        })

      rexCorePlugin.openExtensionWindow()
    })

    chrome.action.onClicked.addListener(function (tab) { // eslint-disable-line @typescript-eslint/no-unused-vars
      rexCorePlugin.openExtensionWindow()
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
            allFrames: false // TODO: Review whether this caused any unintended side-effects. Potentially move to configuration.
            },
            files: ['/js/browser/bundle.js']
          }, function (result) { // eslint-disable-line @typescript-eslint/no-unused-vars
            console.log('[rex-core] Content script loaded.')
          })
        }
      }
    })

    chrome.runtime.onMessage.addListener(rexCorePlugin.handleMessage)

    const request = indexedDB.open('rex_db', REX_DATABASE_VERSION)

    request.onerror = (event) => {
      console.error(`[rex-core] Unable to open REX database: ${event}`)
    }

    request.onsuccess = (event) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      rexDatabase = request.result

      console.log(`[rex-core] Successfully opened REX database.`)
    }

    request.onupgradeneeded = (event) => {
      console.log(`[rex-core] Database upgrade required...`)
      console.log(event)

      rexDatabase = request.result

      switch (event.oldVersion) {
        case 0: {
          const values = rexDatabase.createObjectStore('values')

          values.createIndex('key', 'key', { unique: true })
          values.createIndex('value', 'value', { unique: false })

          console.log(`[rex-core] Successfully upgraded the REX database.`)
        }
      }
    }
  },
  handleMessage: (message:any, sender:any, sendResponse:(response:any) => void):boolean => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (message.messageType == 'loadInitialConfiguration') {
      rexCorePlugin.initializeConfiguration(message.configuration)
        .then((response:string) => {
          sendResponse(response)
        })

      return true
    }

    if (message.messageType == 'waitForConfiguration') {
      const event = message.event

      if (event !== undefined) {
        if (event.timeout !== undefined) {
          const start = Date.now()

          const checkConfig = () => {
            const now = Date.now()

            console.log(`[waitForConfiguration] fetching configuration: ${now - start}`)

            rexCorePlugin.fetchConfiguration()
              .then((configuration:REXConfiguration) => {
                console.log(`[waitForConfiguration] configuration: ${JSON.stringify(configuration)}`)

                if (configuration === undefined) {
                  throw new Error(`Configuration is undefined.`)
                } else {
                  sendResponse(configuration)
                }
              }).catch((err) => {
                console.log(`[waitForConfiguration] catch error: ${err}`)

                if (now - start > event.timeout) {
                  console.log(`[waitForConfiguration] event.timeout exceeded: ${event.timeout}`)

                  throw new Error(`event.timeout exceeded: ${event.timeout}`)
                } else {
                  self.setTimeout(checkConfig, 250)
                }
              })
          }

          checkConfig()
        } else {
          throw new Error('event.timeout is undefined')
        }
      } else {
        throw new Error('event is undefined')
      }

      return true
    }

    if (message.messageType == 'updateConfiguration') {
      rexCorePlugin.updateConfiguration(message.configuration)
        .then((response:string) => {
          sendResponse(response)
        })

      return true
    }

    if (message.messageType === 'fetchConfiguration') {
      rexCorePlugin.fetchConfiguration()
        .then((configuration:REXConfiguration) => {
          sendResponse(configuration)
        })

      return true
    }

    if (message.messageType === 'refreshConfiguration') {
      rexCorePlugin.fetchConfiguration()
        .then((configuration:REXConfiguration) => {
          // console.log('[rex-core] Fetched configuration:')
          // console.log(configuration)

          const configUrlStr = configuration['configuration_url'] as string

          chrome.storage.local.get('rexIdentifier')
            .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const idResponse:REXIdentifierResponse = response as REXIdentifierResponse
              const identifier = idResponse.rexIdentifier

              const configUrl:URL = new URL(resolveConfigurationUrl(configUrlStr, identifier))

              fetch(configUrl)
                .then((response: Response) => {
                  if (response.ok) {
                    response.json().then((jsonData:REXConfiguration) => {
                      if (jsonData === null || jsonData === undefined) {
                        sendResponse(null)
                        return
                      }

                      rexCorePlugin.updateConfiguration(jsonData)
                        .then((response:string) => { // eslint-disable-line @typescript-eslint/no-unused-vars
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
        rexIdentifier: message.identifier
      }).then(() => {
        sendResponse(message.identifier)
      })

      return true
    }

    if (message.messageType == 'getIdentifier') {
      chrome.storage.local.get('rexIdentifier')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const idResponse:REXIdentifierResponse = response as REXIdentifierResponse
          sendResponse(idResponse.rexIdentifier)
        })

      return true
    }

    if (message.messageType == 'getInstallTime') {
      chrome.storage.local.get('rexInstallTime')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          sendResponse(response.rexInstallTime ?? null)
        })

      return true
    }

    if (message.messageType == 'openWindow') {
      rexCorePlugin.openExtensionWindow()

      return true
    }

    if (message.messageType == 'logEvent') {
      // message.event = { name:string, ... }

      let loggedCount:number = 0

      for (const extensionModule of registeredExtensionModules) {
        if (extensionModule.logEvent !== undefined) {
          extensionModule.logEvent(message.event)

          loggedCount += 1
        }
      }

      sendResponse(loggedCount)

      return true
    }

    if (message.messageType == 'fetchValue') {
      if (rexDatabase !== null) {
        const index = rexDatabase.transaction(['values'], 'readonly')
          .objectStore('values')
          .index('key')

        const cursorRequest = index.openCursor(IDBKeyRange.only(message.key));

        cursorRequest.onsuccess = event => {
          if (event.target !== null) {
            const cursor = (event.target as any)['result']// eslint-disable-line @typescript-eslint/no-explicit-any

            if (cursor) {
              sendResponse(cursor.value.value)
            } else {
              sendResponse(null)
            }
          }
        }

        cursorRequest.onerror = event => {
          console.log(`[rex-core] Fetch error for ${message.key}...`)
          console.log(event)

          sendResponse(null)
        }

        return true
      }
    }

    if (message.messageType == 'storeValue') {
      if (rexDatabase !== null) {
        const doInsert = () => {
          const newValue = {
            key: message.key,
            value: message.value
          }

          if (rexDatabase !== null) {
            const objectStore = rexDatabase.transaction(['values'], 'readwrite').objectStore('values')

            const putRequest = objectStore.put(newValue, newValue.key)

            putRequest.onsuccess = function (putEvent) { // eslint-disable-line @typescript-eslint/no-unused-vars
              sendResponse(true)
            }

            putRequest.onerror = function (putEvent) {
              console.error(`[rex-core] Value NOT inserted successfully. ${newValue.key} = ${newValue.value}.`)
              console.error(putEvent)

              sendResponse(false)
            }
          }
        }

        const newValue = {
          value: message.value,
          key: message.key
        }

        const index = rexDatabase.transaction(['values'], 'readwrite')
          .objectStore('values')
          .index('key')

        const cursorRequest = index.openCursor(IDBKeyRange.only(message.key));

        cursorRequest.onsuccess = event => {
          if (event.target !== null) {
            const cursor = (event.target as any)['result']// eslint-disable-line @typescript-eslint/no-explicit-any

            if (cursor === null) {
              doInsert()
            } else {
              const updateRequest = cursor.update(newValue)

              updateRequest.onsuccess = function (updateEvent:any) { // eslint-disable-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
                sendResponse(true)
              }

              updateRequest.onerror = function (updateEvent:any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                console.error(`[rex-core] Value NOT updated successfully. ${message.key} = ${newValue.value}.`)
                console.error(updateEvent)

                sendResponse(false)
              }
            }
          }
        }

        cursorRequest.onerror = event => {
          console.log(`[rex-core] Error opening cursor:`)
          console.log(event)
          doInsert()
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

    if (handled === false) {
      console.log(`[rex-core] Received unknown message:`)
      console.log(message)
    }

    return handled
  },
  initializeConfiguration: (configuration:REXConfiguration): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.get('REXConfiguration')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const configResponse:REXConfigurationResponse = response as REXConfigurationResponse

          if ([null, undefined, ''].includes(configResponse.REXConfiguration as any) === false) { // eslint-disable-line @typescript-eslint/no-explicit-any
            resolve('Error: Configuration already initialized.')
          } else {
            chrome.storage.local.set({
              REXConfiguration: configuration
            }).then(() => {
              resolve('Success: Configuration initialized.')
            })
          }
        })
    })
  },
  updateConfiguration: (configuration:REXConfiguration): Promise<string> => {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        REXConfiguration: configuration
      }).then(() => {
        // Configuration can change mid-worker-life without the
        // refreshConfiguration message (e.g. a lifecycle engine applying a
        // phase config). Modules that read configuration once at startup must
        // be told to re-read, or the new configuration sits inert in storage
        // until the next worker restart.
        for (const extensionModule of registeredExtensionModules) {
          extensionModule.refreshConfiguration()
        }

        resolve('Success: Configuration updated.')
      })
    })
  },
  fetchConfiguration: ():Promise<REXConfiguration> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get('REXConfiguration')
        .then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const idResponse:REXConfigurationResponse = response as REXConfigurationResponse
          resolve(idResponse.REXConfiguration)
        }).catch(() => {
          reject()
        })
    })
  },
  generateHash: (cleartext:string, algorithm:string = 'SHA-256'): Promise<string> => {
    return hash(cleartext, algorithm)
  }
}

// rexCorePlugin.setup()

export default rexCorePlugin
