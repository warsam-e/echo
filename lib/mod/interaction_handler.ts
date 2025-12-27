import {
	ApplicationCommandOptionType,
	type ApplicationCommandSubCommandData,
	type ApplicationCommandSubGroupData,
	type Interaction,
	InteractionType,
} from '$discord.ts';
import type { Echo } from '$index.ts';
import type { Command, CommandInteractionHandlers } from './command.ts';
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
	}

	#_findCommand(cmd_name: string): Command<Echo> | null {
		const cmd = this.#_inst.commands.get(cmd_name);
		if (!cmd) {
			return null;
		}
		return cmd;
	}

	/**
	 * Resolve the command (and sub commands) used in the interaction, if available.
	 * @throws {Error} Command not found.
	 */
	resolveCommand(int: Interaction): Command[] {
		const cmds: Command[] = [];
		if (
			int.isCommand() ||
			int.type === InteractionType.ApplicationCommandAutocomplete ||
			int.isContextMenuCommand()
		) {
			const main = this.#_findCommand(int.commandName);
			if (!main) throw new Error('Command not found.');

			cmds.push(main);
			if (int.isChatInputCommand() || int.type === InteractionType.ApplicationCommandAutocomplete) {
				try {
					const group = int.options.getSubcommandGroup();
					const sub = int.options.getSubcommand();
					let cmd: Command | undefined;
					if (group) {
						const group_cmds = main.subcommands.filter((c) => c.name.default.startsWith(group));
						if (!group_cmds.length) throw 404;
						cmd = group_cmds.find((c) => c.name.default === `${group} ${sub}`);
						if (!cmd) throw 404;
					} else if (sub) {
						cmd = main.subcommands.find((c) => c.name.default === sub);
						if (!cmd) throw 404;
					}
					if (!cmd) throw 404;
					cmds.push(cmd);
				} catch {}
			}
		}
		if (int.isMessageComponent()) {
			const msg_int = int.message.interaction;

			if (msg_int) {
				if (msg_int.type === InteractionType.ApplicationCommand) {
					let maincmd = this.#_findCommand(msg_int.commandName);

					if (!maincmd) {
						const [parent, ...sub] = msg_int.commandName.split(' ');

						maincmd = this.#_findCommand(parent);
						if (!maincmd) {
							throw new Error('Command not found.');
						}
						cmds.push(maincmd);

						if (sub.length > 0) {
							const subs = maincmd.options.filter(
								(o) =>
									o.type === ApplicationCommandOptionType.SubcommandGroup ||
									o.type === ApplicationCommandOptionType.Subcommand,
							) as Array<ApplicationCommandSubCommandData | ApplicationCommandSubGroupData>;
							// circulate through subcommands
							const circular_sub = (maincmd: Command) => {
								let found: Command | undefined;
								for (const s of subs) {
									if (s.name === sub[0]) {
										if (s.type === ApplicationCommandOptionType.SubcommandGroup) {
											const find = s.options?.find((o) => o.name === sub[1]);
											if (find) {
												const subcmd = maincmd.subcommands.find(
													(c) => c.name.get('default') === `${s.name} ${find.name}`,
												);
												if (subcmd) {
													cmds.push(subcmd);
													found = subcmd;
												}
											}
										} else {
											const subcmd = maincmd.subcommands.find(
												(c) => c.name.get('default') === s.name,
											);
											if (subcmd) {
												cmds.push(subcmd);
												found = subcmd;
											}
										}
									}
								}
								return found;
							};

							const found = circular_sub(maincmd);
							if (!found) throw new Error('Command not found.');
							cmds.push(found);
						}
					} else {
						cmds.push(maincmd);
					}
				}
			} else {
				cmds.push(...this.#_resolveCommandPath(int.customId));
			}
		}

		if (int.isModalSubmit()) {
			cmds.push(...this.#_resolveCommandPath(int.customId));
		}
		return cmds;
	}

	#_resolveCommandPath(custom_id: string): Command[] {
		const cmds: Command[] = [];
		const split = custom_id.split('-');
		split.splice(split.length - 1, 1);
		const [cmdname, ...rest] = split;

		const cmd = this.#_findCommand(cmdname);
		if (!cmd) {
			throw new Error('Command not found.');
		}
		cmds.push(cmd);
		if (rest.length > 0) {
			const subcmd = cmd.subcommands.find((c) => c.name.get('default') === rest.join(' '));
			if (subcmd) {
				cmds.push(subcmd);
			}
		}

		return cmds;
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
