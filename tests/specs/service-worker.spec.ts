// @ts-nocheck

import { test, expect } from './fixtures.js';

test('Service worker test: Set identifier', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      return new Promise<any>((testResolve) => {
        serviceWorker.evaluate(async () => {
          return new Promise<any>((testResolve) => {
            self.rexCorePlugin.handleMessage({
              'messageType': 'setIdentifier',
              'identifier': 'i-am-rex'
            }, this, (response:any) => {
              testResolve('i-am-rex')
            })
          })
        })
        .then((workerResponse) => {
          expect(workerResponse).toEqual('i-am-rex')

          resolve()
        })
      })
    }, 2500)
  })
})

test('Service worker test: Local configuration mode fetches the bundled config', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      serviceWorker.evaluate(async () => {
        return new Promise<any>((testResolve) => {
          // Point at the bundled config.json via the rex-config:// scheme. This
          // resolves to a chrome-extension:// URL and is fetched from the bundle
          // with no remote server involved.
          const localConfig = { configuration_url: 'rex-config:///config.json' }

          self.rexCorePlugin.updateConfiguration(localConfig)
            .then(() => {
              self.rexCorePlugin.handleMessage({
                'messageType': 'refreshConfiguration'
              }, this, (response:any) => {
                testResolve(response)
              })
            })
        })
      })
      .then((workerResponse) => {
        expect(workerResponse).toMatchObject({ identifier: 'rex-core-test' })

        resolve()
      })
    }, 2500)
  })
})

// A phase-transition style config change arrives via updateConfiguration (not
// the refreshConfiguration message), e.g. from rex-autorunner. Modules that
// read configuration once at worker startup must still be told to re-read, or
// the new configuration sits inert in storage until the next worker restart.
test('Service worker test: updateConfiguration notifies registered modules', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      serviceWorker.evaluate(async () => {
        return new Promise<any>((testResolve) => {
          const stubModule = {
            refreshed: false,
            setup() {},
            logEvent() {},
            moduleName() { return 'StubModule' },
            refreshConfiguration() { this.refreshed = true },
          }

          self.registerREXModule(stubModule)

          self.rexCorePlugin.updateConfiguration({ stub: { enabled: true } })
            .then(() => {
              testResolve(stubModule.refreshed)
            })
        })
      })
      .then((workerResponse) => {
        expect(workerResponse).toEqual(true)

        resolve()
      })
    }, 2500)
  })
})

test('Service worker test: Hash generation (default)', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      return new Promise<any>((testResolve) => {
        serviceWorker.evaluate(async () => {
          return new Promise<any>((testResolve) => {
            self.rexCorePlugin.generateHash('hello world')
            .then((hashString:string) => {
              testResolve(hashString)
            })
          })
        })
        .then((workerResponse) => {
          expect(workerResponse).toEqual('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')

          resolve()
        })
      })
    }, 1000)
  })
})

test('Service worker test: Hash generation (SHA-256)', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      return new Promise<any>((testResolve) => {
        serviceWorker.evaluate(async () => {
          return new Promise<any>((testResolve) => {
            self.rexCorePlugin.generateHash('hello world', 'SHA-256')
            .then((hashString:string) => {
              testResolve(hashString)
            })
          })
        })
        .then((workerResponse) => {
          expect(workerResponse).toEqual('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')

          resolve()
        })
      })
    }, 1000)
  })
})

test('Service worker test: Hash generation (SHA-512)', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      return new Promise<any>((testResolve) => {
        serviceWorker.evaluate(async () => {
          return new Promise<any>((testResolve) => {
            self.rexCorePlugin.generateHash('hello world', 'SHA-512')
            .then((hashString:string) => {
              testResolve(hashString)
            })
          })
        })
        .then((workerResponse) => {
          expect(workerResponse).toEqual('309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f')

          resolve()
        })
      })
    }, 1000)
  })
})

// Configuration scope: client-defined key/value pairs appended as query
// parameters to every remote configuration fetch. Lets a client scope config
// resolution (e.g. by study or cohort) without rex-core knowing the vocabulary.
test('Service worker test: configuration scope merges, deletes, and persists', async ({serviceWorker}) => {
  const scope = await serviceWorker.evaluate(async () => {
    await new Promise((ready) => self.setTimeout(ready, 1500))

    await new Promise((set) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'setConfigurationScope',
        'scope': { 'study': 'demo-study', 'cohort': 'a' }
      }, this, set)
    })

    // Merge a change and a deletion in one call.
    await new Promise((set) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'setConfigurationScope',
        'scope': { 'cohort': null, 'wave': '2' }
      }, this, set)
    })

    return new Promise((fetched) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'fetchConfigurationScope'
      }, this, fetched)
    })
  })

  expect(scope).toEqual({ 'study': 'demo-study', 'wave': '2' })
})

test('Service worker test: refreshConfiguration appends the scope to the fetch url', async ({serviceWorker}) => {
  const requestedUrl = await serviceWorker.evaluate(async () => {
    await new Promise((ready) => self.setTimeout(ready, 1500))

    await new Promise((set) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'setConfigurationScope',
        'scope': { 'study': 'demo study' }
      }, this, set)
    })

    await self.rexCorePlugin.updateConfiguration({
      configuration_url: 'https://config.example.test/app-config.json?identifier=<IDENTIFIER>'
    })

    // Spy on fetch: capture the URL refreshConfiguration requests without any
    // network. The response echoes a minimal valid configuration.
    const realFetch = self.fetch
    let captured = null
    self.fetch = (url) => {
      captured = `${url}`
      return Promise.resolve(new Response(JSON.stringify({ refreshed: true }), { status: 200 }))
    }

    await new Promise((refreshed) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'refreshConfiguration'
      }, this, refreshed)
    })

    self.fetch = realFetch

    return captured
  })

  // URLSearchParams encodes a space as '+', not '%20'. Both are valid; this
  // asserts the URL API's escaping rather than hand-rolled encodeURIComponent.
  expect(requestedUrl).toContain('study=demo+study')
})

test('Service worker test: a scope key already present in the url is not overridden', async ({serviceWorker}) => {
  const requestedUrl = await serviceWorker.evaluate(async () => {
    await new Promise((ready) => self.setTimeout(ready, 1500))

    await new Promise((set) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'setConfigurationScope',
        'scope': { 'study': 'scope-study' }
      }, this, set)
    })

    await self.rexCorePlugin.updateConfiguration({
      configuration_url: 'https://config.example.test/app-config.json?study=url-study&identifier=<IDENTIFIER>'
    })

    const realFetch = self.fetch
    let captured = null
    self.fetch = (url) => {
      captured = `${url}`
      return Promise.resolve(new Response(JSON.stringify({ refreshed: true }), { status: 200 }))
    }

    await new Promise((refreshed) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'refreshConfiguration'
      }, this, refreshed)
    })

    self.fetch = realFetch

    return captured
  })

  expect(requestedUrl).toContain('study=url-study')
  expect(requestedUrl).not.toContain('scope-study')
})

// A configuration_url may be a bare relative path rather than an absolute URL
// (the bundled test config uses 'config.json'). Scoping resolves it against the
// extension and leaves it unscoped, rather than failing to parse it as a URL.
test('Service worker test: a relative configuration url stays extension-local and unscoped', async ({serviceWorker}) => {
  const requestedUrl = await serviceWorker.evaluate(async () => {
    await new Promise((ready) => self.setTimeout(ready, 1500))

    await new Promise((set) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'setConfigurationScope',
        'scope': { 'study': 'demo-study' }
      }, this, set)
    })

    await self.rexCorePlugin.updateConfiguration({
      configuration_url: 'config.json'
    })

    const realFetch = self.fetch
    let captured = null
    self.fetch = (url) => {
      captured = `${url}`
      return Promise.resolve(new Response(JSON.stringify({ refreshed: true }), { status: 200 }))
    }

    await new Promise((refreshed) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'refreshConfiguration'
      }, this, refreshed)
    })

    self.fetch = realFetch

    return captured
  })

  expect(requestedUrl).toContain('chrome-extension://')
  expect(requestedUrl).toContain('config.json')
  expect(requestedUrl).not.toContain('study=')
})

// Storing a key that already exists takes the cursor update path instead of the
// insert path. The replacement record has to carry the key alongside the value,
// or it drops out of the 'key' index and every later fetchValue for that key
// resolves null -- the stored value becomes unreachable after its first update.
test('Service worker test: an updated value stays fetchable by its key', async ({serviceWorker}) => {
  const storedValue = await serviceWorker.evaluate(async () => {
    await new Promise((ready) => self.setTimeout(ready, 1500))

    const storeValue = (key, value) => {
      return new Promise((stored) => {
        self.rexCorePlugin.handleMessage({
          'messageType': 'storeValue',
          'key': key,
          'value': value
        }, this, stored)
      })
    }

    await storeValue('rex-update-test', 'first')
    await storeValue('rex-update-test', 'second')

    return new Promise((fetched) => {
      self.rexCorePlugin.handleMessage({
        'messageType': 'fetchValue',
        'key': 'rex-update-test'
      }, this, fetched)
    })
  })

  expect(storedValue).toEqual('second')
})
