<template>
  <ModalComponent :show="show" @close="emit('close')">
    <div class="title is-5 mb-4">Create a patch-only JSON Doc</div>
    <p class="help">
          This JSON Doc is not editable within the UI, which only gives a read-only view.
          To update the JSON Doc, clients need to use WebSocket (URL defined at the creation time
          of JSON Doc) to send JSON patches following the patterns of {"type": "patch", "name": JSON Doc name, "data": JSON patches (RFC 6902)}.
          For example,
          {"type":"patch","name":"stream1","data":[{"op":"add","path":"/status","value":"inactive"}]}
        </p>
    <div class="field">
      <label class="label">Name</label>
      <div class="control has-icons-left">
        <input
          autofocus
          class="input"
          type="text"
          placeholder="e.g. project-updates"
          v-model="name"
        />
        <span class="icon is-small is-left">
          <FontAwesomeIcon :icon="faLink" />
        </span>
        <p class="help">
          The name of the JSON Doc.
        </p>
      </div>
      <label class="label">JSON Patch URL</label>
      <div class="control has-icons-left">
        <input
          autofocus
          class="input"
          type="text"
          placeholder="e.g. ws://localhost:8080"
          v-model="jsonUrl"
        />
        <span class="icon is-small is-left">
          <FontAwesomeIcon :icon="faServer" />
        </span>
        <p class="help">
          The distribution point of JSON patches.
        </p>
      </div>
    </div>

    <div class="field has-text-right">
      <div class="control">
        <button class="button mr-2" @click="emit('close')">Cancel</button>
        <button class="button is-primary soft-if-dark" @click="create">Create</button>
      </div>
    </div>
  </ModalComponent>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faLink, faServer } from '@fortawesome/free-solid-svg-icons';

import ModalComponent from './ModalComponent.vue';

import { Workspace } from '@/services/workspace';
import { Toast } from '@/utils/toast';

defineProps({
  show: {
    type: Boolean,
    required: true,
  },
});
const emit = defineEmits(['close']);
const router = useRouter();

const name = ref(String());
const jsonUrl = ref(String());

async function create() {
  try {
    // 1-40 characters
    if (name.value.length < 1 || name.value.length > 40) {
      Toast.error('JSON Doc name must be between 1 and 40 characters');
      return;
    }

    // Validate characters are only alphanumeric, hyphen, and underscore
    if (!/^[a-zA-Z0-9_-]+$/.test(name.value)) {
      Toast.error('JSON Doc name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    // Get workspace
    const wksp = await Workspace.setupOrRedir(router);
    if (!wksp) return;

    // Check if ydoc already exists
    const ydocs = await wksp.ext.getYjsdocs();
    if (ydocs.some((c) => c.name === name.value)) {
      Toast.error('JSON Doc with this name already exists');
      return;
    }

    // Create Yjs Doc for this JSON
    await wksp.ext.newYjsdoc({
      uuid: String(), // auto
      name: name.value,
      url: jsonUrl.value
    });

    Toast.success(`JSON Doc #${name.value} created`);
    emit('close');
    name.value = String();
  } catch (err) {
    console.error(err);
    Toast.error(`${err}`);
  }
}
</script>
