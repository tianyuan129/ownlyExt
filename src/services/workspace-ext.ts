import { EventEmitter } from 'events';
import * as Y from 'yjs';
import { nanoid } from 'nanoid';

import { GlobalBus } from '@/services/event-bus';
import { SvsProvider } from '@/services/svs-provider';
import type { IExtYdoc } from '@/services/types';
import { wsConn } from '@/utils/wsconn';
import { applyJsonPatchToYDoc, observeYDocForPatches, jsonToYDoc, convertYTypeToJson } from '@/utils/json-to-ymap';
import type TypedEmitter from 'typed-emitter';
import type { WorkspaceAPI } from './ndn';
import type { Operation } from 'fast-json-patch';

type ExtEvents = {
  ext: (uuid: string, timestamp: string) => void;
};

export class WorkspaceExt {
  private readonly extYjsdocs: Y.Array<IExtYdoc>;
  public readonly events = new EventEmitter() as TypedEmitter<ExtEvents>;
  // Profile token for this workspace (unique per browser profile and workspace)
  private workspaceProfileToken: string | null = null;

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
    const yjsdocs = this.extYjsdocs.toArray();
    // Add profile token and last updated info to each doc
    const profileToken = this.getOrCreateProfileToken();
    return yjsdocs.map(doc => ({
      ...doc,
      currentToken: profileToken,
      lastUpdated: this.getLastUpdated()
    }));
  }

  private generateProfileToken(): string {
    return 'tok_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private getOrCreateProfileToken(): string {
    // Return cached token if already loaded
    if (this.workspaceProfileToken) {
      return this.workspaceProfileToken;
    }

    // Check localStorage for existing workspace profile token
    const storageKey = `ownly_profile_token_${this.api.group}`;
    const existingToken = localStorage.getItem(storageKey);

    if (existingToken) {
      this.workspaceProfileToken = existingToken;
      return existingToken;
    }

    // Generate new profile token and store in localStorage
    const newToken = this.generateProfileToken();
    this.workspaceProfileToken = newToken;
    localStorage.setItem(storageKey, newToken);

    return newToken;
  }

  private getLastUpdated(): string | undefined {
    try {
      // Try to get last updated from the document metadata
      // This is a simple implementation - in practice you might want to store this separately
      return new Date().toISOString(); // Placeholder - could be enhanced to track actual updates
    } catch {
      return undefined;
    }
  }

  public getProfileToken(): string {
    return this.getOrCreateProfileToken();
  }

  public async connect(yjsdoc: IExtYdoc) {
    // Get the profile token for this workspace
    const profileToken = this.getOrCreateProfileToken();

    // WebSocket listener
    const doc = await this.getYjsdoc(yjsdoc.uuid)

    // Helper function to convert Yjs doc to JSON
    const convertDocToJson = () => {
      const rootMap = doc.getMap('root');
      return convertYTypeToJson(rootMap);
    };

    // receive
    const socket = await wsConn(yjsdoc.url, (msg: string) => {
      try {
        const { type, name, data, token } = JSON.parse(msg);
        // console.log(JSON.parse(msg))

        // Handle registration response
        if (type === 'registered') {
          console.log(`✅ [Ownly] Token registered successfully for ${yjsdoc.name}`);
          return;
        }

        // Handle errors
        if (type === 'error') {
          console.error(`❌ [Ownly] Relay error: ${data || 'Unknown error'}`);
          return;
        }

        // Validate token only if both profile token and incoming token exist
        if (profileToken && token && token !== profileToken) {
          console.warn(`Token mismatch: expected ${profileToken}, got ${token}`);
          return;
        }

        if (name !== yjsdoc.name) return;

        if (type === 'patch') {
          applyJsonPatchToYDoc(doc, data);
          this.events.emit('ext', yjsdoc.uuid, Date().toString());
        } else if (type === 'pull') {
          // Respond to pull request from other connection
          const jsonData = convertDocToJson();
          const response = JSON.stringify({
            type: 'pull_response',
            name: yjsdoc.name,
            token: profileToken,
            data: jsonData,
          });
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(response);
          }
        } else if (type === 'push') {
          // Unconditionally replace the entire document with incoming JSON
          if (data) {
            doc.transact(() => {
              // Clear the existing root map
              const rootMap = doc.getMap('root');
              rootMap.clear();

              // Apply the new JSON data
              jsonToYDoc(data, doc);
            }, 'external_push'); // Use special origin to identify push operations

            this.events.emit('ext', yjsdoc.uuid, Date().toString());
          }
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });

    // Send registration message first to register token with relay
    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        const registerMessage = JSON.stringify({
          type: 'register',
          token: profileToken,
        });
        socket.send(registerMessage);
        console.log(`📝 [Ownly] Registering token for ${yjsdoc.name}`);
      }
    }, 500); // Wait 0.5s for connection to stabilize

    // send
    observeYDocForPatches(doc, (patches: Operation[]) => {
      this.events.emit('ext', yjsdoc.uuid, Date().toString());
      if (socket.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          type: 'patch',
          name: yjsdoc.name,
          token: profileToken,
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

    // Initial metadata (no token stored)
    ydata.set('name', yjsdoc.name);
    ydata.set('uuid', yjsdoc.uuid);
    ydata.set('url', yjsdoc.url);
    ydata.set('createdAt', Date().toString());
    ydata.set('lastUpdated', Date().toString());
  }

  public async getYjsdoc(uuid: string): Promise<Y.Doc> {
    const yjsdocs = await this.getYjsdocs();
    if (yjsdocs.find((d) => d.uuid === uuid)) {
      return await this.provider.getDoc(uuid);
    }
    throw new Error('Yjs document does not exist');
  }
}
