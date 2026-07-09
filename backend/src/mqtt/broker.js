// Broker MQTT embebido (Aedes) — capa de ingesta desde hardware real (ESP32).
// Decisión técnica (sección 11 del prompt funcional): MQTT sobre TCP es liviano,
// de bajo consumo, soporta múltiples nodos identificados individualmente y tolera
// reconexiones. Contrato de topics:
//   gda/{nodeId}/telemetry  (nodo -> backend)  telemetría periódica
//   gda/{nodeId}/command    (backend -> nodo)  órdenes de riego
//   gda/{nodeId}/ack        (nodo -> backend)  confirmación de ejecución
// Autenticación: username = nodeId, password = deviceToken de la maceta registrada.

import Aedes from 'aedes';
import { createServer } from 'net';
import { Pot } from '../models/Pot.js';

let aedes = null;

export function startBroker({ port, onTelemetry, onAck, onNodeStatus }) {
  aedes = new Aedes();

  aedes.authenticate = async (client, username, password, done) => {
    try {
      const nodeId = username;
      const token = password?.toString();
      const pot = await Pot.findOne({ nodeId, isActive: true }).select('deviceToken').lean();
      if (!pot || pot.deviceToken !== token) {
        const err = new Error('Auth error');
        err.returnCode = 4; // bad username or password
        return done(err, false);
      }
      client.nodeId = nodeId;
      return done(null, true);
    } catch (err) {
      return done(err, false);
    }
  };

  // Un nodo solo puede publicar en SUS topics y suscribirse a SU canal de comandos
  aedes.authorizePublish = (client, packet, done) => {
    const allowed = [`gda/${client.nodeId}/telemetry`, `gda/${client.nodeId}/ack`];
    done(allowed.includes(packet.topic) ? null : new Error('Topic no autorizado'));
  };

  aedes.authorizeSubscribe = (client, sub, done) => {
    if (sub.topic === `gda/${client.nodeId}/command`) return done(null, sub);
    return done(new Error('Topic no autorizado'));
  };

  aedes.on('publish', async (packet, client) => {
    if (!client) return; // mensajes internos del broker
    const match = /^gda\/([^/]+)\/(telemetry|ack)$/.exec(packet.topic);
    if (!match) return;
    const [, nodeId, channel] = match;

    let payload;
    try {
      payload = JSON.parse(packet.payload.toString());
    } catch {
      console.warn(`Payload MQTT no es JSON válido (${packet.topic})`);
      return;
    }

    try {
      if (channel === 'telemetry') await onTelemetry(nodeId, payload);
      else await onAck(nodeId, payload);
    } catch (err) {
      console.error(`Error procesando ${packet.topic}:`, err);
    }
  });

  aedes.on('client', (client) => {
    if (client.nodeId) onNodeStatus(client.nodeId, true).catch(console.error);
  });

  aedes.on('clientDisconnect', (client) => {
    if (client.nodeId) onNodeStatus(client.nodeId, false).catch(console.error);
  });

  const server = createServer(aedes.handle);
  server.listen(port, () => {
    console.log(`Broker MQTT escuchando en puerto ${port}`);
  });
  return server;
}

export function publishCommand(nodeId, payload) {
  if (!aedes) {
    console.warn('Broker MQTT no iniciado: comando no publicado');
    return false;
  }
  aedes.publish({
    topic: `gda/${nodeId}/command`,
    payload: Buffer.from(JSON.stringify(payload)),
    qos: 1,
    retain: false
  }, (err) => {
    if (err) console.error(`Error publicando comando a ${nodeId}:`, err.message);
  });
  return true;
}
