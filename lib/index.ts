import chalk, { type ChalkInstance } from 'chalk';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	Client,
	type ClientOptions,
	Collection,
	type ColorResolvable,
	GatewayIntentBits,
	InteractionContextType,
	resolveColor,
	type Snowflake,
	Team,
	User,
} from 'discord.js';
import { config } from 'dotenv';
import { type CommandScope, commandRoute } from '$mod/command_route.ts';
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
	commands = new Map<string, Command<this>>();
	echoVersion = pkg.version;

	constructor(opts: EchoOptions) {
		if (opts.client_options) {
			super(opts.client_options);
		} else {
			super({ intents: [GatewayIntentBits.Guilds] });
		}
		this.name = opts.name;
		this.color = opts.color;
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

	registerGlobal(cmds: Command<this>[]): this {
		return this.#registerCommands('global', cmds);
	}

	registerGuild(cmds: Command<this>[]): this {
		for (const cmd of cmds) {
			if (
				cmd.integration_types.includes(ApplicationIntegrationType.UserInstall) ||
				cmd.contexts.some((context) => context !== InteractionContextType.Guild)
			) {
				throw new Error(`Use registerGlobal() for ${cmd.name.default} to enable User Install or private contexts.`);
			}
		}
		return this.#registerCommands('guild', cmds);
	}

	#registerCommands(scope: CommandScope, cmds: Command<this>[]): this {
		const routes = new Map(this.commands);
		const registered = new Set(routes.values());
		const add = (route: string, command: Command<this>) => {
			if (routes.get(route) === command) return;
			if (routes.has(route)) throw new Error(`Duplicate command route: ${route}`);
			if (registered.has(command)) throw new Error(`Command instance is already registered at another route: ${route}`);
			routes.set(route, command);
			registered.add(command);
		};

		for (const cmd of cmds) {
			const name = cmd.name.default;
			add(commandRoute(scope, cmd.type, [name]), cmd);
			for (const { command, group } of cmd.subcommands) {
				const path = group === undefined ? [name, command.name.default] : [name, group, command.name.default];
				add(commandRoute(scope, cmd.type, path), command);
			}
		}
		this.commands = routes;
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

	customId(id: string, int: ChatInputCommandInteraction) {
		const cmd_names = [int.commandName];
		const group_name = int.options.getSubcommandGroup(false);
		const sub_name = int.options.getSubcommand(false);
		if (group_name) cmd_names.push(group_name);
		if (sub_name) cmd_names.push(sub_name);
		return `${cmd_names.join('-')}-${id}`;
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

export * from 'discord.js';
export * from '$cmds/index.ts';
export * from '$mod/index.ts';
export { Echo };
export default Echo;
