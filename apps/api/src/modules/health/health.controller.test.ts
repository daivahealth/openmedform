import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * The regression this guards: the endpoint previously returned a hardcoded
 * `ok` and so stayed green through an outage in which every database-backed
 * route was failing. "Reports ok" is not the property worth testing — "goes
 * red when the database does" is.
 */
function controller(findFirst = vi.fn().mockResolvedValue(null)) {
  const prisma = { tenant: { findFirst } } as never;
  return { c: new HealthController(prisma), findFirst };
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const { c } = controller();
    await expect(c.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'ok',
    });
  });

  // An empty tenants table is reachability, not failure.
  it('treats no rows as healthy', async () => {
    const { c, findFirst } = controller(vi.fn().mockResolvedValue(null));
    await expect(c.check()).resolves.toMatchObject({ database: 'ok' });
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('fails with 503 when the database is unreachable', async () => {
    const { c } = controller(
      vi.fn().mockRejectedValue(new Error("Can't reach database server")),
    );
    await expect(c.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // The endpoint is public and unauthenticated; a driver error can name the
  // host and the user it failed to connect as.
  it('keeps the driver error out of the response body', async () => {
    const secret = 'FATAL: password authentication failed for user "omf_prod"';
    const { c } = controller(vi.fn().mockRejectedValue(new Error(secret)));

    const err = await c.check().catch((e) => e as ServiceUnavailableException);
    expect(JSON.stringify(err.getResponse())).not.toContain('omf_prod');
    expect(err.getResponse()).toMatchObject({ database: 'unreachable' });
  });

  // Liveness must not touch the database, or a blip becomes a crash loop.
  it('answers liveness without querying the database', () => {
    const { c, findFirst } = controller();
    expect(c.live()).toMatchObject({ status: 'ok' });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
