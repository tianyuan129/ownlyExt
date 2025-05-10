<template>
  <div class="box">
    <p>Last updated: {{ lastUpdate }}</p>
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

    const doc = await wksp.value.ext.getYjsdoc(result.uuid);
    const map = doc.getMap('root');
    jsonData.value = map.toJSON();

    // Attempt to establish/re-establish the WebSocket connection
    await wksp.value.ext.connect(result);
  } catch (err) {
    Toast.error('Failed to establish connection. Please try again.');
    console.error('WS Setup Error:', err);
  }
}

// Handle update event
function onExtUpdate(uuid: string, timestamp: string) {
  const currentUuid = jsonData.value?.uuid;
  if (uuid === currentUuid) {
    lastUpdate.value = new Date(timestamp).toLocaleString();
    const doc = wksp.value?.ext.getYjsdoc(uuid);
    doc?.then((d) => {
      jsonData.value = d.getMap('root').toJSON();
    });
  }
}
</script>

<style>
.box {
  margin-top: 1rem;
}
</style>
