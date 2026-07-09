// Simulador de nodos ESP32 para el GDA.
// Reproduce el contrato MQTT real (telemetry/command/ack), incluyendo el buffer
// offline con retransmisión idempotente, para probar todo el sistema sin hardware.
//
// Uso:
//   node index.js --node <nodeId>:<deviceToken> [--node otro:token ...]
//                 [--server mqtt://localhost:1883] [--interval 15] [--offline-chance 0]
//
// Los nodeId/deviceToken salen de crear la maceta en el dashboard (diálogo de credenciales).

import mqtt from 'mqtt';

const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
function getAllFlags(name) {
  const out = [];
  args.forEach((a, i) => { if (a === `--${name}`) out.push(args[i + 1]); });
  return out;
}

const SERVER = getFlag('server', 'mqtt://localhost:1883');
const INTERVAL_SEC = Number(getFlag('interval', 15)); // ciclo real: 10 min; acelerado para demo
const OFFLINE_CHANCE = Number(getFlag('offline-chance', 0)); // 0..1: prob. de simular un corte por ciclo

const nodeSpecs = getAllFlags('node').map(spec => {
  const [nodeId, token] = spec.split(':');
  if (!nodeId || !token) {
    console.error(`--node inválido: "${spec}" (formato esperado nodeId:deviceToken)`);
    process.exit(1);
  }
  return { nodeId, token };
});

if (nodeSpecs.length === 0) {
  console.error('Uso: node index.js --node <nodeId>:<deviceToken> [--node ...] [--server mqtt://host:1883] [--interval seg] [--offline-chance 0..1]');
  process.exit(1);
}

class SimulatedNode {
  constructor({ nodeId, token }) {
    this.nodeId = nodeId;
    this.token = token;
    this.soilMoisture = 55 + Math.random() * 15;
    this.airHumidity = 50 + Math.random() * 20;
    this.buffer = []; // lecturas acumuladas durante un corte simulado
    this.offlineUntil = 0;
    this.connect();
  }

  log(msg) {
    console.log(`[${this.nodeId}] ${msg}`);
  }

  connect() {
    this.client = mqtt.connect(SERVER, {
      username: this.nodeId,
      password: this.token,
      clientId: this.nodeId,
      reconnectPeriod: 3000,
      clean: false
    });

    this.client.on('connect', () => {
      this.log('conectado al broker');
      this.client.subscribe(`gda/${this.nodeId}/command`, { qos: 1 });
      this.flushBuffer();
    });

    this.client.on('message', (topic, payload) => {
      try {
        const cmd = JSON.parse(payload.toString());
        this.handleCommand(cmd);
      } catch (e) {
        this.log(`comando ilegible: ${e.message}`);
      }
    });

    this.client.on('error', (err) => this.log(`error MQTT: ${err.message}`));

    this.timer = setInterval(() => this.tick(), INTERVAL_SEC * 1000);
  }

  // Simulación física: el suelo se seca de a poco; temp con onda diaria + ruido
  currentTemperature() {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const base = 22 + 8 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    return Math.round((base + (Math.random() * 2 - 1)) * 10) / 10;
  }

  takeReading() {
    this.soilMoisture = Math.max(0, this.soilMoisture - (0.8 + Math.random() * 1.2));
    this.airHumidity = Math.min(100, Math.max(10, this.airHumidity + (Math.random() * 6 - 3)));
    return {
      soilMoisture: Math.round(this.soilMoisture * 10) / 10,
      temperature: this.currentTemperature(),
      airHumidity: Math.round(this.airHumidity * 10) / 10,
      measuredAt: Math.floor(Date.now() / 1000)
    };
  }

  tick() {
    const reading = this.takeReading();
    const isOffline = Date.now() < this.offlineUntil;

    if (!isOffline && OFFLINE_CHANCE > 0 && Math.random() < OFFLINE_CHANCE) {
      // Simular corte de conectividad por 3 ciclos: se acumulan lecturas en buffer
      this.offlineUntil = Date.now() + 3 * INTERVAL_SEC * 1000;
      this.log(`simulando corte de conectividad (${3 * INTERVAL_SEC}s)…`);
    }

    if (Date.now() < this.offlineUntil || !this.client.connected) {
      this.buffer.push(reading);
      this.log(`offline: lectura almacenada localmente (${this.buffer.length} en buffer)`);
      return;
    }

    this.flushBuffer();
    this.publishTelemetry({ ...reading, source: 'live' });
    this.log(`telemetría enviada: suelo ${reading.soilMoisture}% | ${reading.temperature}°C | aire ${reading.airHumidity}%`);
  }

  flushBuffer() {
    if (!this.client.connected || this.buffer.length === 0) return;
    this.log(`retransmitiendo ${this.buffer.length} lectura(s) acumuladas…`);
    for (const reading of this.buffer) {
      this.publishTelemetry({ ...reading, source: 'replay' });
    }
    this.buffer = [];
  }

  publishTelemetry(payload) {
    this.client.publish(`gda/${this.nodeId}/telemetry`, JSON.stringify(payload), { qos: 1 });
  }

  handleCommand(cmd) {
    if (cmd.action !== 'regar') return;
    this.log(`orden de riego recibida (${cmd.durationSec}s), regando…`);
    setTimeout(() => {
      // El riego sube la humedad del suelo proporcionalmente a la duración
      this.soilMoisture = Math.min(100, this.soilMoisture + cmd.durationSec * 3);
      const ack = {
        commandId: cmd.commandId,
        ok: true,
        executedDurationSec: cmd.durationSec,
        detail: 'Riego ejecutado correctamente'
      };
      this.client.publish(`gda/${this.nodeId}/ack`, JSON.stringify(ack), { qos: 1 });
      this.log(`riego completado, ack enviado (suelo ahora ${Math.round(this.soilMoisture)}%)`);
    }, Math.min(cmd.durationSec, 10) * 1000);
  }
}

console.log(`Simulador GDA — servidor ${SERVER}, intervalo ${INTERVAL_SEC}s, ${nodeSpecs.length} nodo(s)`);
nodeSpecs.forEach(spec => new SimulatedNode(spec));
