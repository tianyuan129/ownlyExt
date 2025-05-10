import * as Y from 'yjs';
import { applyPatch, Operation } from 'fast-json-patch';
import { describe, it, expect } from 'vitest';

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
  yMap.forEach((value, key) => {
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
  const rootMap = doc.getMap('root');
  const currentJson = yMapToJson(rootMap);
  const updated = applyPatch(currentJson, patch, false, false).newDocument;

  rootMap.clear();
  convertJsonToYMap(rootMap, updated);
}

function generatePatch(path: string[], key: string | number, value: any, op: 'add' | 'remove' | 'replace'): Operation {
  return {
    op,
    path: '/' + [...path, key].join('/'),
    ...(op !== 'remove' ? { value } : {}),
  };
}

export function observeYDocForPatches(doc: Y.Doc, callback: PatchCallback) {
  const rootMap = doc.getMap('root');
  rootMap.observeDeep(events => {
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

// Utility function to create a patch and apply it
function createPatch(doc: Y.Doc, path: string, value: any) {
  const rootMap = doc.getMap('root');
  const keys = path.split('/');
  let currentMap: any = rootMap;

  keys.forEach((key, idx) => {
    if (idx === keys.length - 1) {
      if (currentMap instanceof Y.Map) {
        currentMap.set(key, value);
      } else if (currentMap instanceof Y.Array) {
        currentMap.insert(parseInt(key, 10), [value]);
      }
    } else {
      currentMap = (currentMap instanceof Y.Map) ? currentMap.get(key) : currentMap.get(parseInt(key, 10));
      if (!(currentMap instanceof Y.Map || currentMap instanceof Y.Array)) {
        currentMap = new Y.Map();
      }
    }
  });
}

// Unit tests
describe('Yjs JSON Patch Applier', () => {
  it('should apply a simple patch to Y.Doc', () => {
    const json = { name: 'Alice', age: 30 };
    const patch = [{ op: 'replace', path: '/age', value: 31 }];
    const doc = new Y.Doc();
    jsonToYDoc(json, doc);
    applyJsonPatchToYDoc(doc, patch);
    const result = doc.getMap('root').toJSON();
    expect(result).toEqual({ name: 'Alice', age: 31 });
  });

  it('should add nested fields', () => {
    const json = { user: { name: 'Bob' } };
    const patch = [{ op: 'add', path: '/user/age', value: 25 }];
    const doc = new Y.Doc();
    jsonToYDoc(json, doc);
    applyJsonPatchToYDoc(doc, patch);
    const result = doc.getMap('root').toJSON();
    expect(result).toEqual({ user: { name: 'Bob', age: 25 } });
  });

  it('should remove fields', () => {
    const json = { x: 1, y: 2 };
    const patch = [{ op: 'remove', path: '/y' }];
    const doc = new Y.Doc();
    jsonToYDoc(json, doc);
    applyJsonPatchToYDoc(doc, patch);
    const result = doc.getMap('root').toJSON();
    expect(result).toEqual({ x: 1 });
  });

  it('should handle arrays', () => {
    const json = { items: [1, 2, 3] };
    const patch = [{ op: 'replace', path: '/items/1', value: 42 }];
    const doc = new Y.Doc();
    jsonToYDoc(json, doc);
    applyJsonPatchToYDoc(doc, patch);
    const result = doc.getMap('root').toJSON();
    expect(result).toEqual({ items: [1, 42, 3] });
  });
});

describe('Yjs Observer and JSON Patches', () => {
  it('should track changes and emit JSON patches', (done) => {
    const doc = new Y.Doc();
    const rootMap = doc.getMap('root');
    rootMap.set('user', { name: 'Alice', age: 25 });

    observeYDocForPatches(doc, (patches) => {
      expect(patches).toEqual([
        { op: 'replace', path: '/user', value: { name: 'Alice', age: 25 } }
      ]);
      done();
    });

    createPatch(doc, 'user/name', 'Bob');
  });

  it('should handle nested JSON patches correctly', (done) => {
    const doc = new Y.Doc();
    const rootMap = doc.getMap('root');
    rootMap.set('user', {
      name: 'Alice',
      details: {
        location: { city: 'NYC', zip: '10001' },
        skills: ['JavaScript', 'TypeScript'],
      },
    });

    observeYDocForPatches(doc, (patches) => {
      expect(patches).toEqual([
        { op: 'replace', path: '/user/details/location/city', value: 'SF' }
      ]);
      done();
    });

    createPatch(doc, 'user/details/location/city', 'SF');
  });

  it('should generate patches for array changes', (done) => {
    const doc = new Y.Doc();
    const rootMap = doc.getMap('root');
    rootMap.set('skills', ['JavaScript', 'Python']);

    observeYDocForPatches(doc, (patches) => {
      expect(patches).toEqual([
        { op: 'replace', path: '/skills/0', value: 'TypeScript' }
      ]);
      done();
    });

    createPatch(doc, 'skills/0', 'TypeScript');
  });
});
