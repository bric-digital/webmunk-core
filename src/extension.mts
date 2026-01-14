import $ from 'jquery'

export interface WebmunkUIDefinition {
  title:string,
  identifier:string,
  depends_on:string[]
}

export interface WebmunkMessage {
  message: string,
  url: string,
  notify: boolean
}

export interface WebmunkConfiguration {
  ui:WebmunkUIDefinition[],
  configuration_url:string,
  redirect_on_install?:{
    enabled:boolean,
    url:string
  }
}

export class WebmunkExtensionModule {
  instantiationTarget:string

  constructor() {
    if (new.target === WebmunkExtensionModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`TODO: Implement in ${this.instantiationTarget}...`)
  }

  async checkRequirement(requirement:string) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return new Promise<boolean>((resolve) => {
      resolve(false)
    })
  }

  activateInterface(uiDefinition:WebmunkUIDefinition):boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
    return false
  }
}

const registeredExtensionModules:WebmunkExtensionModule[] = []

export function registerWebmunkModule(webmunkModule:WebmunkExtensionModule) {
  if (!registeredExtensionModules.includes(webmunkModule)) {
    registeredExtensionModules.push(webmunkModule)

    webmunkModule.setup()
  }
}

export const webmunkCorePlugin = {
  interface: {
    identifier: '',
    title: '',
    depends_on: ['']
  },
  loadInitialConfigation: async function(configPath:string) {
    return new Promise<string>((resolve, reject) => {
      let configUrl = configPath

      if (!configPath.toLowerCase().startsWith('http:') && !configPath.toLowerCase().startsWith('https://')) {
        configUrl = chrome.runtime.getURL(configPath)
      }

      fetch(configUrl)
        .then((response: Response) => {
          if (response.ok) {
            response.json().then((staticConfig:WebmunkConfiguration) => {
              // Static config loaded - now fetch dynamic config from Django
              const configurationUrl = staticConfig.configuration_url as string
              
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (chrome.runtime.sendMessage as any)(
                { messageType: 'getIdentifier' },
                (identifierResponse: { identifier?: string } | undefined) => {
                  const identifier = identifierResponse?.identifier || 'unknown-id'
                  const dynamicConfigUrl = configurationUrl.replace('<IDENTIFIER>', identifier)
                  
                  console.log(`[Webmunk] Fetching dynamic config from: ${dynamicConfigUrl}`)
                  
                  fetch(dynamicConfigUrl)
                    .then((dynamicResponse: Response) => {
                    if (dynamicResponse.ok) {
                      dynamicResponse.json().then((dynamicConfig: WebmunkConfiguration & { messages?: WebmunkMessage[] }) => {
                        // Merge static UI config with dynamic messages
                        const mergedConfig: WebmunkConfiguration = {
                          ...staticConfig,
                          ...dynamicConfig,
                          ui: staticConfig.ui // Ensure UI from static config
                        }
                        
                        // Extract messages separately for routing
                        const messages = dynamicConfig.messages || []
                        
                        // Extract refresh interval (use dynamic if available, else static)
                        const refreshInterval = dynamicConfig.messageRefreshIntervalMinutes || staticConfig.messageRefreshIntervalMinutes || 5
                        
                        // Send to service worker with both config and messages
                        chrome.runtime.sendMessage({
                          'messageType': 'loadInitialConfiguration',
                          'configuration': mergedConfig,
                          'messages': messages,
                          'messageRefreshIntervalMinutes': refreshInterval
                        }).then((swResponse: string) => {
                          if (swResponse.toLowerCase().startsWith('error')) {
                            reject(`Received error from service worker: ${swResponse}`)
                          } else {
                            resolve(swResponse)
                          }
                        }).catch((error) => {
                          console.error('[Webmunk] Error sending config to service worker:', error)
                          reject(`Failed to send config to service worker: ${error}`)
                        })
                      })
                    } else {
                      console.warn(`[Webmunk] Failed to fetch dynamic config, using static only: ${dynamicResponse.statusText}`)
                      // Fall back to static config if dynamic fails
                      const refreshInterval = staticConfig.messageRefreshIntervalMinutes || 5
                      chrome.runtime.sendMessage({
                        'messageType': 'loadInitialConfiguration',
                        'configuration': staticConfig,
                        'messages': [],
                        'messageRefreshIntervalMinutes': refreshInterval
                      }).then((swResponse: string) => {
                        if (swResponse.toLowerCase().startsWith('error')) {
                          reject(`Received error from service worker: ${swResponse}`)
                        } else {
                          resolve(swResponse)
                        }
                      })
                    }
                  })
                  .catch((dynamicError) => {
                    console.warn(`[Webmunk] Error fetching dynamic config: ${dynamicError}, using static only`)
                    // Fall back to static config if fetch fails
                    const refreshInterval = staticConfig.messageRefreshIntervalMinutes || 5
                    chrome.runtime.sendMessage({
                      'messageType': 'loadInitialConfiguration',
                      'configuration': staticConfig,
                      'messages': [],
                      'messageRefreshIntervalMinutes': refreshInterval
                    }).then((swResponse: string) => {
                      if (swResponse.toLowerCase().startsWith('error')) {
                        reject(`Received error from service worker: ${swResponse}`)
                      } else {
                        resolve(swResponse)
                      }
                    })
                  })
              })
            })
          } else {
            reject(`Received error status: ${response.statusText}`)
          }
        }, (reason:string) => {
          reject(`${reason}`)
        })
      })
  },
  validateInterface: async function (uiDefinition:WebmunkUIDefinition) {
    return new Promise<void>((resolve, reject) => {
      const requirements:string[] = []

      if (uiDefinition['depends_on'] !== undefined) {
        requirements.push(...uiDefinition['depends_on'])
      }

      console.log('requirements')
      console.log(requirements)

      for (const requirement of requirements) {
        for (const extensionModule of registeredExtensionModules) {
          if (extensionModule.checkRequirement !== undefined) {
            extensionModule.checkRequirement(requirement)
              .then((isFulfilled) => {
                while (isFulfilled && requirements.includes(requirement)) {
                  const index = requirements.indexOf(requirement);

                  requirements.splice(index, 1)
                }
              })
          }
        }
      }

      window.setTimeout(function() {
        if (requirements.length == 0) {
          resolve()
        } else {
          reject(`Unfulfilled requirements: ${requirements}...`)
     }
      }, 500)
    })
  },
  fetchCurrentInterface: async function() {
    return new Promise<object>((resolve) => {
      chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as WebmunkConfiguration

        console.log('configuration')
        console.log(configuration)

        for (const uiDefinition of configuration.ui) {
          webmunkCorePlugin.validateInterface(uiDefinition)
            .then(() => {
              resolve(uiDefinition)
            }, (reason:string) => {
              console.log(`Interface "${uiDefinition.identifier} invalid: ${reason}`)
            })
        }
      })
    })
  },
  refreshInterface: () => {
    webmunkCorePlugin.fetchCurrentInterface()
      .then((response:object) => {
        const uiDefinition = response as WebmunkUIDefinition

        if (webmunkCorePlugin.interface.identifier !== uiDefinition.identifier) {
          webmunkCorePlugin.interface = uiDefinition

          webmunkCorePlugin.loadInterface(webmunkCorePlugin.interface)
        }
      })
  },
  loadInterface: (uiDefinition:WebmunkUIDefinition) => {
    document.title = uiDefinition.title

    const templateUrl = chrome.runtime.getURL(`interfaces/${uiDefinition.identifier}.html`)

    const contentElement:HTMLElement | null = document.getElementById('webmunk-content')

    fetch(templateUrl)
      .then((response: Response) => {
        if (response.ok) {
          response.text().then((htmlText:string) => {
            let activated = false

            if (contentElement !== null) {
              contentElement.innerHTML = htmlText
            }

            for (const extensionModule of registeredExtensionModules) {
              if (extensionModule.activateInterface !== undefined) {
                if (extensionModule.activateInterface(uiDefinition)) {
                  activated = true
                }
              }
            }

            if (activated === false && contentElement !== null) {
              contentElement.innerHTML = `Unable to find module to activate ${templateUrl}...`
            }
          })
        } else {
          if (contentElement !== null) {
            contentElement.innerHTML = `Error loading template file at ${templateUrl}...`
          }
        }
      }, (reason:string) => {
        if (contentElement !== null) {
          contentElement.innerHTML = `Error loading template file at ${templateUrl}: ${reason}...`
        }
      })
  },
  setIdentifier: async (identifier:string) => {
    return new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        'messageType': 'setIdentifier',
        'identifier': identifier
      }).then(() => {
        resolve()
      })
    })
  },
}

class WebmunkCoreIdentifierExtensionModule extends WebmunkExtensionModule {
  setup() {
    // None needed for default pass-through
  }

  async validateIdentifier(identifier:string) {
    return new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as WebmunkConfiguration

        console.log('configuration')
        console.log(configuration)

        const configUrlStr = configuration['configuration_url'] as string

        const configUrl:URL = new URL(configUrlStr.replaceAll('<IDENTIFIER>', identifier))

        fetch(configUrl)
          .then((response: Response) => {
            if (response.ok) {
              response.json().then((jsonData:WebmunkConfiguration) => {
                console.log(`${configUrl}:`)
                console.log(jsonData)
                chrome.runtime.sendMessage({
                  'messageType': 'updateConfiguration',
                  'configuration': jsonData
                }).then((response: string) => {
                  if (response.toLowerCase().startsWith('error')) {
                    reject(`Received error from service worker: ${response}`)
                  } else {
                    resolve(identifier)
                  }
                })
              })
          } else {
            reject(`Received error status: ${response.statusText}`)
          }
        }, (reason:string) => {
          reject(`${reason}`)
        })
      })
    })
  }

  activateInterface(uiDefinition:WebmunkUIDefinition):boolean {
    console.log('activateInterface')
    console.log(uiDefinition)

    const me = this  // eslint-disable-line @typescript-eslint/no-this-alias

    if (uiDefinition.identifier == 'identifier') {
      $('#coreSaveIdentifier').off('click')
      $('#coreSaveIdentifier').on('click', () => {
        const identifier = $('#inputIdentifier').val()

        me.validateIdentifier(identifier as string)
          .then((finalIdentifier:string) => {
            webmunkCorePlugin.setIdentifier(finalIdentifier)
              .then(() => {
                webmunkCorePlugin.refreshInterface()
              })
          }, (message:string) => {
            alert(message)
          })
      })

      // Allow Enter key to submit identifier without clicking button
      $('#inputIdentifier').off('keydown')
      $('#inputIdentifier').on('keydown', (e) => {
        // jQuery wraps the native keyboard event in `originalEvent`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const key = (e as any).originalEvent?.key ?? (e as any).key
        if (key === 'Enter') {
          e.preventDefault()
          $('#coreSaveIdentifier').trigger('click')
        }
      })

      chrome.runtime.sendMessage({
        'messageType': 'getIdentifier'
      }).then((identifier:string) => {
        $('#inputIdentifier').val(identifier)
      })

      return true
    }

    return false
  }

  async checkRequirement(requirement:string) {
    return new Promise<boolean>((resolve) => {
      console.log(`WebmunkCoreIdentifierExtensionModule.checkRequirement: ${requirement}`)

      if (requirement === 'has_identifier') {
        chrome.runtime.sendMessage({ 'messageType': 'getIdentifier' })
          .then((identifier) => {
            console.log(`identifier: ${identifier}`)
            if ([null, undefined].includes(identifier) || identifier.length == 0) {
              resolve(false)
            } else {
              resolve(true)
            }
          })
      } else {
        resolve(false)
      }
    })
  }
}

registerWebmunkModule(new WebmunkCoreIdentifierExtensionModule())
