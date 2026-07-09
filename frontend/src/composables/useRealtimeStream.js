import { ref, onMounted, onUnmounted } from 'vue';
import { getStreamToken, buildStreamUrl } from '../services/api.js';

// Conexión SSE al backend. Los tokens de stream son efímeros (~60s), por lo que
// ante cualquier corte se pide un token nuevo y se reabre la conexión.
export function useRealtimeStream(handlers = {}) {
  const connected = ref(false);
  let source = null;
  let stopped = false;
  let retryTimer = null;

  async function connect() {
    if (stopped) return;
    try {
      const { token } = await getStreamToken();
      if (stopped) return;
      source = new EventSource(buildStreamUrl(token));

      source.onopen = () => { connected.value = true; };

      for (const [event, handler] of Object.entries(handlers)) {
        source.addEventListener(event, (e) => {
          try {
            handler(JSON.parse(e.data));
          } catch (err) {
            console.error(`Error en handler SSE '${event}':`, err);
          }
        });
      }

      source.onerror = () => {
        connected.value = false;
        source?.close();
        source = null;
        scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, 3000);
  }

  onMounted(connect);
  onUnmounted(() => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  });

  return { connected };
}
