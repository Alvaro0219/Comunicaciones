// Hub central de Server-Sent Events. Mantiene las conexiones abiertas del dashboard
// y difunde eventos (lecturas, riegos, alertas, estado de nodos) filtrando por dueño:
// el admin recibe todo, los demás roles solo eventos de sus propias macetas.

let nextClientId = 1;
const clients = new Map(); // id -> { res, user }

export function addClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');

  const id = nextClientId++;
  clients.set(id, { res, user: req.user });

  req.on('close', () => {
    clients.delete(id);
  });
}

export function broadcast(type, payload, ownerId = null) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  const owner = ownerId ? String(ownerId) : null;
  for (const { res, user } of clients.values()) {
    if (user.role === 'admin' || !owner || owner === String(user.sub)) {
      res.write(msg);
    }
  }
}

// Heartbeat para que proxies/CDNs no corten conexiones inactivas
const heartbeat = setInterval(() => {
  for (const { res } of clients.values()) res.write(': ping\n\n');
}, 25000);
heartbeat.unref();
