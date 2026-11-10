import chalk, { type ChalkInstance } from 'chalk';
import {
	ApplicationIntegrationType,
	type AutocompleteInteraction,
	type Awaitable,
	Client,
	type ClientOptions,
	Collection,
	type ColorResolvable,
	type CommandInteraction,
	GatewayIntentBits,
	InteractionContextType,
	type InteractionReplyOptions,
	type MessageComponentInteraction,
	type MessageFlags,
	type ModalSubmitInteraction,
	resolveColor,
	type Snowflake,
	Team,
	User,
} from 'discord.js';
import {
	type CommandScope,
	commandRoute,
	componentCommandRoute,
	componentId,
	interactionCommandRoute,
} from '$mod/command_route.ts';
import { Command, InteractionHandler } from '$mod/index.ts';
import { _echo_log } from '$mod/logging.ts';
import { _register_cmds } from '$mod/register.ts';
import pkg from '../package.json';

type InteractionErrorFlag = MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds;

/** Message content and styling returned by an interaction error formatter. */
export type InteractionErrorReply = Pick<
	InteractionReplyOptions,
	'content' | 'embeds' | 'components' | 'files' | 'allowedMentions'
> & {
	/** Enables Components V2 or suppresses embeds in the error reply. */
	flags?: InteractionErrorFlag | readonly InteractionErrorFlag[];
};

export interface EchoOptions {
	name: string;
	color: ColorResolvable;
	/**
	 * Options for the Discord client.
	 * @default { intents: [GatewayIntentBits.Guilds] }
	 */
	client_options?: ClientOptions;
	/**
	 * Formats an unexpected interaction error for a user who is still waiting for a reply.
	 * Echo uses “Something went wrong.” if the formatter is absent or throws.
	 * New error replies are private. A deferred reply keeps its original visibility.
	 */
	formatError?: (error: unknown) => Awaitable<InteractionErrorReply>;
}

/**
 * Echo client class. Extends [discord.js](https://npmjs.com/package/discord.js)'s {@link Client}.
 */
class Echo extends Client {
	name: string;
	color: ColorResolvable;
	/** handler for interactions */
	handler: InteractionHandler | undefined;
	/** Registered commands and subcommands keyed by their internal route. */
	commands = new Map<string, Command<this>>();
	echoVersion = pkg.version;
	/** The formatter configured in {@link EchoOptions.formatError}. */
	readonly formatError: EchoOptions['formatError'];
	#commandDefinitions = new Map<Command<this>, CommandScope>();
	#initializationStarted = false;

	constructor(opts: EchoOptions) {
		if (opts.client_options) {
			super(opts.client_options);
		} else {
			super({ intents: [GatewayIntentBits.Guilds] });
		}
		this.name = opts.name;
		this.color = opts.color;
		this.formatError = opts.formatError;
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

	/**
	 * Adds commands to the global list that Echo syncs during {@link init}.
	 * Commands with no install types configured inherit the app's Discord install settings.
	 * @param cmds The top-level commands to publish globally.
	 * @returns This Echo client for chaining.
	 */
	registerGlobal(cmds: Command<this>[]): this {
		return this.#registerCommands('global', cmds);
	}

	/**
	 * Adds commands to the list that Echo syncs to each server at startup and on guild join.
	 * @param cmds The top-level commands to publish separately in each server.
	 * @returns This Echo client for chaining.
	 */
	registerGuild(cmds: Command<this>[]): this {
		return this.#registerCommands('guild', cmds);
	}

	#registerCommands(scope: CommandScope, cmds: Command<this>[]): this {
		if (this.#initializationStarted) throw new Error('Register commands before calling init().');
		for (const command of cmds) {
			const existingScope = this.#commandDefinitions.get(command);
			if (existingScope && existingScope !== scope) {
				throw new Error(`Command ${command.name.default} is already registered in ${existingScope} scope.`);
			}
		}
		for (const command of cmds) this.#commandDefinitions.set(command, scope);
		return this;
	}

	#buildCommandRoutes() {
		const routes = new Map<string, Command<this>>();
		const registered = new Set<Command<this>>();
		const add = (route: string, command: Command<this>) => {
			if (routes.get(route) === command) return;
			if (routes.has(route)) throw new Error(`Duplicate command route: ${route}`);
			if (registered.has(command))
				throw new Error(`Command instance is already registered at another route: ${route}`);
			routes.set(route, command);
			registered.add(command);
		};

		for (const [cmd, scope] of this.#commandDefinitions) {
			if (
				scope === 'guild' &&
				(cmd.integration_types.includes(ApplicationIntegrationType.UserInstall) ||
					cmd.contexts.some((context) => context !== InteractionContextType.Guild))
			) {
				throw new Error(
					`Use registerGlobal() for ${cmd.name.default} to enable User Install or private contexts.`,
				);
			}
			const name = cmd.name.default;
			add(commandRoute(scope, cmd.type, [name]), cmd);
			for (const { command, group } of cmd.subcommands) {
				const path = group === undefined ? [name, command.name.default] : [name, group, command.name.default];
				add(commandRoute(scope, cmd.type, path), command);
			}
		}
		this.commands = routes;
		this.#commandDefinitions.clear();
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

	/**
	 * Creates a custom ID that routes a button, select menu, or modal submission to an Echo command.
	 * @param target A registered command or subcommand instance, or an interaction with a registered route.
	 * @param action An identifier for the control within that command.
	 * @returns A custom ID to pass to `setCustomId()`.
	 * Command routes become available when {@link init} starts.
	 * @throws If the target has no registered route or the ID exceeds Discord's 100-character limit.
	 */
	id(
		target:
			| Command<this>
			| CommandInteraction
			| AutocompleteInteraction
			| MessageComponentInteraction
			| ModalSubmitInteraction,
		action: string,
	): string {
		if (target instanceof Command) {
			for (const [route, command] of this.commands) {
				if (command === target) return componentId(route, action);
			}
			throw new Error(`Command ${target.name.default} is not registered.`);
		}
		const route = 'customId' in target ? componentCommandRoute(target.customId) : interactionCommandRoute(target);
		if (!route || !this.commands.has(route)) throw new Error('Interaction has no registered command route.');
		return componentId(route, action);
	}

	/**
	 * Connects to Discord and syncs the bot's commands.
	 * @param token The Discord bot token.
	 */
	async init(token: string): Promise<this> {
		if (this.#initializationStarted) throw new Error('Echo init() can only be called once.');
		this.#initializationStarted = true;
		if (typeof token !== 'string' || !token.trim()) throw new Error('A Discord bot token is required.');
		this.#buildCommandRoutes();
		_echo_log({ title: 'init', bot: this }, `Initializing ${this.botChalk(this.name)}`);
		await super.login(token);
		await this.application?.fetch();

		if (!this.user) {
			throw new Error('Client user is not defined');
		}

		this.handler = new InteractionHandler(this);
		await _register_cmds(this);

		_echo_log({ title: 'init', bot: this }, `Logged in as ${this.botChalk(this.user.tag)}!`);
		return this;
	}
}

export * from 'discord.js';
export * from '$cmds/index.ts';
export * from '$mod/index.ts';
export { Echo };
export default Echo;
