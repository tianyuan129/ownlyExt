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

      // --- Start of Corrected Section ---

      let parent: any = root;

      // Traverse the path to find the parent container
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!parent) break;

        const part = pathParts[i];
        let next;

        if (parent instanceof Y.Map) {
          next = parent.get(part);
        } else if (parent instanceof Y.Array) {
          const index = parseInt(part, 10);
          next = parent.get(index);
        } else {
          parent = undefined; // Invalid path, parent is a primitive
          break;
        }
        parent = next;
      }

      if (!(parent instanceof Y.Map || parent instanceof Y.Array)) {
          console.warn('Could not find parent for op:', op);
          continue; // Skip to the next operation
      }
      // --- End of Corrected Section ---


      const keyOrIndex = pathParts[pathParts.length - 1];

      try {
        if (parent instanceof Y.Map) {
          handleMapOperation(parent, op, keyOrIndex);
        } else if (parent instanceof Y.Array) {
          handleArrayOperation(parent, op, keyOrIndex);
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

function handleArrayOperation(array: Y.Array<any>, op: Operation, key: string) {
  const index = parseInt(key, 10);
  if (isNaN(index)) return;

  if (op.op === 'add') {
    const value = (op as AddOperation<any>).value;
    array.insert(index, [convertValue(value)]);
  } else if (op.op === 'replace') {
    const value = (op as ReplaceOperation<any>).value;
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
  const fullPath = '/' + path.map(p => encodeURIComponent(p.toString())).join('/');
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
    if (transaction.origin === 'local') {
      return; // Ignore changes made by applyJsonPatchToYDoc
    }

    const patches: Operation[] = [];

    for (const event of events) {
      const path = getPathFromTarget(event.target);
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

  // Create a map to reconstruct path from a Yjs type
  const yTypeToPath = new WeakMap<Y.AbstractType<any>, (string | number)[]>();
  function buildPathMap(type: Y.AbstractType<any>, path: (string | number)[]) {
    if (yTypeToPath.has(type)) return;
    yTypeToPath.set(type, path);

    if (type instanceof Y.Map) {
      type.forEach((value, key) => {
        if (value instanceof Y.AbstractType) {
          buildPathMap(value, [...path, key]);
        }
      });
    } else if (type instanceof Y.Array) {
      type.forEach((value, i) => {
        if (value instanceof Y.AbstractType) {
          buildPathMap(value, [...path, i]);
        }
      });
    }
  }

  buildPathMap(rootMap, []);

  function getPathFromTarget(target: Y.AbstractType<any>): (string|number)[] {
    // Rebuild the map on every transaction in case hierarchy changes
    buildPathMap(rootMap, []);
    return yTypeToPath.get(target) || [];
  }

  rootMap.observeDeep(observer);
}

function handleMapEvent(event: Y.YMapEvent<any>, basePath: (string | number)[]): Operation[] {
  const patches: Operation[] = [];
  for (const [key, change] of event.changes.keys.entries()) {
    if (change.action === 'add') {
      patches.push(generatePatch([...basePath, key], 'add', event.target.get(key)));
    } else if (change.action === 'update') {
      patches.push(generatePatch([...basePath, key], 'replace', event.target.get(key)));
    } else if (change.action === 'delete') {
      patches.push(generatePatch([...basePath, key], 'remove'));
    }
  }
  return patches;
}

function handleArrayEvent(event: Y.YArrayEvent<any>, basePath: (string | number)[]): Operation[] {
  const patches: Operation[] = [];
  let index = 0;
  for (const delta of event.changes.delta) {
    if (delta.retain) {
      index += delta.retain;
    } else if (delta.insert) {
      const items = Array.isArray(delta.insert) ? delta.insert : [delta.insert];
      items.forEach((item, i) => {
        patches.push(generatePatch([...basePath, index + i], 'add', item));
      });
      index += items.length;
    } else if (delta.delete) {
      for (let i = 0; i < delta.delete; i++) {
        patches.push(generatePatch([...basePath, index], 'remove'));
      }
    }
  }
  return patches;
}
