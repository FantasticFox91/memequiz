<script setup lang="ts">
import { type LeaderboardResponse, nicknameKey } from '@memequiz/shared';

const participant = useParticipantStore();
const api = useApi();

const entries = ref<LeaderboardResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    entries.value = await api<LeaderboardResponse>('/leaderboard');
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

// ники на сайте уникальны, поэтому себя можно узнать по нику
const isMe = (nickname: string) =>
  !!participant.nicknameKey && nicknameKey(nickname) === participant.nicknameKey;
</script>

<template>
  <section>
    <h1>Лидерборд</h1>

    <div v-if="loading && !entries" class="center">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <div v-else-if="error" class="center">
      <p class="error-text">{{ error }}</p>
      <button class="btn" type="button" @click="load">Повторить</button>
    </div>

    <p v-else-if="entries && entries.length === 0" class="hint center">
      Пока никто не прошёл викторину. Будь первым!
    </p>

    <table v-else-if="entries" class="table">
      <thead>
        <tr>
          <th class="rank">#</th>
          <th>Ник</th>
          <th class="num">Баллы</th>
          <th class="time">Время</th>
          <th class="date">Когда</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.rank" :class="{ me: isMe(entry.nickname) }">
          <td class="rank">{{ entry.rank }}</td>
          <td class="nick">{{ entry.nickname }}</td>
          <td class="num">{{ entry.score }}/{{ entry.total }}</td>
          <td class="time">{{ formatDuration(entry.durationMs) }}</td>
          <td class="date">{{ dateFormat.format(new Date(entry.createdAt)) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  text-align: center;
}

.table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 15px;
}

th {
  padding: 8px 6px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  color: var(--hint);
}

td {
  padding: 10px 6px;
  border-top: 1px solid var(--secondary-bg);
}

.rank {
  width: 36px;
  color: var(--hint);
}

.nick {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.num {
  width: 64px;
  text-align: right;
  font-weight: 600;
}

/* при равных баллах место решает время */
.time {
  width: 60px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.date {
  width: 104px;
  text-align: right;
  font-size: 13px;
  color: var(--hint);
}

/* узкий экран: дата нужна меньше всего */
@media (max-width: 400px) {
  .date {
    display: none;
  }
}

tr.me td {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

tr.me .rank,
tr.me .date {
  color: var(--text);
}
</style>
