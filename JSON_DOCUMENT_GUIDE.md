# JSON Document System - User Guide

## Overview

The JSON Document system in Ownly provides a powerful way to share real-time JSON data between your workspace and external applications via WebSocket connections. Unlike regular documents, JSON docs can only be modified by external applications through WebSocket connections, while the Ownly interface provides a read-only view.

This system perfect for:
- **Real-time dashboards** that update from external data sources
- **API integration** where external services push data to your workspace

## Getting Started

### Step 1: Create a JSON Document

1. **Navigate to your workspace** in Ownly
2. **Click "Add JSON Doc"** in the navbar under "Patch-Only JSON Doc" section
3. **Configure your document**:
   - **Name**: Choose a descriptive name (1-40 characters, letters/numbers/hyphens/underscores only)
   - **WebSocket URL**: Select how your external application will connect:
     - **Relay #1-3 (for Testing)**: Use voluntary WebSocket relay - for demonstration and internal debug usage
     - **Custom URL (for Real Apps)**: Use your own WebSocket server if you have specific requirements
4. **Click "Create"** to establish the document

### Step 2: Get Your Profile Token

1. **Navigate to your JSON document**: Go to `/{workspace}/external/{document_name}`
2. **Copy your profile token**: Click the 📋 button next to the "Profile Token" in the top-right
3. **Share with your application**: This token authenticates your external application

### Step 3: Connect Your External Application

Your external application needs to:
1. **Connect** to the same WebSocket URL you configured
2. **Authenticate** using your profile token
3. **Send data updates** using JSON patch format

## Understanding the Interface

### JSON Document View

When viewing a JSON document in Ownly, you'll see:

- **Profile Token** (top-right): Your authentication token for external applications
- **JSON Tree Viewer**: Interactive, expandable view of your document structure
- **Real-time Updates**: Changes from external applications appear instantly
- **Read-only Mode**: You cannot edit the document directly in Ownly

## Testing Your Setup in Relay Mode

#### Step 1: Set Up Your JSON Document
1. Create a JSON document in Ownly (let's call it `game-world`)
2. Use one of the relay servers: `wss://ownly-websocket-relay-1.tianyuan-3da.workers.dev`
3. Copy your profile token $t1$ from the Ownly interface
4. Open a **new** profile, join the workspace and click on `game-world`, copy the profile token $t2$.

#### Step 2: Open Two Test Connections
1. **Tab 1**: Open https://ownly-websocket-ui.pages.dev/
2. **Tab 2**: Open https://ownly-websocket-ui.pages.dev/ in a new tab
3. **Tab 3**: Keep your Ownly JSON document view open

#### Step 3: Connect Both Test UIs
In both test UI tabs:
1. Enter WebSocket URL: `wss://ownly-websocket-relay-1.tianyuan-3da.workers.dev`
2. Enter the **$t1$** in the first tab and **$t2$** in the second tab
3. Click "Connect" and verify both show "✅ Connected"

#### Step 4: Initialize Game World (Tab 1)
In the first test UI tab, send this patch to create the initial game world:

**Document Name**: `game-world`
**Patch Data**:
```json
[
  {"op":"add","path":"/worldID","value":0},
  {"op":"add","path":"/numPlayers","value":1},
  {"op":"add","path":"/worldWidthInChunks","value":4},
  {"op":"add","path":"/chunkWidthInVoxels","value":16},
  {"op":"add","path":"/chunkHeightInVoxels","value":50},
  {"op":"add","path":"/players","value":[{"playerID":0,"position":{"x":0.0,"y":0.0,"z":0.0},"rotation":{"x":0.0,"y":0.0,"z":0.0,"w":1.0}}]},
  {"op":"add","path":"/chunks","value":[{"position":{"x":0.0,"y":0.0,"z":0.0},"voxels":[1, 1, 1, 1, 1]}]}
]
```

**What happens**:
- ✅ Tab 1: Sends the patch
- ✅ Tab 2: Receives the patch message instantly  
- ✅ Ownly: Shows the complete game world structure in real-time
- ✅ All three locations now show the same game state

#### Step 5: Add Second Player (Tab 2)
In the second test UI tab, simulate a second player joining:

**Document Name**: `game-world`
**Patch Data**:
```json
[
  {"op": "replace", "path": "/numPlayers", "value": 2},
  {"op": "add", "path": "/players/1", "value": {"playerID": 1, "position": [5, 0, 0], "rotation": [0, 0, 0, 1]}},
  {"op": "replace", "path": "/chunks/0/voxels/2", "value": 0}
]
```

**What happens**:
- ✅ Tab 2: Sends the patch
- ✅ Tab 1: Receives the patch message instantly
- ✅ Ownly: Updates to show 2 players and the modified voxel
- ✅ All three locations show the updated game state

#### Step 6: Observe Real-time Synchronization
You've now demonstrated:
- **Multi-directional communication**: Both tabs can send and receive
- **Real-time updates**: Changes appear instantly across all connections
- **State synchronization**: All viewers see the same data
- **Collaborative editing**: Multiple "players" can modify the same world

## WebSocket Interfaces (for LocalApp Developers)

### Connection Flow

1. **Establish WebSocket connection** to the configured URL
2. **Register with profile token**:
   ```json
   {"type": "register", "token": "tok_xxxxxxxxxxxxx"}
   ```
3. **Receive confirmation (Relay Mode only)**:
   ```json
   {"type": "registered", "server": "relay-durable", "message": "Token registered successfully"}
   ```
> Token registrations share lifetime with WebSocket connections. **In Relay mode**, a token can at most be registered twice (two active connections), one representing Ownly-Relay, the other representing Relay-LocalApp

### Message Types

#### 1. Register (`register`)
**Purpose**: Authenticate and register the connection
```json
{
  "type": "register",
  "token": "tok_xxxxxxxxxxxxx"
}
```

#### 2. Patch (`patch`)
**Purpose**: Apply incremental changes to the document
```json
{
  "type": "patch",
  "name": "document_name",
  "token": "tok_xxxxxxxxxxxxx",
  "data": [
    {"op": "replace", "path": "/status", "value": "updated"},
    {"op": "add", "path": "/timestamp", "value": "2025-07-13T12:00:00Z"}
  ]
}
```

#### 3. Pull (`pull`)
**Purpose**: Request the complete current document state
```json
{
  "type": "pull",
  "name": "document_name",
  "token": "tok_xxxxxxxxxxxxx"
}
```

**Response** (`pull_response`):
```json
{
  "type": "pull_response",
  "name": "document_name",
  "token": "tok_xxxxxxxxxxxxx",
  "data": {
    "title": "Current Document",
    "status": "active",
    "items": [...],
    "_meta": {
      "created": "2025-07-13T06:05:19.022Z",
      "lastModified": "2025-07-13T06:05:19.022Z"
    }
  }
}
```

#### 4. Push (`push`)
**Purpose**: Replace the entire document content
```json
{
  "type": "push",
  "name": "document_name",
  "token": "tok_xxxxxxxxxxxxx",
  "data": {
    "completely": "new",
    "document": "structure"
  }
}
```

### Error Handling

Common error responses:
```json
{"type": "error", "server": "relay-durable", "message": "Token is required for all messages"}
{"type": "error", "server": "relay-durable", "message": "Must register token first"}
{"type": "error", "server": "relay-durable", "message": "Token mismatch - connection bound to different token"}
{"type": "error", "server": "relay-durable", "message": "Token already has maximum connections (2)"}
```
