import { createServer } from 'node:http';
import { lateFeeCents } from './fees.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/fees') {
      const due = url.searchParams.get('due');
      const returned = url.searchParams.get('returned');
      if (!DAY.test(due ?? '') || !DAY.test(returned ?? '')) {
        send(res, 400, { error: 'due and returned must be YYYY-MM-DD dates' });
        return;
      }
      send(res, 200, { feeCents: lateFeeCents(due, returned) });
      return;
    }
    send(res, 404, { error: 'not found' });
  });
}
