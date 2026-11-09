import { createRequire } from 'node:module';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { Urgency } from '@careping/shared';
import type { Db } from './db.ts';
import { Engine, HttpError } from './engine.ts';
import type { Notifier } from './notifier.ts';
import { computeStats } from './stats.ts';

const require = createRequire(import.meta.url);

// หมายเหตุ: ช่วงพัฒนาใช้ userId ที่ส่งมาตรง ๆ แทนการล็อกอิน ต้องเปลี่ยนเป็น token ก่อนใช้งานจริง
export async function buildApi(deps: {
  db: Db;
  engine: Engine;
  notifier: Notifier;
  simulatorDir: string;
  simConfig: () => Promise<object>;
  tzOffsetMin: number;
  logger?: boolean;
}) {
  const { db, engine, notifier } = deps;
  const app = Fastify({ logger: deps.logger ?? false });
  await app.register(fastifyWebsocket);

  // ปุ่มจำลองบนเว็บ
  await app.register(fastifyStatic, { root: deps.simulatorDir, prefix: '/simulator/' });
  const mqttDist = path.join(path.dirname(require.resolve('mqtt/package.json')), 'dist');
  await app.register(fastifyStatic, { root: mqttDist, prefix: '/vendor/', decorateReply: false });
  app.get('/', (_req, reply) => reply.redirect('/simulator/'));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.status(status).send({ error: status === 500 ? 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' : (err as Error).message });
    if (status === 500) console.error(err);
  });

  const need = (v: unknown, name: string): string => {
    if (typeof v !== 'string' || !v) throw new HttpError(400, `ต้องระบุ ${name}`);
    return v;
  };

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/sim-config', async () => deps.simConfig());

  app.get('/api/users', async () => {
    const { rows } = await db.query(
      `SELECT u.id, u.name, m.role FROM app_user u JOIN care_team_member m ON m.user_id = u.id ORDER BY m.priority`,
    );
    return rows;
  });

  app.get<{ Querystring: { userId?: string } }>('/api/state', async (req) => engine.state(need(req.query.userId, 'userId')));

  app.get<{ Querystring: { userId?: string; days?: string } }>('/api/cases', async (req) =>
    engine.history(need(req.query.userId, 'userId'), Math.min(Number(req.query.days ?? 30), 365)),
  );

  app.get<{ Querystring: { userId?: string; days?: string } }>('/api/stats', async (req) => {
    const patientId = await engine.patientOfUser(need(req.query.userId, 'userId'));
    const days = Math.max(1, Math.min(Number(req.query.days ?? 14), 90));
    return computeStats(db, patientId, days, Date.now(), deps.tzOffsetMin);
  });

  app.post<{ Params: { id: string }; Body: { userId?: string } }>('/api/cases/:id/ack', async (req) =>
    engine.ack(req.params.id, need(req.body?.userId, 'userId')),
  );

  app.post<{ Params: { id: string }; Body: { userId?: string; note?: string } }>('/api/cases/:id/resolve', async (req) =>
    engine.resolve(req.params.id, need(req.body?.userId, 'userId'), req.body?.note),
  );

  app.post<{ Body: { userId?: string; away?: boolean } }>('/api/presence', async (req) => {
    await engine.setAway(need(req.body?.userId, 'userId'), !!req.body?.away);
    return { ok: true };
  });

  app.put<{ Body: { userId?: string; order?: string[] } }>('/api/caregivers/order', async (req) => {
    await engine.setOrder(need(req.body?.userId, 'userId'), req.body?.order ?? []);
    return { ok: true };
  });

  app.put<{ Params: { n: string }; Body: { userId?: string; label?: string; urgency?: Urgency } }>('/api/buttons/:n', async (req) => {
    await engine.setButton(need(req.body?.userId, 'userId'), Number(req.params.n), req.body?.label ?? '', req.body?.urgency ?? 'normal');
    return { ok: true };
  });

  app.post<{ Body: { userId?: string; token?: string } }>('/api/push-token', async (req) => {
    const userId = need(req.body?.userId, 'userId');
    const token = need(req.body?.token, 'token');
    await db.query(
      'INSERT INTO push_token (token, user_id) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET user_id = $2',
      [token, userId],
    );
    return { ok: true };
  });

  // แอปเชื่อมค้างไว้เพื่อรับการแจ้งเตือนแบบทันที
  app.get<{ Querystring: { userId?: string } }>('/ws', { websocket: true }, (socket, req) => {
    const userId = req.query.userId;
    if (!userId) return socket.close(1008, 'userId required');
    const detach = notifier.attach(userId, socket);
    socket.on('close', detach);
    socket.send(JSON.stringify({ type: 'state_changed' }));
  });

  return app;
}
