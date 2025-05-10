import { EventEmitter } from 'events';
import * as Y from 'yjs';
import { nanoid } from 'nanoid';

import { GlobalBus } from '@/services/event-bus';
import { SvsProvider } from '@/services/svs-provider';
import type { IExtYdoc } from '@/services/types';
import { wsConn } from '@/utils/wsconn';
import { applyJsonPatchToYDoc, observeYDocForPatches } from '@/utils/json-to-ymap';
import type TypedEmitter from 'typed-emitter';
import type { WorkspaceAPI } from './ndn';
import type { Operation } from 'fast-json-patch';

type ExtEvents = {
  ext: (uuid: string, timestamp: string) => void;
};

export class WorkspaceExt {
  private readonly extYjsdocs: Y.Array<IExtYdoc>;
  public readonly events = new EventEmitter() as TypedEmitter<ExtEvents>;

  private constructor(
    private readonly api: WorkspaceAPI,
    private readonly doc: Y.Doc,
    private readonly provider: SvsProvider
  ) {
    this.extYjsdocs = doc.getArray<IExtYdoc>("_list_");

    const ydocObserver = () =>
      GlobalBus.emit('ext-yjsdocs', this.extYjsdocs.toArray());

    this.extYjsdocs.observe(ydocObserver);
    ydocObserver();
  }

  public static async create(api: WorkspaceAPI, provider: SvsProvider): Promise<WorkspaceExt> {
    const doc = await provider.getDoc("ext");
    return new WorkspaceExt(api, doc, provider);
  }

  public async destroy() {
    this.doc.destroy();
  }

  public async getYjsdocs(): Promise<IExtYdoc[]> {
    return this.extYjsdocs.toArray();
  }

  public async connect(yjsdoc: IExtYdoc) {
    // WebSocket listener
    const doc = await this.getYjsdoc(yjsdoc.uuid)

    // receive
    const socket = await wsConn(yjsdoc.url, (msg: string) => {
      try {
        const { type, name, data } = JSON.parse(msg);
        if (name !== yjsdoc.name) return;
        if (type === 'patch') {
          applyJsonPatchToYDoc(doc, data);
          this.events.emit('ext', yjsdoc.uuid, Date().toString());
        }
      } catch (err) {
        console.error('Error handling patch:', err);
      }
    });

    // send
    observeYDocForPatches(doc, (patches: Operation[]) => {
      if (socket.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          type: 'patch',
          name: yjsdoc.name,
          data: patches,
        });
        socket.send(message);
      } else {
        console.warn('WebSocket not open; patch not sent.');
      }
    });
  }
  public async newYjsdoc(yjsdoc: IExtYdoc) {
    const yjsdocs = await this.getYjsdocs();
    if (yjsdocs.some((d) => d.name === yjsdoc.name)) {
      throw new Error('Yjs doc already exists');
    }

    yjsdoc.uuid = nanoid();
    this.extYjsdocs.push([yjsdoc]);

    const newDoc = await this.provider.getDoc(yjsdoc.uuid);
    const ydata = newDoc.getMap('root');

    // Initial metadata
    ydata.set('name', yjsdoc.name);
    ydata.set('uuid', yjsdoc.uuid);
    ydata.set('url', yjsdoc.url);
    ydata.set('createdAt', Date().toString());
  }

  public async getYjsdoc(uuid: string): Promise<Y.Doc> {
    const yjsdocs = await this.getYjsdocs();
    if (yjsdocs.find((d) => d.uuid === uuid)) {
      return await this.provider.getDoc(uuid);
    }
    throw new Error('Yjs document does not exist');
  }
}
