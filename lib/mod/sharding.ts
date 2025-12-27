import { ShardingManager } from 'discord.js';
import { config } from 'dotenv';
import { _echo_log } from './logging.ts';

config({ quiet: true });

export class EchoSharding {
	#_manager: ShardingManager;
	private constructor(path: string, _token?: string) {
		const token = _token ?? process.env.TOKEN;
		if (token === undefined) throw new Error('Token is not defined');
		this.#_manager = new ShardingManager(path, { token });
	}

	static async init(path: string, token?: string): Promise<EchoSharding> {
		const inst = new EchoSharding(path, token);
		inst.#_manager.on('shardCreate', (shard) =>
			_echo_log({ title: 'shard', bot: null }, `Launched shard ${shard.id}`),
		);
		await inst.#_manager.spawn();
		return inst;
	}
}
