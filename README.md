# webmunk-core

Core module for Webmunk browser extensions providing base classes, module registration, and notification management.

## Exports

- **`./extension`** - Extension module base class and UI configuration
- **`./browser`** - Client-side module base class
- **`./service-worker`** - Service worker module base class and event logging
- **`./notification-manager`** - Notification management with WebSocket/HTTP communication

## Quick Start

```typescript
import { WebmunkExtensionModule, registerWebmunkModule } from '@bric/webmunk-core/extension'

class MyModule extends WebmunkExtensionModule {
  setup() {
    console.log('Module initialized')
  }
}

registerWebmunkModule(new MyModule())
```

## Features

- Notification system with backend integration
- Chrome storage persistence
- Activity logging with offline queuing
- Module registration and lifecycle management
- TypeScript support

## Build

```bash
npm run build
npm run lint
```
