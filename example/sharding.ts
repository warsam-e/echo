import { fileURLToPath } from 'node:url';
import { ShardingManager } from '$index.ts';
import { env } from './env.ts';

const manager = new ShardingManager(fileURLToPath(new URL('./index.ts', import.meta.url)), {
	token: env.BOT_TOKEN,
});

await manager.spawn();
