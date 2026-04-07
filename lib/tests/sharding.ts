import { join } from 'node:path';
import { EchoSharding } from '$index.ts';

const current_file = import.meta.url.replace('file://', '');

EchoSharding.init(join(current_file, '../index.ts'));
