import * as Y from 'yjs';
import type { Operation } from 'fast-json-patch';

export type PatchCallback = (patches: Operation[]) => void;

export function jsonToYDoc(json: any, doc = new Y.Doc()): Y.Map<any> {
  const rootMap = doc.getMap('root');
  convertJsonToYMap(rootMap, json);
  return rootMap;
}

// Generic function to convert JSON to Yjs Map/Array types
function convertJsonToYMap(yMap: Y.Map<any>, json: any): void {
  Object.keys(json).forEach(key => {
    const value = json[key];
    if (Array.isArray(value)) {
      const yArray = new Y.Array<any>();
      value.forEach(item => yArray.push([convertValue(item)]));
      yMap.set(key, yArray);
    } else if (typeof value === 'object' && value !== null) {
      const nestedMap = new Y.Map<any>();
      convertJsonToYMap(nestedMap, value);
      yMap.set(key, nestedMap);
    } else {
      yMap.set(key, value);
    }
  });
}

// Generic function to convert any value to a Yjs Map or Array
function convertValue(value: any): any {
  if (Array.isArray(value)) {
    const yArray = new Y.Array<any>();
    value.forEach(item => yArray.push([convertValue(item)]));
    return yArray;
  } else if (typeof value === 'object' && value !== null) {
    const yMap = new Y.Map<any>();
    convertJsonToYMap(yMap, value);
    return yMap;
  } else {
    return value;
  }
}

function yMapToJson(yMap: any): any {
  const obj: any = {};
  yMap.forEach((value: any, key: any) => {
    if (value instanceof Y.Map) {
      obj[key] = yMapToJson(value);
    } else if (value instanceof Y.Array) {
      obj[key] = yArrayToJson(value);
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

function yArrayToJson(yArray: Y.Array<any>): any[] {
  return yArray.toArray().map(item => item instanceof Y.Map ? yMapToJson(item) : item);
}

export function applyJsonPatchToYDoc(doc: Y.Doc, patch: Operation[]): void {
  const root = doc.getMap('root');

  doc.transact(() => {
    for (const op of patch) {
      const pathParts = op.path.slice(1).split('/').map(decodeURIComponent);
      if (pathParts.length === 0) continue;

      let parent: any = root;
      let key: string | number = '';

      // Traverse to the parent container
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        const next = parent.get(part);

        if (next instanceof Y.Map || next instanceof Y.Array) {
          parent = next;
        } else {
          // Bail if the structure doesn't match
          parent = null;
          break;
        }
      }

      if (!parent) continue;
      key = pathParts[pathParts.length - 1];

      try {
        if (parent instanceof Y.Map) {
          if (op.op === 'add' || op.op === 'replace') {
            parent.set(key, convertValue(op.value));
          } else if (op.op === 'remove') {
            parent.delete(key);
          }
        } else if (parent instanceof Y.Array) {
          const index = parseInt(key as string, 10);
          if (isNaN(index)) continue;

          if (op.op === 'add') {
            parent.insert(index, [convertValue(op.value)]);
          } else if (op.op === 'replace') {
            parent.delete(index, 1);
            parent.insert(index, [convertValue(op.value)]);
          } else if (op.op === 'remove') {
            parent.delete(index, 1);
          }
        }
      } catch (err) {
        console.warn('Failed to apply patch op:', op, err);
      }
    }
  }, 'local');
}

function generatePatch(path: string[], key: string | number, value: any, op: 'add' | 'remove' | 'replace'): Operation {
  return {
    op,
    path: '/' + [...path, key].join('/'),
    ...(op !== 'remove' ? { value } : {}),
  } as Operation;
}

export function observeYDocForPatches(doc: Y.Doc, callback: PatchCallback) {
  const rootMap = doc.getMap('root');
  rootMap.observeDeep((events, transaction) => {
    if (transaction.origin === 'local') return;
    const patches: Operation[] = [];
    events.forEach(event => {
      if (event instanceof Y.YMapEvent) {
        event.keysChanged.forEach(key => {
          const change = event.changes.keys.get(key);
          if (change) {
            const value = rootMap.get(key);
            const op = change.action === 'add' ? 'add' : change.action === 'update' ? 'replace' : 'remove';
            patches.push(generatePatch([], key, value, op));
          }
        });
      }
    });
    if (patches.length) callback(patches);
  });
}
