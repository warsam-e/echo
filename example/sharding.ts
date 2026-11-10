import { fileURLToPath } from 'node:url';
import { EchoSharding } from '$index.ts';
import { env } from './env.ts';

await EchoSharding.init(fileURLToPath(new URL('./index.ts', import.meta.url)), env.BOT_TOKEN);
