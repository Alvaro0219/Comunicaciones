// Cliente MQTT contra el broker en la nube (HiveMQ Cloud, TLS 8883).
// El broker es el punto fijo del sistema: el nodo ESP32 y este backend se
// conectan a él desde donde estén — no hace falta compartir red.
//
// Contrato de topics (definido por el firmware del nodo, ver GDA Guia Setup):
//   {PREFIX}/{nodeId}/telemetria   nodo -> broker   lecturas + diagnóstico (rssi, ip, heap)
//   {PREFIX}/{nodeId}/comando      backend -> nodo  {"activar_riego":true,"duracion_seg":5}
//   {PREFIX}/{nodeId}/evento       nodo -> broker   confirmación de riego ejecutado
//
// Reglas de equipo que este módulo respeta:
//   - MQTT_CLIENT_ID único por persona (dos backends con el mismo ID se patean mutuamente).
//   - TOPIC_PREFIX propio en desarrollo (gda/dev-xxx); gda/prod es solo del nodo real
//     y del backend desplegado.
//   - MODO_ESCRITURA=false en local: el backend evalúa y loguea, pero NUNCA publica
//     comandos de riego. Solo el backend desplegado corre con true.

import mqttLib from 'mqtt';
import { env } from '../config/env.js';

let client = null;

export function isWriteMode() {
  return env.mqtt.writeMode;
}

export function startMqtt({ onTelemetry, onEvent }) {
  if (!env.mqtt.host) {
    console.warn('MQTT_HOST vacío: capa MQTT deshabilitada (configurar backend/.env)');
    return null;
  }

  const prefix = env.mqtt.topicPrefix;
  const url = `mqtts://${env.mqtt.host}:${env.mqtt.port}`;

  client = mqttLib.connect(url, {
    username: env.mqtt.user,
    password: env.mqtt.pass,
    clientId: env.mqtt.clientId,
    reconnectPeriod: 5000
  });

  client.on('connect', () => {
    console.log(`Conectado a HiveMQ (${env.mqtt.clientId}, prefijo ${prefix}, escritura=${env.mqtt.writeMode})`);
    client.subscribe(`${prefix}/+/telemetria`, { qos: 1 });
    client.subscribe(`${prefix}/+/evento`, { qos: 1 });
  });

  client.on('error', (err) => {
    console.error('Error MQTT:', err.message);
  });

  client.on('message', async (topic, buf) => {
    if (!topic.startsWith(`${prefix}/`)) return;
    const [nodeId, channel] = topic.slice(prefix.length + 1).split('/');
    if (!nodeId || !channel) return;

    let payload;
    try {
      payload = JSON.parse(buf.toString());
    } catch {
      console.warn(`Payload MQTT no es JSON válido (${topic})`);
      return;
    }

    try {
      if (channel === 'telemetria') await onTelemetry(nodeId, payload);
      else if (channel === 'evento') await onEvent(nodeId, payload);
    } catch (err) {
      console.error(`Error procesando ${topic}:`, err);
    }
  });

  return client;
}

// Publica una orden de riego. Devuelve false si no puede (sin conexión) o no
// debe (modo lectura) — en ese caso solo loguea lo que habría hecho.
export function publishCommand(nodeId, payload) {
  if (!client || !client.connected) {
    console.warn(`MQTT desconectado: comando a ${nodeId} no publicado`);
    return false;
  }
  if (!env.mqtt.writeMode) {
    console.log(`[solo lectura] habría publicado a ${nodeId}:`, JSON.stringify(payload));
    return false;
  }
  client.publish(`${env.mqtt.topicPrefix}/${nodeId}/comando`, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error(`Error publicando comando a ${nodeId}:`, err.message);
  });
  return true;
}
