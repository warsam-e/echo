import { inspect } from 'node:util';
import { ApplicationCommandType, type Interaction, InteractionType } from 'discord.js';
import type { Echo } from '$index.ts';
import type { Command, CommandInteractionHandlers } from './command.ts';
import { type CommandScope, commandRoute } from './command_route.ts';
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
			return this.#_resolveComponent(int.customId, int.guildId !== null);
		}
		if (!int.isCommand() && !int.isAutocomplete()) return [];

		const scope = int.commandGuildId ? 'guild' : 'global';
		const type = int.commandType;
		const path = [int.commandName];
		if (int.isChatInputCommand() || int.isAutocomplete()) {
			const group = int.options.getSubcommandGroup(false);
			const subcommand = int.options.getSubcommand(false);
			if (group) path.push(group);
			if (subcommand) path.push(subcommand);
		}
		return this.#_resolveRoute(scope, type, path);
	}

	#_resolveComponent(customId: string, inGuild: boolean): Command[] {
		if (!customId.includes('-')) return [];
		const path = customId.split('-').slice(0, -1);
		const type = ApplicationCommandType.ChatInput;
		const guildRoute = commandRoute('guild', type, [path[0]]);
		if (!inGuild || !this.#_inst.commands.has(guildRoute)) return this.#_resolveRoute('global', type, path);
		if (this.#_inst.commands.has(commandRoute('global', type, [path[0]]))) {
			throw new Error('Component command route is ambiguous.');
		}
		return this.#_resolveRoute('guild', type, path);
	}

	#_resolveRoute(scope: CommandScope, type: ApplicationCommandType, path: string[]): Command[] {
		const root = this.#_inst.commands.get(commandRoute(scope, type, [path[0]]));
		if (!root) throw new Error('Command not found.');
		if (path.length === 1) return [root];

		const child = this.#_inst.commands.get(commandRoute(scope, type, path));
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
