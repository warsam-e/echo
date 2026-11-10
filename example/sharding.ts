import { join } from 'node:path';
import { EchoSharding } from '$index.ts';

const token = Bun.env.TOKEN;
if (!token) throw new Error('Set TOKEN to your Discord bot token.');

const current_file = import.meta.url.replace('file://', '');

EchoSharding.init(join(current_file, '../index.ts'), token);
