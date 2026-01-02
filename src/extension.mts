import $ from 'jquery'

export interface WebmunkUIDefinition {
  title:string,
  identifier:string,
  depends_on:string[]
}

export interface WebmunkConfiguration {
  ui:WebmunkUIDefinition[],
  configuration_url?:string,

  // Policy flags (defaults chosen in code for safety):
  // - require_remote_configuration: true (fail closed by default)
  // - allow_offline_identifier_setup: false
  // - offline_mode_uses: 'last_known_good'
  require_remote_configuration?:boolean,
  allow_offline_identifier_setup?:boolean,
  offline_mode_uses?:'last_known_good'|'current',

  // Allow modules/extensions to hang arbitrary data off configuration.
  [key: string]: unknown
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

  private configBool(configuration:WebmunkConfiguration, key:string, defaultValue:boolean): boolean {
    const value = configuration[key]
    return typeof value === 'boolean' ? value : defaultValue
  }

  async validateIdentifier(identifier:string) {
    return new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as WebmunkConfiguration

        console.log('configuration')
        console.log(configuration)

        const requireRemoteConfiguration = this.configBool(configuration, 'require_remote_configuration', true)
        const allowOfflineIdentifierSetup = this.configBool(configuration, 'allow_offline_identifier_setup', false)
        const offlineModeUses = (typeof configuration['offline_mode_uses'] === 'string' ? configuration['offline_mode_uses'] : 'last_known_good') as string

        const configUrlStr = typeof configuration['configuration_url'] === 'string' ? configuration['configuration_url'] : ''

        // If a study doesn't use remote configuration at all, don't block identifier setup.
        if (configUrlStr.length === 0) {
          if (requireRemoteConfiguration) {
            reject('CONFIG_URL_MISSING|Remote configuration is required but configuration_url is missing.')
          } else {
            resolve(identifier)
          }
          return
        }

        const configUrl:URL = new URL(configUrlStr.replaceAll('<IDENTIFIER>', identifier))

        fetch(configUrl)
          .then(async (fetchResponse: Response) => {
            if (fetchResponse.ok) {
              const jsonData:WebmunkConfiguration = await fetchResponse.json()
              console.log(`${configUrl}:`)
              console.log(jsonData)

              const updateResponse: string = await chrome.runtime.sendMessage({
                'messageType': 'updateConfiguration',
                'configuration': jsonData
              })

              if (updateResponse.toLowerCase().startsWith('error')) {
                reject(`Received error from service worker: ${updateResponse}`)
              } else {
                resolve(identifier)
              }

              return
            }

            // If the specific identifier isn't found, try falling back to "default".
            // This allows a backend to provide a generic config without blocking setup.
            if (fetchResponse.status === 404) {
              const fallbackUrl:URL = new URL(configUrlStr.replaceAll('<IDENTIFIER>', 'default'))
              const fallbackResponse: Response = await fetch(fallbackUrl)

              if (fallbackResponse.ok) {
                const jsonData:WebmunkConfiguration = await fallbackResponse.json()
                console.log(`${fallbackUrl}:`)
                console.log(jsonData)

                const updateResponse: string = await chrome.runtime.sendMessage({
                  'messageType': 'updateConfiguration',
                  'configuration': jsonData
                })

                if (updateResponse.toLowerCase().startsWith('error')) {
                  reject(`Received error from service worker: ${updateResponse}`)
                } else {
                  resolve(identifier)
                }

                return
              }

              reject(`CONFIG_HTTP_ERROR|${fallbackUrl.href}|${fallbackResponse.status}|${fallbackResponse.statusText}`)
              return
            }

            // Remote config fetch failed.
            // Default behavior (safer for research): fail closed unless explicitly configured otherwise.
            const canProceedOffline = allowOfflineIdentifierSetup || requireRemoteConfiguration === false

            if (canProceedOffline && offlineModeUses === 'last_known_good') {
              const lastKnownGood: WebmunkConfiguration | undefined = await chrome.runtime.sendMessage({
                'messageType': 'fetchLastKnownGoodConfiguration'
              })

              if (lastKnownGood !== undefined) {
                const updateResponse: string = await chrome.runtime.sendMessage({
                  'messageType': 'updateConfiguration',
                  'configuration': lastKnownGood
                })

                if (updateResponse.toLowerCase().startsWith('error')) {
                  reject(`Received error from service worker: ${updateResponse}`)
                } else {
                  resolve(identifier)
                }

                return
              }

              // No cached config exists yet. If remote config isn't required, continue with the current/bundled config.
              if (requireRemoteConfiguration === false) {
                resolve(identifier)
                return
              }
            }

            reject(`CONFIG_HTTP_ERROR|${configUrl.href}|${fetchResponse.status}|${fetchResponse.statusText}`)
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            // Same offline fallback behavior for network-level failures.
            const canProceedOffline = allowOfflineIdentifierSetup || requireRemoteConfiguration === false

            if (canProceedOffline && offlineModeUses === 'last_known_good') {
              chrome.runtime.sendMessage({
                'messageType': 'fetchLastKnownGoodConfiguration'
              }).then(async (lastKnownGood: WebmunkConfiguration | undefined) => {
                if (lastKnownGood !== undefined) {
                  const updateResponse: string = await chrome.runtime.sendMessage({
                    'messageType': 'updateConfiguration',
                    'configuration': lastKnownGood
                  })

                  if (updateResponse.toLowerCase().startsWith('error')) {
                    reject(`Received error from service worker: ${updateResponse}`)
                  } else {
                    resolve(identifier)
                  }
                } else if (requireRemoteConfiguration === false) {
                  resolve(identifier)
                } else {
                  reject(`CONFIG_FETCH_FAILED|${configUrl.href}|${message}`)
                }
              })

              return
            }

            reject(`CONFIG_FETCH_FAILED|${configUrl.href}|${message}`)
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
        const identifier = ($('input[type="text"]').val() as string | undefined)?.trim() ?? ''

        if (identifier.length === 0) {
          alert('Please enter an ID.')
          return
        }

        me.validateIdentifier(identifier)
          .then((finalIdentifier:string) => {
            webmunkCorePlugin.setIdentifier(finalIdentifier)
              .then(() => {
                webmunkCorePlugin.refreshInterface()
              })
          }, (rawMessage:unknown) => {
            let message = rawMessage instanceof Error ? rawMessage.message : String(rawMessage)

            if (message.startsWith('CONFIG_FETCH_FAILED|')) {
              const parts = message.split('|')
              const url = parts[1] ?? '(unknown url)'
              const err = parts.slice(2).join('|') || 'Unknown error'
              message = `Couldn't reach the configuration server (${url}). Please check your network/backend and try again.\n\nDetails: ${err}`
            } else if (message.startsWith('CONFIG_HTTP_ERROR|')) {
              const parts = message.split('|')
              const url = parts[1] ?? '(unknown url)'
              const status = parts[2] ?? 'unknown'
              const statusText = parts.slice(3).join('|') || ''
              message = `Configuration server returned an error (${status}${statusText ? ` ${statusText}` : ''}) for ${url}.\n\nPlease try again.`
            } else if (message.startsWith('CONFIG_URL_MISSING|')) {
              const parts = message.split('|')
              message = parts.slice(1).join('|') || 'Remote configuration is required but configuration_url is missing.'
            }

            alert(message)
          })
      })

      // Allow pressing Enter in the identifier input to submit.
      // (Matches the "Submit" button behavior and avoids requiring mouse interaction.)
      $('#inputIdentifier').off('keydown')
      $('#inputIdentifier').on('keydown', (e) => {
        // jQuery keydown event: prefer `which` for broad compatibility + TS friendliness.
        if ((e as { which?: number; key?: string }).which === 13 || (e as { which?: number; key?: string }).key === 'Enter') {
          e.preventDefault()
          $('#coreSaveIdentifier').trigger('click')
        }
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
