# Webmunk List Utilities Test Suite

Comprehensive automated and manual tests for the webmunk-core list utilities module.

## Table of Contents

- [Quick Start](#quick-start)
- [Directory Structure](#directory-structure)
- [Available Scripts](#available-scripts)
- [Test Coverage](#test-coverage)
- [Running Tests](#running-tests)
- [Manual Testing](#manual-testing)
- [Implementation Details](#implementation-details)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)

---

## Quick Start

Get the automated tests running in under 5 minutes.

### Prerequisites

- Node.js 18+ installed
- Python 3 installed (for local web server)

### Step-by-Step

#### 1. Navigate to Tests Directory

```bash
cd webmunk-core/tests
```

#### 2. Install Dependencies

```bash
npm install
```

This installs:
- Playwright (browser automation)
- esbuild (bundler)

#### 3. Install Browser

```bash
npx playwright install chromium
```

Only needed once. Downloads Chromium browser for testing.

#### 4. Build Test Bundle

```bash
npm run build-test-bundle
```

This bundles `webmunk-core/src/list-utilities.mts` and dependencies (psl) into a single browser-compatible file.

#### 5. Run Tests

```bash
npm test
```

This will:
1. Start a local web server (Python http.server on port 8080)
2. Open Chromium in headless mode
3. Run 60+ tests across 8 test suites
4. Display results in the terminal
5. Generate an HTML report if any tests fail

### Expected Output

```
Running 25 tests using 1 worker

  ✓ List Utilities - Database Initialization (2)
  ✓ List Utilities - CRUD Operations (5)
  ✓ List Utilities - Query Operations (4)
  ✓ List Utilities - Pattern Matching (4)
  ✓ List Utilities - Bulk Operations (4)
  ✓ List Utilities - Error Handling (4)
  ✓ List Utilities - Performance (2)

  25 passed (5s)
```

---

## Directory Structure

```
tests/
├── specs/                          # Playwright test specs
│   └── list-utilities.spec.js     # Main test suite
├── build-test-bundle.js            # esbuild bundler script
├── playwright.config.js            # Playwright configuration
├── test-page.html                  # Test HTML page for Playwright
├── list-utilities-test.html        # Manual testing HTML page
├── test-extension-manifest.json    # Test extension manifest
├── package.json                    # Test dependencies and scripts
├── .gitignore                      # Test directory ignore patterns
└── README.md                       # This file
```

---

## Available Scripts

- `npm test` - Run all tests in headless mode
- `npm run test:headed` - Run tests with browser visible
- `npm run test:ui` - Open Playwright UI mode for interactive testing
- `npm run test:debug` - Run tests in debug mode
- `npm run build-test-bundle` - Bundle list-utilities for browser testing

---

## Test Coverage

The Playwright test suite covers:

✅ **Database Initialization** (2 tests)
- IndexedDB creation
- Object store and indexes

✅ **CRUD Operations** (5 tests)
- Create, read, update, delete entries
- Bulk delete operations

✅ **Query Operations** (4 tests)
- Find specific entries
- Match domains against lists
- Get all list names

✅ **Pattern Matching** (4 tests)
- Domain patterns
- Subdomain wildcards (*.google.com)
- Exact URL matching
- Regex patterns
- Complex TLDs (co.uk, com.au)

✅ **Bulk Operations** (4 tests)
- Bulk create
- Export to JSON
- Import from JSON
- Replace on import

✅ **Error Handling** (4 tests)
- Duplicate entry rejection
- Invalid regex handling
- Invalid URL handling
- Non-existent entry updates

✅ **Performance** (2 tests)
- 100 entry bulk create
- Efficient retrieval

---

## Running Tests

### Headless Mode (Default)

```bash
npm test
```

Tests run in the background without opening a browser window.

### Headed Mode (Watch Tests Execute)

```bash
npm run test:headed
```

Watch the tests execute in real-time in a visible browser.

### Interactive UI Mode

```bash
npm run test:ui
```

Opens Playwright's UI for:
- Running individual tests
- Debugging test failures
- Viewing test traces
- Time-travel debugging

### Debug Mode

```bash
npm run test:debug
```

Pauses at each test for step-by-step debugging.

---

## Manual Testing

If you prefer manual testing or need to debug specific issues, here are alternative approaches.

### Approach 1: Browser Console Testing (Quickest)

1. Open Chrome DevTools Console (F12)
2. Load the test HTML file: `file:///path/to/webmunk-core/tests/list-utilities-test.html`
3. Run manual tests in the console

**Note:** Due to ES module imports, you may need to serve the files via a local web server or build a test extension.

### Approach 2: Test Extension (Recommended for Manual Testing)

Build a minimal test extension that can import the list-utilities module:

1. Navigate to the webmunk-core directory
2. Run `npm install` to install dependencies (including psl)
3. Run `npm run build` to compile TypeScript
4. Load the test extension from `webmunk-core/tests` directory in Chrome

The test extension files provided:
- `test-extension-manifest.json` - Extension manifest
- `list-utilities-test.html` - Test UI

### Approach 3: Integration Testing in Extensions

The most realistic test is to integrate the list utilities into an extension and test there:

1. Update the extension to import list utilities
2. Build the extension
3. Load in Chrome and test real-world usage

### Manual Test Script

Here's a comprehensive manual test you can run in the browser console:

```javascript
// Import the list utilities (if in a module context)
// import * as listUtils from '../src/list-utilities.mts'

// Test 1: Initialize Database
const db = await listUtils.initializeListDatabase();
console.log('✅ Database initialized:', db.name);

// Test 2: Create Entry
const entryId = await listUtils.createListEntry({
  list_name: 'test-blocked-sites',
  domain: 'example.com',
  pattern_type: 'domain',
  metadata: {
    category: 'test',
    description: 'Test domain'
  }
});
console.log('✅ Created entry with ID:', entryId);

// Test 3: Get All Entries
const entries = await listUtils.getListEntries('test-blocked-sites');
console.log('✅ Retrieved entries:', entries);

// Test 4: Find Specific Entry
const found = await listUtils.findListEntry('test-blocked-sites', 'example.com');
console.log('✅ Found entry:', found);

// Test 5: Match Domain Against List
const match = await listUtils.matchDomainAgainstList('https://example.com/page', 'test-blocked-sites');
console.log('✅ Match result:', match);

// Test 6: Pattern Matching Tests
const tests = [
  { url: 'https://www.google.com/search', pattern: 'google.com', type: 'domain' },
  { url: 'https://mail.google.com', pattern: '*.google.com', type: 'subdomain_wildcard' },
  { url: 'https://example.com/test', pattern: 'https://example.com/test', type: 'exact_url' },
  { url: 'https://test.example.com', pattern: '.*\\.example\\.com', type: 'regex' }
];

for (const test of tests) {
  const result = listUtils.matchesPattern(test.url, test.pattern, test.type);
  console.log(`${result ? '✅' : '❌'} ${test.url} vs ${test.pattern} (${test.type})`);
}

// Test 7: Update Entry
await listUtils.updateListEntry(entryId, {
  metadata: { category: 'updated', description: 'Updated test domain' }
});
console.log('✅ Entry updated');

// Test 8: Bulk Create
const bulkIds = await listUtils.bulkCreateListEntries([
  {
    list_name: 'test-blocked-sites',
    domain: 'facebook.com',
    pattern_type: 'domain',
    metadata: { category: 'social-media' }
  },
  {
    list_name: 'test-blocked-sites',
    domain: 'twitter.com',
    pattern_type: 'domain',
    metadata: { category: 'social-media' }
  }
]);
console.log('✅ Bulk created entries:', bulkIds);

// Test 9: Export List
const exported = await listUtils.exportList('test-blocked-sites');
console.log('✅ Exported data:', JSON.parse(exported));

// Test 10: Get All Lists
const allLists = await listUtils.getAllLists();
console.log('✅ All lists:', allLists);

// Test 11: Delete Entry
await listUtils.deleteListEntry(entryId);
console.log('✅ Entry deleted');

// Test 12: Delete All Entries in List
await listUtils.deleteAllEntriesInList('test-blocked-sites');
console.log('✅ All entries deleted from list');

// Test 13: Import List
const importData = {
  list_name: 'imported-list',
  version: 1,
  entries: [
    { domain: 'imported1.com', pattern_type: 'domain', metadata: {} },
    { domain: 'imported2.com', pattern_type: 'domain', metadata: {} }
  ]
};
const importCount = await listUtils.importList('imported-list', JSON.stringify(importData));
console.log('✅ Imported entries:', importCount);
```

### Expected Test Results

All tests should pass with the following outcomes:

1. **Database Init**: Returns IDBDatabase object
2. **Create Entry**: Returns numeric ID (> 0)
3. **Get Entries**: Returns array of ListEntry objects
4. **Find Entry**: Returns matching ListEntry or null
5. **Match Domain**: Returns matching entry or null
6. **Pattern Matching**:
   - domain: Matches registered domain (google.com matches www.google.com)
   - subdomain_wildcard: Matches subdomains
   - exact_url: Exact string match only
   - regex: Pattern matching
7. **Update Entry**: No errors, updated_at timestamp changes
8. **Bulk Create**: Returns array of IDs
9. **Export**: Returns valid JSON string
10. **Get All Lists**: Returns array of unique list names
11. **Delete Entry**: No errors, entry removed
12. **Delete All**: No errors, list cleared
13. **Import**: Returns count of imported entries

### Testing Domain Matching with psl

The psl library should correctly handle complex TLDs:

```javascript
// These should all match as the same domain
listUtils.matchesPattern('https://example.com', 'example.com', 'domain')        // true
listUtils.matchesPattern('https://www.example.com', 'example.com', 'domain')    // true
listUtils.matchesPattern('https://sub.example.com', 'example.com', 'domain')    // true

// Complex TLDs
listUtils.matchesPattern('https://example.co.uk', 'example.co.uk', 'domain')    // true
listUtils.matchesPattern('https://www.example.co.uk', 'example.co.uk', 'domain') // true
```

### Performance Testing

Test with large datasets:

```javascript
// Create 1000 entries
const entries = [];
for (let i = 0; i < 1000; i++) {
  entries.push({
    list_name: 'performance-test',
    domain: `domain${i}.com`,
    pattern_type: 'domain',
    metadata: { index: i }
  });
}

console.time('bulkCreate');
await listUtils.bulkCreateListEntries(entries);
console.timeEnd('bulkCreate');

console.time('getEntries');
const results = await listUtils.getListEntries('performance-test');
console.timeEnd('getEntries');

console.time('matchDomain');
await listUtils.matchDomainAgainstList('https://domain500.com', 'performance-test');
console.timeEnd('matchDomain');
```

### Error Handling Tests

Test error conditions:

```javascript
// Test 1: Duplicate entry (should fail due to unique constraint)
try {
  await listUtils.createListEntry({
    list_name: 'test',
    domain: 'duplicate.com',
    pattern_type: 'domain',
    metadata: {}
  });
  await listUtils.createListEntry({
    list_name: 'test',
    domain: 'duplicate.com',
    pattern_type: 'domain',
    metadata: {}
  });
  console.error('❌ Should have thrown duplicate error');
} catch (error) {
  console.log('✅ Correctly rejected duplicate:', error.message);
}

// Test 2: Invalid pattern type
const badPattern = listUtils.matchesPattern('https://test.com', 'test.com', 'invalid-type');
console.log('Pattern with invalid type returns:', badPattern); // Should return false

// Test 3: Invalid regex
const badRegex = listUtils.matchesPattern('https://test.com', '[invalid(regex', 'regex');
console.log('Invalid regex returns:', badRegex); // Should return false, not throw

// Test 4: Update non-existent entry
try {
  await listUtils.updateListEntry(999999, { domain: 'new.com' });
  console.error('❌ Should have thrown not found error');
} catch (error) {
  console.log('✅ Correctly rejected update of non-existent entry');
}
```

### Debugging Tips

1. **Check IndexedDB in DevTools**:
   - Application tab → Storage → IndexedDB → webmunk_lists
   - Inspect entries directly

2. **Enable verbose logging**:
   ```javascript
   // Add to list-utilities.mts for debugging
   console.log('[list-utilities] Operation:', ...args)
   ```

3. **Clear database between tests**:
   ```javascript
   indexedDB.deleteDatabase('webmunk_lists')
   ```

4. **Check for transaction errors**:
   - Transaction errors may not always propagate
   - Add error handlers to all transaction operations

---

## Implementation Details

### Core List Utilities Module

**File:** `webmunk-core/src/list-utilities.mts`

A comprehensive IndexedDB-based list management system with the following features:

#### TypeScript Interfaces
- `ListEntry` interface with auto-increment ID, list_name, domain, pattern_type, and flexible metadata
- `PatternType` type definition supporting: domain, subdomain_wildcard, exact_url, regex

#### Database Management
- `initializeListDatabase()` - Creates/opens IndexedDB with proper schema
- Database name: `webmunk_lists`
- Object store: `list_entries`
- Indexes: list_name, domain, and compound [list_name, domain] (unique)

#### CRUD Operations
- `createListEntry()` - Create single entry with automatic timestamps
- `getListEntries()` - Retrieve all entries for a specific list
- `getAllLists()` - Get all unique list names
- `updateListEntry()` - Update entry with automatic updated_at timestamp
- `deleteListEntry()` - Delete by ID
- `deleteAllEntriesInList()` - Clear entire list

#### Query Operations
- `findListEntry()` - Find specific entry by list_name and domain
- `matchDomainAgainstList()` - Match URL against all patterns in a list

#### Bulk Operations
- `bulkCreateListEntries()` - Create multiple entries in single transaction
- `exportList()` - Export list to JSON string
- `importList()` - Import from JSON (clears existing, creates new)

#### Pattern Matching
- `matchesPattern()` - URL pattern matching with psl library
- Supports domain matching with proper TLD handling (co.uk, com.au, etc.)
- Subdomain wildcard matching (*.google.com)
- Exact URL matching
- Regex pattern matching with error handling

### Design Decisions

1. **Single IndexedDB Store**
   - All lists in one object store with `list_name` field
   - Allows efficient cross-list queries if needed
   - Simpler than multiple object stores

2. **Direct IndexedDB Access**
   - No message passing required
   - Modules import utilities directly
   - Better performance, simpler architecture

3. **psl Library Usage**
   - Handles complex TLDs correctly (co.uk, com.au, etc.)
   - More reliable than regex-based parsing
   - Small library, well-maintained

4. **Flexible Metadata**
   - JSON object with optional standard fields
   - Extensible for module-specific needs
   - Maintains backwards compatibility

### Limitations and Considerations

1. **IndexedDB Browser-Only**
   - Cannot test in Node.js without polyfill
   - Requires browser context for real testing

2. **Pattern Matching Performance**
   - O(n) search through all patterns in a list
   - Consider caching for large lists if needed
   - Indexes help with specific lookups

3. **No Remote Sync**
   - Local storage only
   - Import/export for manual sync
   - Future: Could add sync functionality

### Code Quality

#### Type Safety
- Full TypeScript type coverage
- No `any` types used
- Proper error type handling
- Validated with strict TypeScript compiler

#### Error Handling
- All IndexedDB operations wrapped in try-catch
- Promise-based error propagation
- Descriptive error messages
- Graceful fallbacks for invalid patterns

#### Performance
- Uses IndexedDB indexes for efficient queries
- Single compound unique index prevents duplicates
- Bulk operations use single transaction
- psl library for fast domain parsing

---

## Troubleshooting

### "python3: command not found"

Edit `playwright.config.js` and change:
```javascript
command: 'python -m http.server 8080'
```

### "Port 8080 already in use"

Kill the process using port 8080:
```bash
lsof -ti:8080 | xargs kill -9
```

Or change the port in `playwright.config.js`.

### Tests Fail with "testUtilitiesReady is not true"

The bundle wasn't built. Run:
```bash
npm run build-test-bundle
```

### "Cannot find module psl"

Install dependencies in webmunk-core:
```bash
cd ../
npm install
cd tests
npm run build-test-bundle
```

### Relative Path Issues

The build script uses `../webmunk-core/src/list-utilities.mts` which is correct since the tests directory is now inside webmunk-core. If you've moved files around, verify the path in `build-test-bundle.js`.

---

## CI/CD Integration

The tests are configured to run in CI environments. Add to your CircleCI config:

```yaml
- run:
    name: Test List Utilities
    command: |
      cd webmunk-core/tests
      npm install
      npx playwright install chromium
      npm run build-test-bundle
      npm test
```

---

## Integration Test Checklist

When integrating into a real extension:

- [ ] Database initializes on extension load
- [ ] Can create entries from UI
- [ ] Can retrieve and display entries
- [ ] Can update entries
- [ ] Can delete entries
- [ ] Export downloads valid JSON file
- [ ] Import loads JSON and creates entries
- [ ] Pattern matching works for domain blocking
- [ ] Categories properly tag entries
- [ ] No duplicate entries allowed
- [ ] Performance acceptable with 1000+ entries
- [ ] Error handling doesn't crash extension

---

## Requirements

- Node.js 18+ (for Playwright)
- Python 3 (for local web server during tests)

---

## Next Steps

After verifying list utilities work:

1. Integrate into webmunk-block-allow module
2. Create UI for list management
3. Test in browser extensions
4. Performance testing with real browsing history

---

## Additional Resources

- **Playwright Documentation**: https://playwright.dev/docs/intro
- **Test Specs**: `specs/list-utilities.spec.js`
- **HTML Report**: Opens automatically on test failure at `playwright-report/index.html`
- **Build Script**: `build-test-bundle.js`
- **Playwright Config**: `playwright.config.js`
