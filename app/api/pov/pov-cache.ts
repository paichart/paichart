/**
 * POV List Response Cache
 *
 * Lives in its own module (not route.ts) because Next.js route files may only
 * export HTTP methods + route-segment config — `export const povListCache`
 * from route.ts trips the .next/types route-export constraint (TS2344).
 * Precedent: app/api/agent-templates/template-cache.ts.
 *
 * Invalidation contract (dafc46f9, 2026-05-26): every POV mutation route
 * (create POST, update PUT, delete DELETE, team-member add/remove/batch)
 * MUST invalidate `pov:list:{userId}` for owner + team members + actor.
 * A cached GET whose mutation siblings don't invalidate is a bug.
 */
import { LRUCache } from '@/lib/utils/lru-cache';

export const povListCache = new LRUCache<any>({ maxSize: 100, ttl: 60000 }); // 60s TTL
