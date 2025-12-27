import chalk, { type ChalkInstance } from 'chalk';
import { config } from 'dotenv';
import {
	Client,
	type ClientOptions,
	Collection,
	type ColorResolvable,
	GatewayIntentBits,
	resolveColor,
	type Snowflake,
	Team,
	User,
} from '$discord.ts';
import { type Command, InteractionHandler } from '$mod/index.ts';
import { _echo_log } from '$mod/logging.ts';
import { _register_cmds } from '$mod/register.ts';
import pkg from '../package.json';

config({ quiet: true });

export interface EchoOptions {
	name: string;
	color: ColorResolvable;
	/**
	 * Options for the Discord client.
	 * @default { intents: [GatewayIntentBits.Guilds] }
	 */
	client_options?: ClientOptions;
}

/**
 * Echo client class. Extends [discord.js](https://npmjs.com/package/discord.js)'s {@link Client}.
 */
class Echo extends Client {
	name: string;
	color: ColorResolvable;
	/** handler for interactions */
	handler: InteractionHandler | undefined;
	commands: Collection<string, Command<this>>;
	echoVersion = pkg.version;

	constructor(opts: EchoOptions) {
		if (opts.client_options) {
			super(opts.client_options);
		} else {
			super({ intents: [GatewayIntentBits.Guilds] });
		}
		this.name = opts.name;
		this.color = opts.color;
		this.commands = new Collection<string, Command<this>>();
	}

	/** @returns whether the bot is sharding */
	get isSharding(): boolean {
		return this.shard !== null;
	}

	/** @returns the shard id, if sharding */
	get shardId(): number | null {
		return this.shard?.ids.at(0) ?? null;
	}

	/** @returns the number of guilds the bot is in */
	async guildCount(): Promise<number> {
		if (!this.shard) return this.guilds.cache.size;
		const guilds = await this.shard.fetchClientValues('guilds.cache.size');
		let num = 0;
		for (const g of guilds) if (typeof g === 'number') num += g;
		return num;
	}

	/** @returns the number of members in all guilds the bot is in */
	async memberCount(): Promise<number> {
		if (!this.shard) return this.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);
		const members = await this.shard.broadcastEval((c) =>
			c.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0),
		);
		return members.reduce((acc, m) => acc + (m ?? 0), 0);
	}

	registerCommands(cmds: Command<this>[]): this {
		for (const cmd of cmds) {
			this.commands.set(cmd.name.default, cmd);
		}
		return this;
	}

	/** @returns the bot's color, as a chalk instance */
	get botChalk(): ChalkInstance {
		return chalk.hex(resolveColor(this.color).toString(16));
	}

	/** @returns the bot's owner(s) */
	get owners(): Collection<Snowflake, User> {
		if (!this.application) throw new Error('Application is not defined');
		const { owner } = this.application;
		if (owner instanceof User) return new Collection([[owner.id, owner]]);
		if (owner instanceof Team) return owner.members.mapValues((m) => m.user);
		throw new Error('Unknown owner type');
	}

	/** Initializes the bot */
	async init(_token?: string): Promise<this> {
		_echo_log({ title: 'init', bot: this }, `Initializing ${this.botChalk(this.name)}`);
		const token = _token ?? process.env.TOKEN;
		if (token === undefined) throw new Error('Token is not defined');
		await super.login(token);
		await this.application?.fetch();

		if (!this.user) {
			throw new Error('Client user is not defined');
		}

		await _register_cmds(this);

		this.handler = new InteractionHandler(this);
		_echo_log({ title: 'init', bot: this }, `Logged in as ${this.botChalk(this.user.tag)}!`);
		return this;
	}
}

export * from '$cmds/index.ts';
export * from '$discord.ts';
export * from '$mod/index.ts';
export { Echo };
export default Echo;
