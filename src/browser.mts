export class WebmunkClientModule {
  instantiationTarget:string

  constructor() {
    if (new.target === WebmunkClientModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`TODO: Implement in ${this.instantiationTarget}...`)
  }

  toString():string {
    return 'WebmunkClientModule (overrride in subclasses)'
  }
}

export function registerWebmunkModule(webmunkModule:WebmunkClientModule) {
  webmunkModule.setup()
}
