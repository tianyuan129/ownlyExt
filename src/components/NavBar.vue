<template>
  <aside class="menu main-nav has-background-primary soft-if-dark">
    <div class="top-sheet">
      <router-link to="/" v-slot="{ navigate }">
        <img alt="logo" class="logo" src="@/assets/logo-white.svg" @click="navigate" />
      </router-link>

      <!-- non-workspace general routes -->
      <template v-if="routeIsDashboard">
        <p class="menu-label">General</p>
        <ul class="menu-list">
          <li>
            <router-link to="/">
              <FontAwesomeIcon class="mr-1" :icon="faTableCells" size="sm" />
              Dashboard</router-link
            >
          </li>
        </ul>

        <p class="menu-label">About</p>
        <ul class="menu-list">
          <li>
            <router-link to="/about">
              <FontAwesomeIcon class="mr-1" :icon="faCircleInfo" size="sm" />
              About</router-link
            >
          </li>
          <li>
            <a href="https://github.com/pulsejet/ownly" target="_blank">
              <FontAwesomeIcon class="mr-1" :icon="faGithub" size="sm" />
              GitHub
            </a>
          </li>
        </ul>
      </template>

      <template v-if="routeIsWorkspace">
        <p class="menu-label">Projects</p>
        <ul class="menu-list">
          <li v-for="proj in projects" :key="proj.uuid">
            <router-link :to="linkProject(proj)">
              <div class="link-inner">
                <FontAwesomeIcon class="mr-1" :icon="faLayerGroup" size="sm" />
                {{ proj.name }}
              </div>

              <ProjectTreeMenu
                v-if="activeProjectName === proj.uuid"
                class="link-button"
                :allow-new="true"
                :allow-delete="false"
                @new-file="projectTree?.[0]?.newHere('file', $event)"
                @new-folder="projectTree?.[0]?.newHere('folder')"
                @import="projectTree?.[0]?.importHere()"
                @import-zip="projectTree?.[0]?.importZipHere()"
                @export="projectTree?.[0]?.executeExport(null)"
              />
            </router-link>

            <ProjectTree
              v-if="activeProjectName == proj.uuid"
              class="outermost"
              ref="projectTree"
              :project="proj"
              :files="projectFiles"
            />
          </li>

          <li>
            <a @click="showProjectModal = true">
              <FontAwesomeIcon class="mr-1" :icon="faPlus" size="sm" />
              Add project
            </a>
          </li>
        </ul>

        <p class="menu-label">Discussion</p>
        <ul class="menu-list">
          <li v-for="chan in channels" :key="chan.uuid">
            <router-link :to="linkDiscuss(chan)">
              <FontAwesomeIcon class="mr-1" :icon="faHashtag" size="sm" />
              {{ chan.name }}
            </router-link>
          </li>
          <li>
            <a @click="showChannelModal = true">
              <FontAwesomeIcon class="mr-1" :icon="faPlus" size="sm" />
              Add channel
            </a>
          </li>
        </ul>

        <p class="menu-label">Patch-Only JSON Doc</p>
        <ul class="menu-list">
          <li v-for="ydoc in yjsdocs" :key="ydoc.uuid">
            <router-link :to="linkExtYdocs(ydoc)">
              <FontAwesomeIcon class="mr-1" :icon="faLink" size="sm" />
              {{ ydoc.name }}
            </router-link>
          </li>
          <li>
            <a @click="showExtYdocModal = true">
              <FontAwesomeIcon class="mr-1" :icon="faPlus" size="sm" />
              Add JSON Doc
            </a>
          </li>
        </ul>

        <p class="menu-label">Workspace</p>
        <ul class="menu-list">
          <li>
            <a @click="showInviteModal = true">
              <FontAwesomeIcon class="mr-1" :icon="faPlus" size="sm" />
              Invite people
            </a>
          </li>
        </ul>
      </template>

      <p class="menu-label">v{{ buildVersion() }}</p>
    </div>

    <div class="bottom-sheet">
      <div class="id-share">
        <a @click="showIdentity = true">
          <FontAwesomeIcon class="mr-1" :icon="faQrcode" size="sm" />
          Share your Identity
        </a>
      </div>

      <div class="connection">
        <template v-if="connState.connected">
          <FontAwesomeIcon class="mr-1" :icon="faWifi" size="sm" />
          {{ connState.router }}
        </template>
        <template v-else>
          <FontAwesomeIcon class="mr-1" :icon="faGhost" size="sm" />
          Offline
        </template>
      </div>
    </div>

    <AddChannelModal :show="showChannelModal" @close="showChannelModal = false" />
    <AddExtYdocModal :show="showExtYdocModal" @close="showExtYdocModal = false" />
    <AddProjectModal :show="showProjectModal" @close="showProjectModal = false" />
    <InvitePeopleModal :show="showInviteModal" @close="showInviteModal = false" />
    <QRIdentityModal :show="showIdentity" @close="showIdentity = false" />
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';

import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import {
  faLayerGroup,
  faPlus,
  faHashtag,
  faLink,
  faWifi,
  faGhost,
  faTableCells,
  faQrcode,
  faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

import ProjectTree from './ProjectTree.vue';
import ProjectTreeMenu from './ProjectTreeMenu.vue';
import AddChannelModal from './AddChannelModal.vue';
import AddExtYdocModal from './AddExtYdocModal.vue';
import AddProjectModal from './AddProjectModal.vue';

import { GlobalBus } from '@/services/event-bus';
import { Toast } from '@/utils/toast';

import type { IChatChannel, IExtYdoc, IProject, IProjectFile } from '@/services/types';
import InvitePeopleModal from './InvitePeopleModal.vue';
import QRIdentityModal from './QRIdentityModal.vue';

const route = useRoute();
const routeIsDashboard = computed(() =>
  ['dashboard', 'join', 'about'].includes(String(route.name)),
);
const routeIsWorkspace = computed(() =>
  ['space-home', 'project', 'discuss', 'external', 'project-file'].includes(String(route.name)),
);

const showChannelModal = ref(false);
const showExtYdocModal = ref(false);
const showProjectModal = ref(false);
const showInviteModal = ref(false);
const showIdentity = ref(false);

// vue-tsc chokes on this type inference
const projectTree = useTemplateRef<Array<InstanceType<typeof ProjectTree>>>('projectTree');

const channels = ref([] as IChatChannel[]);
const yjsdocs = ref([] as IExtYdoc[]);

const projects = ref([] as IProject[]);
const activeProjectName = ref(null as string | null);
const projectFiles = ref([] as IProjectFile[]);

const connState = ref(globalThis._ndnd_conn_state);

const busListeners = {
  'project-list': (projs: IProject[]) => (projects.value = projs),
  'project-files': (name: string, files: IProjectFile[]) => {
    activeProjectName.value = name;
    projectFiles.value = files;
  },
  'chat-channels': (chans: IChatChannel[]) => (channels.value = chans),
  'ext-yjsdocs': (ydocs: IExtYdoc[]) => (yjsdocs.value = ydocs),
  'conn-change': () => {
    connState.value = globalThis._ndnd_conn_state;
    if (!connState.value.connected) {
      Toast.info('Disconnected - you are offline');
    }
  },
};

onMounted(async () => {
  GlobalBus.addListener('project-list', busListeners['project-list']);
  GlobalBus.addListener('project-files', busListeners['project-files']);
  GlobalBus.addListener('chat-channels', busListeners['chat-channels']);
  GlobalBus.addListener('ext-yjsdocs', busListeners['ext-yjsdocs']);
  GlobalBus.addListener('conn-change', busListeners['conn-change']);
});

onUnmounted(() => {
  GlobalBus.removeListener('project-list', busListeners['project-list']);
  GlobalBus.removeListener('project-files', busListeners['project-files']);
  GlobalBus.removeListener('chat-channels', busListeners['chat-channels']);
  GlobalBus.removeListener('ext-yjsdocs', busListeners['ext-yjsdocs']);
  GlobalBus.removeListener('conn-change', busListeners['conn-change']);
});

function buildVersion() {
  return __BUILD_VERSION__;
}

/** Link to project home page */
function linkProject(project: IProject) {
  return {
    name: 'project',
    params: {
      space: route.params.space,
      project: project.name,
    },
  };
}

/** Link to discussion channel */
function linkDiscuss(channel: IChatChannel) {
  return {
    name: 'discuss',
    params: {
      space: route.params.space,
      channel: channel.name,
    },
  };
}

/** Link to external Yjs documents */
function linkExtYdocs(yjsdoc: IExtYdoc) {
  return {
    name: 'external',
    params: {
      space: route.params.space,
      yjsdoc: yjsdoc.name,
    },
  };
}
</script>

<style scoped lang="scss">
@use '@/components/navbar-item.scss';

.main-nav {
  width: 230px;
  min-width: 230px;
  height: 100dvh;
  overflow-y: hidden;

  display: flex;
  flex-direction: column;
  .top-sheet {
    padding: 10px;
    flex: 1;
    overflow-y: auto;
  }
  .bottom-sheet {
    padding: 8px 10px;
    font-size: 0.9rem;

    a {
      color: #ccc;
    }

    .id-share {
      padding: 2px 12px;
    }

    .connection {
      border-radius: 50px;
      padding: 5px 12px;
      margin-top: 2px;
      color: #ddd;
      cursor: pointer;

      transition: background-color 0.2s ease;
      background-color: rgba(255, 255, 255, 0.05);
      &:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    }
  }

  .logo {
    display: block;
    height: 35px;
    margin: 5px;
    margin-bottom: 15px;
  }

  .menu-label {
    color: #bbb;
  }

  :deep(li > a) {
    background-color: transparent;
    color: white;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    &.is-active,
    &.router-link-active {
      background-color: var(--highlight-on-primary-color);
      color: var(--bulma-white-on-scheme);
    }
  }
}
</style>
