# Detailed Prompt for Whiteboard Migration: Tldraw (v5) to Excalidraw (MIT)

This document provides a complete technical specification and step-by-step instructions for migrating the custom whiteboard implementation from **Tldraw (v5)** to **Excalidraw**. Save this file to replay the migration later.

---

## 1. Backend Migration (`whiteboard-sync`)

### A. Dependencies (`whiteboard-sync/package.json`)
Remove `@tldraw/sync` and any other Tldraw-specific dependencies. Add Cloudflare Worker types if not present:
```json
"devDependencies": {
  "@cloudflare/workers-types": "^4.20240115.0"
}
```

### B. Durable Object Re-write (`whiteboard-sync/worker/TldrawDurableObject.ts`)
Tldraw uses a complex delta-synchronization protocol. Excalidraw utilizes a simple list of elements with a last-write-wins (LWW) versioning scheme. Rewrite the Durable Object to persist and relay Excalidraw elements:

1. **Schema Initialization**: Create a SQLite table `whiteboard_snapshots (key TEXT PRIMARY KEY, snapshot TEXT NOT NULL)` to store the serialized elements array.
2. **WebSocket Message Handling**:
   - `init`: Send the initial list of elements loaded from SQLite.
   - `update`: Receive an array of updated elements. For each element:
     - Compare its `version` against the existing element version stored in memory (`this.elements.get(el.id)`).
     - If the new version is greater, overwrite it in the map and queue it for broadcast.
     - Broadcast the updated elements array back to other active clients.
3. **Hibernation & Alarm Checkpoints**: Run `alarm()` periodically (every 10 seconds) or when the last client disconnects to serialize and save the elements map to SQLite.

---

## 2. Frontend Dependencies (`frontend/package.json`)

Remove `@tldraw/tldraw`, `@tldraw/sync-client`, and `@tldraw/validate`. Add Excalidraw:
```json
"dependencies": {
  "@excalidraw/excalidraw": "^0.18.1"
}
```

---

## 3. Whiteboard Helpers (`frontend/components/classroom/whiteboard-helpers.ts`)

Rewrite the helpers to construct Excalidraw-compliant shapes. Excalidraw requires that child elements (e.g. background rectangles and images) are sorted **before** their parent frame in the elements array.

1. **Page Creation (`addHandDrawnPage`)**:
   - Create a `rectangle` element to act as the page background sheet:
     - `strokeColor: '#d1d5db'`, `backgroundColor: '#ffffff'`, `fillStyle: 'solid'`, `roughness: 0`, `locked: true`.
   - Create a `frame` element, setting the rectangle's ID in its `children` array.
   - Update the scene: `excalidrawAPI.updateScene({ elements: [...elements, rectElement, frameElement] })`.
2. **PDF Import (`importPdf`)**:
   - For each PDF page, render to canvas and upload to the R2 pipeline.
   - Convert the upload blob to a local `dataURL` and register it locally: `excalidrawAPI.addFiles([{ id: uploadId, dataURL, mimeType: 'image/png' }])`.
   - Create a `rectangle` background, an `image` element referencing `fileId: uploadId`, and a `frame` with `children: [rectId, imageId]`.
   - Append them to the elements list in correct rendering order (`rectElement`, `imageElement`, `frameElement`).
3. **Image Import (`importImage`)**:
   - Do the same as PDF import for a single uploaded image file.

---

## 4. Whiteboard Core (`frontend/components/Whiteboard.tsx`)

Implement the wrapper API, WebSocket synchronization, permissions, and canvas bounds clamping.

### A. Tldraw-Compatible Wrapper API
To prevent breaking note-export PDF orchestration in `VideoRoom.tsx`, mock a Tldraw adapter:
```typescript
const tldrawWrapper = {
  store: { listen(callback: any) { return () => {}; } },
  getCurrentPageId() { return 'default'; },
  getShape(id: string) { return excalidrawAPIInstance.getSceneElements().find((e) => e.id === id); },
  run(fn: () => void) { fn(); },
  getCurrentPageShapes() { return excalidrawAPIInstance.getSceneElements().filter((el) => !el.isDeleted); },
  getShapePageBounds(id: string) {
    const el = excalidrawAPIInstance.getSceneElements().find((e) => e.id === id);
    if (!el) return null;
    return { x: el.x, y: el.y, width: el.width, height: el.height, w: el.width, h: el.height };
  },
  getSortedChildIdsForParent(frameId: string) {
    const frame = excalidrawAPIInstance.getSceneElements().find((e) => e.id === frameId);
    return frame?.children || [];
  },
  async toImage(childIds: string[], options: any) {
    const allElements = excalidrawAPIInstance.getSceneElements();
    const files = excalidrawAPIInstance.getFiles();
    const elementsToExport = allElements.filter((el) => childIds.includes(el.id) && !el.isDeleted);
    const { exportToBlob } = await import('@excalidraw/excalidraw');
    const blob = await exportToBlob({
      elements: elementsToExport,
      appState: { viewBackgroundColor: '#ffffff' },
      files,
      mimeType: 'image/jpeg',
      quality: options.quality || 0.75,
      exportPadding: 0,
    });
    return { blob };
  },
  raw: excalidrawAPIInstance
};
if (onEditorMount) onEditorMount(tldrawWrapper);
```

### B. Element Verification and Sync in `onChange`
Excalidraw is uncontrolled. Inside `onChange(elements, appState)`:
1. **Infinite Canvas Read-Only Check**: Locate the center `(x + width/2, y + height/2)` of newly added shapes. If not inside any active frame, set `isDeleted: true` and trigger `updateScene` to delete it.
2. **Metadata Stamping**: If a local element lacks `customData.createdBy`, stamp it with `createdBy: myIdentity` and `strokeId` (if freedraw). Write it back locally with `updateScene` (matching versions to prevent infinite recursion).
3. **Permissions**: If a student modifies an element they don't own, or deletes frames/images, flash the shape red, temporarily scale it up, and schedule a 300ms revert timeout using `updateScene` with cached values.
4. **WebSocket relay**: Send the stamped elements via the WS connection.

### C. Client Image Sync
When a student receives an image element via WebSocket, download the R2 blob, convert to `dataURL`, register via `excalidrawAPI.addFiles`, and call `excalidrawAPI.updateScene` to trigger redraw.

### D. Render Controls
Move `<WhiteboardPageControls />` inside `Whiteboard.tsx` for cleaner layout nesting.

---

## 5. Overlay Adjustments

### A. useStrokeCapture & useCursorBroadcast
Map absolute coordinates to scene space by factoring in Excalidraw's camera properties:
```typescript
const appState = editor.getAppState();
const zoom = appState.zoom.value;
const x = (e.clientX - rect.left - appState.scrollX) / zoom;
const y = (e.clientY - rect.top - appState.scrollY) / zoom;
```

### B. StrokeOverlay Render Transform
Within the overlay `<canvas>` animation loop, translate and scale the 2D context using Excalidraw's appState:
```typescript
const appState = editor.getAppState();
ctx.scale(dpr, dpr);
ctx.translate(appState.scrollX, appState.scrollY);
ctx.scale(appState.zoom.value, appState.zoom.value);
```
