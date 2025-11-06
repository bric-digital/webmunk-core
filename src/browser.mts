export class WebmunkClientModule {
  instantiationTarget:String

  constructor() {
    if (new.target === WebmunkClientModule) {
      throw new Error('Cannot be instantiated')
    }

    this.instantiationTarget = new.target.toString()
  }

  setup() {
    console.log(`TODO: Implement in ${this.instantiationTarget}...`)
  }
}

export function registerWebmunkModule(webmunkModule:WebmunkClientModule) {
  console.log(`Registering ${webmunkModule}...`)

  webmunkModule.setup()
}
