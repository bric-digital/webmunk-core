import $ from 'jquery'

import { type REXConfiguration, type REXUIDefinition, scopeConfigurationUrl } from "./common.mjs"

export class REXExtensionModule {
  instantiationTarget:string

  constructor() {
    if (new.target === REXExtensionModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`[REXExtensionModule] TODO: Implement in ${this.instantiationTarget}...`)
  }

  async checkRequirement(requirement:string) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return new Promise<boolean>((resolve) => {
      resolve(false)
    })
  }

  activateInterface(uiDefinition:REXUIDefinition):boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
    return false
  }

  fetchHtmlInterface(identifier:string):string|null { // eslint-disable-line @typescript-eslint/no-unused-vars
    return null
  }

  name():string {
    return 'REXExtensionModule'
  }
}

const registeredExtensionModules:REXExtensionModule[] = []

export function registerREXModule(rexModule:REXExtensionModule) {
  if (!registeredExtensionModules.includes(rexModule)) {
    registeredExtensionModules.push(rexModule)

    rexModule.setup()
  }
}

export const rexCorePlugin = {
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

      fetch(configUrl, { signal: AbortSignal.timeout(120000) })
        .then((response: Response) => {
          if (response.ok) {
            response.json().then((jsonData:REXConfiguration) => {
              chrome.runtime.sendMessage({
                'messageType': 'loadInitialConfiguration',
                'configuration': jsonData
              }).then((response: string) => {
                if (response.toLowerCase().startsWith('error')) {
                  reject(`Received error from service worker: ${response}`)
                } else {
                  resolve(response)
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
  },
  validateInterface: async function (uiDefinition:REXUIDefinition) {
    return new Promise<void>((resolve, reject) => {
      const requirements:string[] = []

      if (uiDefinition['depends_on'] !== undefined) {
        requirements.push(...uiDefinition['depends_on'])
      }

      requirements.reverse()

      const unfulfulledRequirements = [...requirements]

      const checkRequirement = () => {
        if (requirements.length == 0) {
          if (unfulfulledRequirements.length > 0) {
            reject(`Unfulfilled requirements: ${unfulfulledRequirements}...`)
          } else {
            resolve()
          }
        } else {
          const requirement:string|undefined = requirements.pop()

          if (requirement !== undefined) {
            const pendingModules:REXExtensionModule[] = []
            pendingModules.push(...registeredExtensionModules)

            const checkModule = () => {
              if (pendingModules.length == 0) {
                if (unfulfulledRequirements.length == 0) {
                  resolve()
                } else {
                  reject(`Unfulfilled requirements: ${unfulfulledRequirements}...`)
                }
              } else {
                const nextModule:REXExtensionModule|undefined = pendingModules.pop()

                if (nextModule !== undefined) {
                  nextModule.checkRequirement(requirement)
                    .then((isFulfilled) => {
                      if (isFulfilled) {
                        while (unfulfulledRequirements.includes(requirement)) {
                          const index = unfulfulledRequirements.indexOf(requirement);

                          unfulfulledRequirements.splice(index, 1)
                        }

                        checkRequirement()
                      } else {
                        checkModule()
                      }
                    })
                } else {
                  checkModule()
                }
              }
            }

            checkModule()
          } else {
            checkRequirement()
          }
        }
      }

      checkRequirement()
    })
  },
  fetchCurrentInterface: async function() {
    return new Promise<REXUIDefinition>((resolve, reject) => {
      chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as REXConfiguration

        if (Array.isArray(configuration.ui)) {
          const pendingInterfaces:REXUIDefinition[] = [...configuration.ui]
          pendingInterfaces.reverse()

          const checkNextInterface = () => {
            if (pendingInterfaces.length == 0) {
              // Checked all interfaces - none are valid. Rejecting...
              reject('No valid interfaces are currently available.')
            } else {
              const nextInterface:REXUIDefinition|undefined = pendingInterfaces.pop()

              if (nextInterface !== undefined) {
                rexCorePlugin.validateInterface(nextInterface)
                  .then(() => {
                    resolve(nextInterface)
                  }, (reason:string) => {
                    console.log(`[rex-core] Unable to validate UI ${nextInterface.identifier}: ${reason}`)

                    checkNextInterface()
                  })
              } else {
                checkNextInterface()
              }
            }
          }

          checkNextInterface()
        } else {
          reject('[rex-core] Configuration UI element should be an array. Is ${typeof configuration.ui}.')
        }
      })
    })
  },
  refreshInterface: () => {
    rexCorePlugin.fetchCurrentInterface()
      .then((response:REXUIDefinition) => {
        const uiDefinition = response as REXUIDefinition

        console.log(`[rex-core] Load interface: ${uiDefinition.identifier}`)

        if (rexCorePlugin.interface.identifier !== uiDefinition.identifier) {
          rexCorePlugin.interface = uiDefinition

          rexCorePlugin.loadInterface(rexCorePlugin.interface)
        }
      }, (reason:string) => {
        console.log(`[rex-core] RefreshInterface failed: ${reason}`)
      })
  },
  loadInterface: (uiDefinition:REXUIDefinition) => {
    document.title = uiDefinition.title

    const contentElement:HTMLElement | null = document.getElementById('rex-content')

    if (uiDefinition['load_dynamic']) {
      let htmlText:string|null = null

      for (const extensionModule of registeredExtensionModules) {
        const content = extensionModule.fetchHtmlInterface(uiDefinition.identifier)

        if (content !== null) {
          htmlText = content
        }
      }

      if (htmlText !== null) {
        if (contentElement !== null) {
          contentElement.innerHTML = htmlText
        }

        let activated = false

        for (const extensionModule of registeredExtensionModules) {
          if (extensionModule.activateInterface !== undefined) {
            if (extensionModule.activateInterface(uiDefinition)) {
              activated = true
            }
          }
        }

        if (activated === false && contentElement !== null) {
          contentElement.innerHTML = `Unable to find module to activate ${uiDefinition.identifier}...`
        }
      }
    } else {
      const templateUrl = chrome.runtime.getURL(`interfaces/${uiDefinition.identifier}.html`)

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
    }
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
  showError: (title:string, message:string) => {
    // TODO: Replace with something more robust.
    alert(`${title}\n\n${message}`)
  }, fetchREXModule: (identifier:string): REXExtensionModule|null => {
    for (const rexModule of registeredExtensionModules) {
      if (identifier === rexModule.name()) {
        return rexModule
      }
    }

    return null
  }
}

export class REXCoreIdentifierExtensionModule extends REXExtensionModule {
  setup() {
    // None needed for default pass-through
  }

  validateIdentifierFormat(identifier:string):boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
    return true
  }

  name():string {
    return 'REXCoreIdentifierExtensionModule'
  }

  async validateIdentifier(identifier:string, endpoint:string|null = null) {
    return new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as REXConfiguration

        if (['', undefined, null].includes(configuration as any)) { // eslint-disable-line @typescript-eslint/no-explicit-any
          reject('Configuration not available. Please try again.')

          return
        }

        if (endpoint === null) {
          endpoint = configuration['configuration_url'] as string
        }

        const resolvedEndpoint = endpoint.replaceAll('<IDENTIFIER>', encodeURIComponent(identifier))

        // Scope is advisory here: an unscoped fetch is far better than a hung
        // one, so a failed scope lookup falls back to the empty scope rather
        // than rejecting the whole validation.
        chrome.runtime.sendMessage({ 'messageType': 'fetchConfigurationScope' })
          .then((scopeResponse:{ [key: string]: string }|null) => scopeResponse ?? {})
          .catch(() => ({}))
          .then((configurationScope:{ [key: string]: string }) => {
            const configUrl:URL = scopeConfigurationUrl(resolvedEndpoint, configurationScope, chrome.runtime.getURL('/'))

            fetch(configUrl)
              .then((response: Response) => {
                if (response.ok) {
                  response.json()
                    .then((jsonData:REXConfiguration) => {
                      chrome.runtime.sendMessage({
                        'messageType': 'updateConfiguration',
                        'configuration': jsonData
                      }).then((response: string) => {
                        if (response === null || response === undefined || response.toLowerCase().startsWith('error')) {
                          reject(`Received error from service worker: ${response}`)
                        } else {
                          resolve(identifier)
                        }
                      })
                    })
                    .catch((error) => {
                      reject(`Received non-JSON response: ${error}`)
                    })
                } else {
                  reject(`Received error status: ${response.statusText}`)
                }
              }, (reason:string) => {
                reject(`Error fetching configuration from ${configUrl}:${reason}`)
              })
          })
      })
    })
  }

  activateInterface(uiDefinition:REXUIDefinition):boolean {
    if (uiDefinition.identifier == 'identifier') {
      $('#coreSaveIdentifier').off('click')
      $('#coreSaveIdentifier').on('click', () => {
        const identifier = ($('input[type="text"]').val() as string).trim()

        if (this.validateIdentifierFormat(identifier) === false) {
          alert('Invalid identifier.\n\nPlease check your assigned ID and reenter.')

          return
        }

        this.validateIdentifier(identifier)
          .then((finalIdentifier:string) => {
            rexCorePlugin.setIdentifier(finalIdentifier)
              .then(() => {
                rexCorePlugin.refreshInterface()
              })
          }, (message:string) => {
            alert(message)
          })
      })

      chrome.runtime.sendMessage({
        'messageType': 'getIdentifier'
      }).then((identifier:string) => {
        $('input[type="text"]').val(identifier)
      })

      return true
    }

    return false
  }

  async checkRequirement(requirement:string) {
    return new Promise<boolean>((resolve) => {
      if (requirement === 'has_identifier') {
        chrome.runtime.sendMessage({ 'messageType': 'getIdentifier' })
          .then((identifier) => {
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

registerREXModule(new REXCoreIdentifierExtensionModule())
