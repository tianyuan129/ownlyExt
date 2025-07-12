<template>
  <div class="box">
    <!-- Document Info Header -->
    <div class="doc-info-header mb-4">
      <div class="level">
        <div class="level-left">
          <div class="level-item">
            <div>
              <h4 class="title is-5">{{ docName }}</h4>
              <p class="subtitle is-6">Last updated: {{ lastUpdate }}</p>
            </div>
          </div>
        </div>
        <div class="level-right">
          <div class="level-item">
            <div class="token-display">
              <label class="label is-small">Current Session Token:</label>
              <div class="field has-addons">
                <div class="control is-expanded">
                  <input 
                    class="input is-small" 
                    type="text" 
                    :value="currentToken || 'No active connection'" 
                    readonly
                  />
                </div>
                <div class="control">
                  <button 
                    class="button is-small is-light" 
                    @click="copyToken"
                    :disabled="!currentToken"
                    title="Copy token"
                  >
                    📋
                  </button>
                </div>
              </div>
              <p class="help is-size-7">Share this token with external applications to connect</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- JSON Content -->
    <JsonViewer :value="jsonData" copyable boxed sort theme="dark" />
  </div>
</template>

<script setup lang="ts">
import { JsonViewer } from 'vue3-json-viewer';
import 'vue3-json-viewer/dist/index.css';
import { Toast } from '@/utils/toast';
import {
  ref,
  computed,
  shallowRef,
  onMounted,
  onUnmounted,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Workspace } from '@/services/workspace';

const wksp = shallowRef<Workspace | null>(null);
const router = useRouter();
const route = useRoute();
const docName = computed(() => route.params.yjsdoc as string);
const lastUpdate = ref('');
const jsonData = ref<any>({});
const currentToken = ref<string | undefined>();
const currentDoc = ref<any | null>(null);

onMounted(async () => {
  await setup();
  wksp.value?.ext.events.addListener('ext', onExtUpdate);
});

onUnmounted(() => {
  wksp.value?.ext.events.removeListener('ext', onExtUpdate);
});

watch(docName, setup);

async function setup() {
  try {
    wksp.value = await Workspace.setupOrRedir(router);
    if (!wksp.value) return;

    const ydocs = await wksp.value.ext.getYjsdocs();
    const result = ydocs.find((d) => d.name === docName.value);
    if (!result) return;

    currentDoc.value = result;
    const doc = await wksp.value.ext.getYjsdoc(result.uuid);
    const map = doc.getMap('root');
    jsonData.value = map.toJSON();

    // Set last updated time
    lastUpdate.value = result.lastUpdated ? new Date(result.lastUpdated).toLocaleString() : 'Never';

    // Attempt to establish/re-establish the WebSocket connection
    await wksp.value.ext.connect(result);
    
    // Get the session token after connecting
    currentToken.value = wksp.value.ext.getSessionToken(result.uuid);
  } catch (err) {
    Toast.error('Failed to establish connection. Please try again.');
    console.error('WS Setup Error:', err);
  }
}

// Handle update event
function onExtUpdate(uuid: string, timestamp: string) {
  if (currentDoc.value && uuid === currentDoc.value.uuid) {
    lastUpdate.value = new Date(timestamp).toLocaleString();
    const doc = wksp.value?.ext.getYjsdoc(uuid);
    doc?.then((d) => {
      jsonData.value = d.getMap('root').toJSON();
    });
  }
}

// Copy token to clipboard
async function copyToken() {
  if (!currentToken.value) return;
  
  try {
    await navigator.clipboard.writeText(currentToken.value);
    Toast.success('Token copied to clipboard!');
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = currentToken.value;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    Toast.success('Token copied to clipboard!');
  }
}
</script>

<style>
.box {
  margin-top: 1rem;
}

.doc-info-header {
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 1rem;
}

.token-display {
  min-width: 300px;
}

.token-display .input {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.8rem;
  background-color: #f5f5f5;
}

.token-display .label {
  margin-bottom: 0.25rem;
  font-weight: 600;
  color: #4a4a4a;
}

.token-display .help {
  margin-top: 0.25rem;
  color: #757575;
}

@media (max-width: 768px) {
  .level {
    display: block !important;
  }
  
  .level-right {
    margin-top: 1rem;
  }
  
  .token-display {
    min-width: auto;
    width: 100%;
  }
}
</style>
