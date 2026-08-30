import $ from 'jquery'

export class REXClientModule {
  instantiationTarget:string

  constructor() {
    if (new.target === REXClientModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`[REXClientModule] TODO: Implement in ${this.instantiationTarget}...`)
  }

  toString():string {
    return 'REXClientModule (overrride in subclasses)'
  }
}

export function registerREXModule(rexModule:REXClientModule) {
  rexModule.setup()
}

export function injectREXSelectors() {
  $.expr.pseudos.containsInsensitive = $.expr.createPseudo(function (query) {
    const key = `${query}`

    return function (elem) {
      const oGElement:any = (elem as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      if (oGElement.REX_CACHE === undefined) {
        oGElement.REX_CACHE = {}
      }

      if (oGElement.REX_CACHE[key] === undefined) {
        oGElement.REX_CACHE[key] = $(elem).text().toUpperCase().includes(query.toUpperCase())
      }

      return oGElement.REX_CACHE[key]
    }
  })

  $.expr.pseudos.containsInsensitiveAny = $.expr.createPseudo(function (queryItems) {
    queryItems = JSON.parse(queryItems)

    return function (elem) {
      for (const queryItem of queryItems) {
        const queryUpper = queryItem.toUpperCase()

        if ($(elem).text().toUpperCase().includes(queryUpper)) {
          return true
        }
      }

      return false
    }
  })

  $.expr.pseudos.imageAltTagContainsInsensitiveAny = $.expr.createPseudo(function (queryItems) {
    queryItems = JSON.parse(queryItems)

    return function (elem) {
      for (const queryItem of queryItems) {
        const queryUpper = queryItem.toUpperCase()

        const altText = $(elem).attr('alt')

        if (altText !== undefined && altText !== null) {
          if (altText.toUpperCase().includes(queryUpper)) {
            return true
          }
        }
      }

      return false
    }
  })

  $.expr.pseudos.withinPage = $.expr.createPseudo(function () {
    const width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth, document.documentElement.clientWidth)
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.documentElement.clientHeight)

    return function (elem) {
      const position = elem.getBoundingClientRect()

      if (position.x > width) {
        return false
      }

      if (position.y > height) {
        return false
      }

      if ((position.x + position.width) < 0) {
        return false
      }

      if ((position.y + position.height) < 0) {
        return false
      }

      return true
    }
  })

  $.expr.pseudos.cssIs = $.expr.createPseudo(function (definition) {
    const tokens = definition.split(':')

    const property = tokens[0].trim()
    const value = tokens[1].trim()

    return function (elem) {
      const actualValue = $(elem).css(property)

      return actualValue === value
    }
  })

  $.expr.pseudos.trimmedTextEquals = $.expr.createPseudo((pattern:string) => {
    return function(elem: Element) : boolean {
      if (elem !== null && pattern !== null) {
        const matches = $(elem).text().match(`^${pattern}$`)

        if (matches !== null) {
          return (matches.length > 0)
        }
      }

      return false
    }
  })
}