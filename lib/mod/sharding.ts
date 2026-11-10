import { ShardingManager } from 'discord.js';
import { _echo_log } from './logging.ts';

export class EchoSharding {
	#_manager: ShardingManager;
	private constructor(path: string, token: string) {
		if (typeof token !== 'string' || !token.trim()) throw new Error('A Discord bot token is required.');
		this.#_manager = new ShardingManager(path, { token });
	}

	/**
	 * Starts the bot's shards.
	 * @param path The entry point to run for each shard.
	 * @param token The Discord bot token.
	 */
	static async init(path: string, token: string): Promise<EchoSharding> {
		const inst = new EchoSharding(path, token);
		inst.#_manager.on('shardCreate', (shard) =>
			_echo_log({ title: 'shard', bot: null }, `Launched shard ${shard.id}`),
		);
		await inst.#_manager.spawn();
		return inst;
	}
}
