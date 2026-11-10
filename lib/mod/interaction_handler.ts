import { inspect } from 'node:util';
import { type Interaction, type InteractionReplyOptions, InteractionType, MessageFlags } from 'discord.js';
import type { Echo, InteractionErrorReply } from '$index.ts';
import type { Command, CommandInteractionHandlers } from './command.ts';
import { componentCommandRoute, interactionCommandRoute } from './command_route.ts';
import { _echo_log, echo_color, green, red } from './logging.ts';

class PermissionDeniedError extends Error {
	constructor() {
		super('You do not have permission to use this command.');
	}
}

/**
 * Handler for interactions.
 * @internal
 */
export class InteractionHandler {
	#_inst: Echo;

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

		if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
			console.warn(
				`Interaction ${interaction.id} was not acknowledged.`,
				inspect(interaction, { depth: 0, colors: true }),
			);
		}
	}

	async #_replyToError(interaction: Interaction, error: unknown) {
		if (!(error instanceof PermissionDeniedError)) console.error(error);
		if (!interaction.isRepliable() || interaction.replied) return;

		const payload = await this.#_formatError(error);
		if (interaction.replied) return;
		if (interaction.deferred && interaction.ephemeral !== null) {
			await interaction.editReply(payload);
			return;
		}

		const reply: InteractionReplyOptions = { ...payload, flags: [MessageFlags.Ephemeral, payload.flags ?? []] };
		if (interaction.deferred) await interaction.followUp(reply);
		else await interaction.reply(reply);
	}

	async #_formatError(error: unknown): Promise<InteractionErrorReply> {
		if (error instanceof PermissionDeniedError) return { content: error.message };
		try {
			const reply = await this.#_inst.formatError?.(error);
			if (reply) return reply;
		} catch (formatterError) {
			console.error(formatterError);
		}
		return { content: 'Something went wrong.' };
	}

	/**
	 * Resolve the command (and sub commands) used in the interaction, if available.
	 * @throws {Error} Command not found.
	 */
	resolveCommand(int: Interaction): Command[] {
		if (int.isMessageComponent() || int.isModalSubmit()) {
			const route = componentCommandRoute(int.customId);
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

	async #_asyncBool(promise: Promise<boolean>): Promise<boolean> {
		try {
			return await promise;
		} catch {}
		return false;
	}

	async #_cmdPermHandler(cmd: Command, int: Interaction): Promise<boolean> {
		const cmd_name = cmd.name.get('default');
		const check_passes = async () => {
			if (this.#_inst.owners.has(int.user.id)) return true;
			if (cmd.ownersOnly) return false;
			return this.#_asyncBool(cmd.checkPermission(this.#_inst, int));
		};
		const passed = await check_passes();
		_echo_log(
			{ title: 'interaction_handler', bot: this.#_inst },
			`${echo_color(`${int.user.displayName} [${int.user.id}]`)} using ${this.#_inst.botChalk(cmd_name)} → ${
				passed ? green('passed') : red('failed')
			}`,
		);
		return passed;
	}

	async #_handleInteraction(type: keyof CommandInteractionHandlers<Echo>, int: Interaction): Promise<void> {
		const cmds = this.resolveCommand(int);
		if (cmds.length > 0) {
			const maincmd = cmds[0];
			if (!(await this.#_cmdPermHandler(maincmd, int))) {
				throw new PermissionDeniedError();
			}
			if (cmds.length > 1) {
				const subcmd = cmds[1];
				if (!(await this.#_cmdPermHandler(subcmd, int))) {
					throw new PermissionDeniedError();
				}
				await subcmd.handle(type, this.#_inst, int);
			}
			await maincmd.handle(type, this.#_inst, int);
		}
	}
}
