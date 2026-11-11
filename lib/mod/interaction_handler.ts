import { inspect } from 'node:util';
import chalk from 'chalk';
import { type Interaction, InteractionType, MessageFlags, type RepliableInteraction } from 'discord.js';
import type { Echo, InteractionReplyContent } from '$index.ts';
import type { Command, CommandInteractionHandlers } from './command.ts';
import { componentCommandRoute, interactionCommandRoute, resolveComponentCommandRoute } from './command_route.ts';
import { _echo_log, echo_color } from './logging.ts';

class PermissionDeniedError extends Error {
	constructor() {
		super('You do not have permission to use this command.');
	}
}

class CooldownError extends Error {
	constructor(readonly remainingMs: number) {
		super(`Try again in ${Math.ceil(remainingMs / 1000)}s.`);
	}
}

/**
 * Handler for interactions.
 * @internal
 */
export class InteractionHandler {
	#_inst: Echo;
	#cooldowns = new WeakMap<Command, Map<string, number>>();

	/**
	 * @hidden
	 */
	constructor(inst: Echo) {
		this.#_inst = inst;

		this.#_inst.on('interactionCreate', async (interaction) => {
			try {
				await this.#_matchInteraction(interaction);
			} catch (error) {
				console.error(error);
			}
		});
	}

	async #_matchInteraction(interaction: Interaction) {
		if (
			(interaction.isMessageComponent() || interaction.isModalSubmit()) &&
			!componentCommandRoute(interaction.customId)
		) {
			return;
		}

		try {
			switch (interaction.type) {
				case InteractionType.ApplicationCommandAutocomplete:
					await this.#_handleInteraction('autocomplete', interaction);
					break;
				case InteractionType.ModalSubmit:
					await this.#_handleInteraction('modal_submit', interaction);
					break;
				case InteractionType.MessageComponent:
					if (interaction.isButton()) {
						await this.#_handleInteraction('button', interaction);
					}
					if (interaction.isAnySelectMenu()) {
						await this.#_handleInteraction('select_menu', interaction);
					}
					break;
				case InteractionType.ApplicationCommand:
					if (interaction.isChatInputCommand()) {
						await this.#_handleInteraction('chat_input', interaction);
					}
					if (interaction.isMessageContextMenuCommand()) {
						await this.#_handleInteraction('message_context_menu', interaction);
					}
					if (interaction.isUserContextMenuCommand()) {
						await this.#_handleInteraction('user_context_menu', interaction);
					}
					break;
			}
		} catch (error) {
			await this.#_replyToError(interaction, error);
			return;
		}
		if (interaction.isAutocomplete() && !interaction.responded) await interaction.respond([]);

		if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
			console.warn(
				`Interaction ${interaction.id} was not acknowledged.`,
				inspect(interaction, { depth: 0, colors: true }),
			);
		}
	}

	async #_replyToError(interaction: Interaction, error: unknown) {
		if (!(error instanceof PermissionDeniedError) && !(error instanceof CooldownError)) console.error(error);
		if (interaction.isAutocomplete()) {
			if (!interaction.responded) await interaction.respond([]);
			return;
		}
		if (!interaction.isRepliable() || interaction.replied) return;
		if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const payload = await this.#_formatError(error, interaction);
		if (interaction.replied) return;
		if (interaction.ephemeral !== null) {
			await interaction.editReply(payload);
			return;
		}

		await interaction.followUp({ ...payload, flags: [MessageFlags.Ephemeral, payload.flags ?? []] });
	}

	async #_formatError(error: unknown, interaction: RepliableInteraction): Promise<InteractionReplyContent> {
		if (error instanceof PermissionDeniedError) return { content: error.message };
		try {
			const reply =
				error instanceof CooldownError
					? await this.#_inst.formatCooldown?.(error.remainingMs, interaction)
					: await this.#_inst.formatError?.(error, interaction);
			if (reply) return reply;
		} catch (formatterError) {
			console.error(formatterError);
		}
		return { content: error instanceof CooldownError ? error.message : 'Something went wrong.' };
	}

	/**
	 * Resolve the command (and sub commands) used in the interaction, if available.
	 * @throws {Error} Command not found.
	 */
	#resolveCommand(int: Interaction): Command[] {
		if (int.isMessageComponent() || int.isModalSubmit()) {
			const route = resolveComponentCommandRoute(int.customId, this.#_inst.commands.keys());
			return route ? this.#_resolveRoute(route) : [];
		}
		if (!int.isCommand() && !int.isAutocomplete()) return [];
		return this.#_resolveRoute(interactionCommandRoute(int));
	}

	#_resolveRoute(route: string): Command[] {
		const rootRoute = route.split('/', 3).join('/');
		const root = this.#_inst.commands.get(rootRoute);
		if (!root) throw new Error('Command not found.');
		if (route === rootRoute) return [root];

		const child = this.#_inst.commands.get(route);
		if (!child) throw new Error('Subcommand not found.');
		return [root, child];
	}

	async #_cmdPermHandler(cmd: Command, int: Interaction): Promise<boolean> {
		const cmd_name = cmd.name.get('default');
		const isOwner = this.#_inst.owners.has(int.user.id);
		const passed = isOwner || (!cmd.ownersOnly && (await cmd.checkPermission(this.#_inst, int)));
		_echo_log(
			{ title: 'interaction_handler', bot: this.#_inst },
			`${echo_color(`${int.user.displayName} [${int.user.id}]`)} using ${this.#_inst.botChalk(cmd_name)} → ${
				passed ? chalk.green('passed') : chalk.red('failed')
			}`,
		);
		return passed;
	}

	async #_handleInteraction(type: keyof CommandInteractionHandlers<Echo>, int: Interaction): Promise<void> {
		const cmds = this.#resolveCommand(int);
		for (const cmd of cmds) {
			if (!(await this.#_cmdPermHandler(cmd, int))) throw new PermissionDeniedError();
		}
		if (int.isCommand()) this.#applyCooldown(cmds, int.user.id);
		for (const cmd of cmds.toReversed()) await cmd.handle(type, this.#_inst, int);
	}

	#applyCooldown(commands: Command[], userId: string) {
		const now = performance.now();
		const remaining = Math.max(
			0,
			...commands.map((command) => (this.#cooldowns.get(command)?.get(userId) ?? 0) - now),
		);
		if (remaining > 0) throw new CooldownError(remaining);

		for (const command of commands) {
			if (!command.cooldown) continue;
			let users = this.#cooldowns.get(command);
			if (!users) {
				users = new Map();
				this.#cooldowns.set(command, users);
			}
			const expires = now + command.cooldown;
			users.set(userId, expires);
			const cooldowns = users;
			setTimeout(() => {
				if (cooldowns.get(userId) === expires) cooldowns.delete(userId);
			}, command.cooldown).unref();
		}
	}
}
