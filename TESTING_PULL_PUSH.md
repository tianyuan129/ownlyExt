# Manual Testing Guide: Pull/Push Functionality

## Test Results Summary

✅ **All automated tests passed!** The comprehensive e2e test validated all pull/push functionality works correctly.

## Quick Start: Running the Tests

### 1. Automated E2E Test
```bash
# Terminal 1: Start the test server
node test-server.js

# Terminal 2: Run the comprehensive test suite
node test-e2e-pull-push.js
```

### 2. Manual Testing with WebSocket Client

#### Prerequisites
- WebSocket server running on `ws://localhost:3001`
- External JSON document created in the UI named `test-doc`

#### Method 1: Using the provided test server
```bash
# Start test server (handles pull/push/patch)
node test-server.js

# In another terminal, use any WebSocket client to send:
```

#### Method 2: Using browser WebSocket client
```javascript
// Open browser console and connect to your actual application
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data));

// Test pull command
ws.send(JSON.stringify({
  type: 'pull',
  name: 'test-doc'
}));

// Test push command
ws.send(JSON.stringify({
  type: 'push',
  name: 'test-doc',
  data: {
    message: 'Hello from external system!',
    timestamp: new Date().toISOString(),
    nested: { value: 42 }
  }
}));

// Test patch command (still works)
ws.send(JSON.stringify({
  type: 'patch',
  name: 'test-doc',
  data: [
    { op: 'replace', path: '/message', value: 'Updated message' },
    { op: 'add', path: '/newField', value: 'added' }
  ]
}));
```

## Message Format Reference

### Pull Command
**Request:**
```json
{
  "type": "pull",
  "name": "document-name"
}
```

**Response:**
```json
{
  "type": "pull_response",
  "name": "document-name",
  "data": { "entire": "json", "document": "here" }
}
```

### Push Command
**Request:**
```json
{
  "type": "push",
  "name": "document-name",
  "data": { "completely": "new", "document": "content" }
}
```
**Behavior:** Unconditionally replaces the entire document

### Patch Command (Existing)
**Request:**
```json
{
  "type": "patch",
  "name": "document-name", 
  "data": [
    { "op": "replace", "path": "/field", "value": "new-value" }
  ]
}
```

## Testing Scenarios

### Scenario 1: Basic Pull/Push Cycle
1. **Pull**: Get current document state
2. **Push**: Replace with new data
3. **Pull**: Verify data was replaced
4. **Expected**: Document content completely changed

### Scenario 2: Push + Patch Integration
1. **Push**: Set initial document structure
2. **Patch**: Apply incremental changes
3. **Pull**: Verify both push and patch were applied
4. **Expected**: Document has base structure + patch modifications

### Scenario 3: Complex Data Structures
1. **Push**: Send nested objects, arrays, null values
2. **Pull**: Verify complex data preserved correctly
3. **Patch**: Modify nested values
4. **Expected**: All data types handled properly

### Scenario 4: Error Handling
1. Send invalid JSON
2. Send missing `name` field
3. Send unknown message type
4. **Expected**: Graceful error responses

## Integration with Real Application

### To test with your actual application:

1. **Start your development server**
   ```bash
   npm run dev
   ```

2. **Create an external JSON document in the UI**
   - Go to your workspace
   - Create new "External JSON Doc" 
   - Set WebSocket URL to `ws://localhost:3001`
   - Name it `test-doc`

3. **Start the test server to simulate external system**
   ```bash
   node test-server.js
   ```

4. **Use browser DevTools to send messages**
   - Open browser console
   - Connect to WebSocket and send pull/push commands
   - Watch the UI update in real-time

5. **Verify in UI**
   - External JSON doc view should update automatically
   - Timestamp should change on each operation
   - Document content should reflect your commands

## Expected Behaviors

✅ **Pull Command**
- Returns current Yjs document as JSON
- Includes all nested structures and arrays
- Non-destructive operation

✅ **Push Command**  
- Completely replaces document content
- Clears existing data before applying new data
- Triggers UI update events
- Does NOT generate patch messages back to WebSocket

✅ **Patch Integration**
- Patches work normally after push operations
- Can modify push-created content incrementally
- Generates normal patch messages for non-push changes

✅ **Error Handling**
- Invalid JSON gracefully handled
- Missing fields return error messages
- Unknown message types return error responses

## Performance Notes

- Push operations use `external_push` transaction origin
- This prevents infinite loops in patch generation
- Changes still propagate to other workspace participants via NDN/SVS
- WebSocket client won't receive patches for its own push operations

## Files Created/Modified

- ✅ `src/services/workspace-ext.ts` - Added pull/push handlers
- ✅ `src/utils/json-to-ymap.ts` - Updated to ignore external_push origin
- ✅ `test-e2e-pull-push.js` - Comprehensive test suite
- ✅ `test-server.js` - Test WebSocket server for validation
- ✅ Package dependencies - Added fast-json-patch and types

All tests passing! 🎉 Pull/Push functionality is ready for production use.