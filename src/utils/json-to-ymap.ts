import * as Y from 'yjs';
import type {
  Operation,
  AddOperation,
  ReplaceOperation,
} from 'fast-json-patch';

export type PatchCallback = (patches: Operation[]) => void;

/**
 * Converts a JSON object to a Y.Doc.
 * @param json The JSON object to convert.
 * @param doc An optional existing Y.Doc to use.
 * @returns The root Y.Map of the document.
 */
export function jsonToYDoc(json: any, doc = new Y.Doc()): Y.Map<any> {
  const rootMap = doc.getMap('root');
  convertJsonToYMap(rootMap, json);
  return rootMap;
}

function convertJsonToYMap(yMap: Y.Map<any>, json: any): void {
  for (const key in json) {
    if (Object.prototype.hasOwnProperty.call(json, key)) {
      const value = json[key];
      yMap.set(key, convertValue(value));
    }
  }
}

function convertValue(value: any): any {
  if (Array.isArray(value)) {
    return Y.Array.from(value.map(convertValue));
  }
  if (typeof value === 'object' && value !== null) {
    const yMap = new Y.Map();
    convertJsonToYMap(yMap, value);
    return yMap;
  }
  return value;
}

/**
 * Applies a JSON patch to a Y.Doc.
 * @param doc The Y.Doc to apply the patch to.
 * @param patch The JSON patch to apply.
 */
export function applyJsonPatchToYDoc(doc: Y.Doc, patch: Operation[]): void {
  const root = doc.getMap('root');

  doc.transact(() => {
    for (const op of patch) {
      const pathParts = op.path.slice(1).split('/').map(decodeURIComponent);
      if (pathParts.length === 0 || (pathParts.length === 1 && pathParts[0] === '')) continue;

      let current: any = root;
      let parent: any = null;
      let lastKeyOrIndex: string | number | null = null;

      // Traverse the path to find the parent container and the final key/index
      for (let i = 0; i < pathParts.length; i++) {
        parent = current;
        const part = pathParts[i];

        if (parent instanceof Y.Map) {
          lastKeyOrIndex = part;
          if (i < pathParts.length - 1) { // Only move 'current' if there are more parts to traverse
            current = parent.get(part);
          }
        } else if (parent instanceof Y.Array) {
          const index = parseInt(part, 10);
          if (isNaN(index)) {
            parent = undefined; // Invalid path for array
            break;
          }
          lastKeyOrIndex = index;
          if (i < pathParts.length - 1) { // Only move 'current' if there are more parts to traverse
            current = parent.get(index);
          }
        } else {
          parent = undefined; // Invalid path, parent is a primitive or doesn't exist
          break;
        }
      }

      if (!(parent instanceof Y.Map || parent instanceof Y.Array) || lastKeyOrIndex === null) {
          console.warn('Could not find valid parent for op:', op);
          continue; // Skip to the next operation
      }

      try {
        if (parent instanceof Y.Map) {
          handleMapOperation(parent, op, lastKeyOrIndex as string);
        } else if (parent instanceof Y.Array) {
          handleArrayOperation(parent, op, lastKeyOrIndex as number);
        }
      } catch (err) {
        console.warn('Failed to apply patch op:', op, err);
      }
    }
  }, 'local'); // Origin 'local' to be ignored by observers
}


function handleMapOperation(map: Y.Map<any>, op: Operation, key: string) {
  if (op.op === 'add' || op.op === 'replace') {
    const value = (op as AddOperation<any> | ReplaceOperation<any>).value;
    map.set(key, convertValue(value));
  } else if (op.op === 'remove') {
    map.delete(key);
  }
}

function handleArrayOperation(array: Y.Array<any>, op: Operation, index: number) {
  if (isNaN(index)) return;

  if (op.op === 'add') {
    const value = (op as AddOperation<any>).value;
    array.insert(index, [convertValue(value)]);
  } else if (op.op === 'replace') {
    const value = (op as ReplaceOperation<any>).value;
    // For 'replace', Y.js is more efficient if you just overwrite the value
    // without deleting and re-inserting, if the item at index is a Y.Map/Y.Array
    // or if it's a primitive.
    // If you need to replace a primitive with a Y.Map/Y.Array or vice-versa,
    // the delete/insert approach is safer to ensure type consistency.
    // Given convertValue, this should be fine.
    array.delete(index, 1);
    array.insert(index, [convertValue(value)]);
  } else if (op.op === 'remove') {
    array.delete(index, 1);
  }
}

function generatePatch(
  path: (string | number)[],
  op: 'add' | 'replace' | 'remove',
  value?: any
): Operation {
  // JSON Patch paths for array indices should be numbers, not encoded.
  // For property names, they should be encoded.
  const fullPath = '/' + path.map(p => {
    if (typeof p === 'number') {
      return p.toString(); // Numbers for array indices
    }
    return encodeURIComponent(p.toString()); // Encode string keys
  }).join('/');

  if (op === 'remove') {
    return { op, path: fullPath };
  }
  return { op, path: fullPath, value };
}

/**
 * Observes a Y.Doc for changes and generates JSON patches.
 * @param doc The Y.Doc to observe.
 * @param callback The function to call with the generated patches.
 */
export function observeYDocForPatches(doc: Y.Doc, callback: PatchCallback): void {
  const rootMap = doc.getMap('root');

  const observer = (events: (Y.YMapEvent<any> | Y.YArrayEvent<any>)[], transaction: Y.Transaction) => {
    if (transaction.origin === 'local' || transaction.origin === 'external_push') {
      return; // Ignore changes made by applyJsonPatchToYDoc and external push operations
    }

    const patches: Operation[] = [];

    for (const event of events) {
      // getPathFromTarget now recursively finds the correct path from the root
      const path = getPathFromTarget(event.target, rootMap);
      if (path.length === 0 && event.target !== rootMap) { // If target is not rootMap and path is empty, it means we couldn't resolve
          console.warn('Could not determine path for event target:', event.target);
          continue;
      }

      if (event instanceof Y.YMapEvent) {
        patches.push(...handleMapEvent(event, path));
      } else if (event instanceof Y.YArrayEvent) {
        patches.push(...handleArrayEvent(event, path));
      }
    }

    if (patches.length > 0) {
      callback(patches);
    }
  };

  /**
   * Recursively finds the full path of a Y.AbstractType from a starting YType.
   * This ensures the complete JSON Patch path is constructed.
   */
  function getPathFromTarget(target: Y.AbstractType<any>, currentYType: Y.AbstractType<any>, currentPath: (string | number)[] = []): (string | number)[] {
    if (target === currentYType) {
      return currentPath;
    }

    if (currentYType instanceof Y.Map) {
      for (const [key, value] of currentYType.entries()) {
        if (value instanceof Y.AbstractType) {
          const foundPath = getPathFromTarget(target, value, [...currentPath, key]);
          if (foundPath.length > 0) {
            return foundPath;
          }
        }
      }
    } else if (currentYType instanceof Y.Array) {
      for (let i = 0; i < currentYType.length; i++) {
        const value = currentYType.get(i);
        if (value instanceof Y.AbstractType) {
          const foundPath = getPathFromTarget(target, value, [...currentPath, i]);
          if (foundPath.length > 0) {
            return foundPath;
          }
        }
      }
    }
    return [];
  }

  rootMap.observeDeep(observer);
}

function handleMapEvent(event: Y.YMapEvent<any>, basePath: (string | number)[]): Operation[] {
  const patches: Operation[] = [];
  for (const [key, change] of event.changes.keys.entries()) {
    const fullPath = [...basePath, key];
    if (change.action === 'add') {
      patches.push(generatePatch(fullPath, 'add', convertYTypeToJson(event.target.get(key))));
    } else if (change.action === 'update') {
      patches.push(generatePatch(fullPath, 'replace', convertYTypeToJson(event.target.get(key))));
    } else if (change.action === 'delete') {
      patches.push(generatePatch(fullPath, 'remove'));
    }
  }
  return patches;
}

function handleArrayEvent(event: Y.YArrayEvent<any>, basePath: (string | number)[]): Operation[] {
  const patches: Operation[] = [];
  let currentIndex = 0; // Tracks the current index in the array for patch generation

  for (const delta of event.changes.delta) {
    if (delta.retain) {
      currentIndex += delta.retain;
    } else if (delta.insert) {
      // delta.insert can be a single item or an array of items
      const items = Array.isArray(delta.insert) ? delta.insert : [delta.insert];
      items.forEach((item) => {
        // For 'add' operations, the path includes the index where it's inserted.
        patches.push(generatePatch([...basePath, currentIndex], 'add', convertYTypeToJson(item)));
        currentIndex++; // Increment index for subsequent inserts
      });
    } else if (delta.delete) {
      // For 'remove' operations, the path should point to the element being removed.
      // Y.js deltas describe changes based on the state *before* the current operation,
      // so `currentIndex` correctly points to the element to be deleted.
      for (let i = 0; i < delta.delete; i++) {
        patches.push(generatePatch([...basePath, currentIndex], 'remove'));
      }
      // Note: currentIndex is NOT incremented for deletes because the elements are removed,
      // and subsequent elements shift to the left. The next operation will work from this `currentIndex`.
    }
  }
  return patches;
}

// Helper function to convert Y.Map/Y.Array instances back to plain JSON for patches
function convertYTypeToJson(yValue: any): any {
  if (yValue instanceof Y.Map) {
    const obj: { [key: string]: any } = {};
    yValue.forEach((value, key) => {
      obj[key] = convertYTypeToJson(value);
    });
    return obj;
  }
  if (yValue instanceof Y.Array) {
    // Corrected line: Y.Array.map already returns a plain JS array
    return yValue.map((item) => convertYTypeToJson(item));
  }
  return yValue;
}
