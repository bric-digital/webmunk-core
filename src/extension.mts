import $ from 'jquery'

export interface WebmunkUIDefinition {
  title:string,
  identifier:string,
  depends_on:string[]
  load_dynamic?:boolean
}

export interface WebmunkConfiguration {
  ui:WebmunkUIDefinition[],
  configuration_url:string
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

  fetchHtmlInterface(identifier:string):string|null {
    return null
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
            response.json().then((jsonData:WebmunkConfiguration) => {
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

    const contentElement:HTMLElement | null = document.getElementById('webmunk-content')

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
  }
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
        const identifier = $('input[type="text"]').val()

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
