import { inspect } from 'node:util';
import { type Interaction, InteractionType } from 'discord.js';
import type { Echo } from '$index.ts';
import type { Command, CommandInteractionHandlers } from './command.ts';
import { componentCommandRoute, interactionCommandRoute } from './command_route.ts';
import { _echo_log, echo_color, green, red } from './logging.ts';

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
			} catch {}
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
		} catch (e) {
			console.error(e);
			if (interaction.isRepliable()) {
				const content = e instanceof Error ? e.message : 'An error occured while executing the command.';
				if (interaction.replied) return interaction.editReply({ content });
				try {
					await interaction.reply({ content, ephemeral: true });
				} catch {
					await interaction.editReply({ content });
				}
			}
		}

		if (interaction.isRepliable()) {
			if (!interaction.replied)
				console.warn(
					`Interaction ${interaction.id} was not replied to.`,
					inspect(interaction, { depth: 0, colors: true }),
				);
		}
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
				throw new Error('You do not have permission to use this command.');
			}
			if (cmds.length > 1) {
				const subcmd = cmds[1];
				if (!(await this.#_cmdPermHandler(subcmd, int))) {
					throw new Error('You do not have permission to use this command.');
				}
				await subcmd.handle(type, this.#_inst, int);
			}
			await maincmd.handle(type, this.#_inst, int);
		}
	}
}
