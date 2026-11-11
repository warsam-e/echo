import {
	type AnySelectMenuInteraction,
	type ApplicationCommandData,
	type ApplicationCommandOptionData,
	ApplicationCommandOptionType,
	type ApplicationCommandSubCommandData,
	ApplicationCommandType,
	type ApplicationIntegrationType,
	type AutocompleteInteraction,
	type Awaitable,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Interaction,
	type InteractionCallbackResponse,
	type InteractionContextType,
	type InteractionResponse,
	type Message,
	type MessageContextMenuCommandInteraction,
	type ModalSubmitInteraction,
	type PermissionResolvable,
	type UserContextMenuCommandInteraction,
} from 'discord.js';
import type { Echo } from '$index.ts';
import { Locales, set_locales } from './locales.ts';
import type { ScrollableHandle } from './scrollable.ts';

export type CommandResponse = void | Promise<
	// biome-ignore lint/suspicious/noConfusingVoidType: it's intended
	InteractionResponse | InteractionCallbackResponse | ScrollableHandle | void | Message
>;

type InteractionHandlerCallback<T extends Interaction, Inst> = (bot: Inst, int: T) => CommandResponse;

/**
 * Typings for interaction handlers.
 * used in {@link Command.addHandler} method.
 * @internal
 */
export interface CommandInteractionHandlers<Inst = Echo> {
	chat_input: InteractionHandlerCallback<ChatInputCommandInteraction, Inst>;
	button: InteractionHandlerCallback<ButtonInteraction, Inst>;
	modal_submit: InteractionHandlerCallback<ModalSubmitInteraction, Inst>;
	select_menu: InteractionHandlerCallback<AnySelectMenuInteraction, Inst>;
	user_context_menu: InteractionHandlerCallback<UserContextMenuCommandInteraction, Inst>;
	message_context_menu: InteractionHandlerCallback<MessageContextMenuCommandInteraction, Inst>;
	autocomplete: InteractionHandlerCallback<AutocompleteInteraction, Inst>;
}

/**
 * The base info for a command.
 * @internal
 */
interface CommandInfoBasics {
	name: string | Locales;
	/**
	 * @default false
	 */
	owners_only?: boolean;
	/**
	 * @default false
	 */
	nsfw?: boolean;
	/** Default member permissions for the top-level command, shared by all its subcommands. */
	default_member_permissions?: PermissionResolvable | null;
	/** Per-user cooldown for command invocations in milliseconds, from 0 to 2147483647. Defaults to 0. */
	cooldown?: number;
	integration_types?: Array<ApplicationIntegrationType>;
	contexts?: Array<InteractionContextType>;
}

/**
 * Typings for a command initiated by a message context menu action.
 * @internal
 */
interface CommandInfoMessage extends CommandInfoBasics {
	type: ApplicationCommandType.Message;
}

/**
 * Typings for a command initiated by a user profile context menu action.
 * @internal
 */
interface CommandInfoUser extends CommandInfoBasics {
	type: ApplicationCommandType.User;
}

/**
 * Typings for a command initiated by a slash command.
 * @internal
 */
interface CommandInfoChat extends CommandInfoBasics {
	type?: ApplicationCommandType.ChatInput;
	description: string | Locales;
	options?: ApplicationCommandOptionData[];
}

/**
 * Configuration for a slash command or context menu command.
 */
export type CommandInfo = CommandInfoChat | CommandInfoMessage | CommandInfoUser;

/**
 * Checks if a user has permission to run a command.
 */
export type CommandHasPermission<Inst = Echo> = (bot: Inst, int: Interaction) => Awaitable<boolean>;

export interface CommandSubGroup<T = Command> {
	name: string | Locales;
	description: string | Locales;
	commands: T[];
}

/**
 * Command class.
 * @template Inst - Echo instance
 * It's a builder for slash commands, buttons, etc.
 */
export class Command<Inst = Echo> {
	name: Locales;
	description: Locales;
	type: NonNullable<CommandInfo['type']>;
	integration_types: ApplicationIntegrationType[];
	contexts: InteractionContextType[];
	options: ApplicationCommandOptionData[] = [];
	#subcommandDefinitions: (Command<Inst> | CommandSubGroup<Command<Inst>>)[] = [];
	#_handlers: Partial<CommandInteractionHandlers<Inst>> = {};
	checkPermission: CommandHasPermission<Inst>;
	ownersOnly: boolean;
	nsfw: boolean;
	/** Default member permissions sent to Discord. Use null to clear the restriction. */
	default_member_permissions: PermissionResolvable | null;
	/** Per-user cooldown in milliseconds. A parent command shares its cooldown across its subcommands. */
	cooldown: number;

	constructor(info: CommandInfo) {
		const cooldown = info.cooldown ?? 0;
		if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 2_147_483_647) {
			throw new Error('Command cooldown must be an integer from 0 to 2147483647 milliseconds.');
		}
		this.cooldown = cooldown;
		this.name = info.name instanceof Locales ? info.name : set_locales({ default: info.name });
		this.ownersOnly = info.owners_only ?? false;
		info.type = info.type ?? ApplicationCommandType.ChatInput;
		this.type = info.type;
		if (info.type === ApplicationCommandType.ChatInput) {
			this.description =
				info.description instanceof Locales ? info.description : set_locales({ default: info.description });
			this.options = [...(info.options ?? [])];
		} else {
			this.description = new Locales([['default', '']]);
		}
		this.integration_types = info.integration_types ?? [];
		this.contexts = info.contexts ?? [];
		this.checkPermission = () => true;
		this.nsfw = info.nsfw ?? false;
		this.default_member_permissions = info.default_member_permissions ?? null;
	}

	/** The current subcommands and their default group names. */
	get subcommands(): { command: Command<Inst>; group?: string }[] {
		return this.#subcommandDefinitions.flatMap((definition) => {
			if (definition instanceof Command) return [{ command: definition }];
			const group = definition.name instanceof Locales ? definition.name.default : definition.name;
			return definition.commands.map((command) => ({ command, group }));
		});
	}

	addSubCommandGroup(group: CommandSubGroup<Command<Inst>>): this {
		this.options.push({
			type: ApplicationCommandOptionType.SubcommandGroup,
			get name() {
				return group.name instanceof Locales ? group.name.default : group.name;
			},
			get nameLocalizations() {
				return group.name instanceof Locales ? group.name.toJSON() : undefined;
			},
			get description() {
				return group.description instanceof Locales ? group.description.default : group.description;
			},
			get descriptionLocalizations() {
				return group.description instanceof Locales ? group.description.toJSON() : undefined;
			},
			get options() {
				return group.commands.map((command) => command.#_subcommandOption());
			},
		});
		this.#subcommandDefinitions.push(group);
		return this;
	}

	addSubCommands(cmds: Command<Inst>[]): this {
		this.options.push(...cmds.map((command) => command.#_subcommandOption()));
		this.#subcommandDefinitions.push(...cmds);
		return this;
	}

	#_subcommandOption(): ApplicationCommandSubCommandData {
		const command = this;
		return {
			type: ApplicationCommandOptionType.Subcommand,
			get name() {
				return command.name.default;
			},
			get nameLocalizations() {
				return command.name.toJSON();
			},
			get description() {
				return command.description.default;
			},
			get descriptionLocalizations() {
				return command.description.toJSON();
			},
			get options() {
				return command.options as ApplicationCommandSubCommandData['options'];
			},
		};
	}

	commandInfo(): ApplicationCommandData {
		const info = {
			name: this.name.default,
			nameLocalizations: this.name.toJSON(),
			nsfw: this.nsfw,
			defaultMemberPermissions: this.default_member_permissions,
			integrationTypes: this.integration_types.length ? this.integration_types : undefined,
			contexts: this.contexts.length ? this.contexts : undefined,
		};
		if (this.type !== ApplicationCommandType.ChatInput) return { ...info, type: this.type };
		return {
			...info,
			type: this.type,
			description: this.description.default,
			descriptionLocalizations: this.description.toJSON(),
			options: this.options,
		};
	}

	addHandler<T extends keyof CommandInteractionHandlers<Inst>>(
		type: T,
		handler: CommandInteractionHandlers<Inst>[T],
	): this {
		this.#_handlers[type] = handler;
		return this;
	}

	setPermission(cb: CommandHasPermission<Inst>): this {
		this.checkPermission = cb;
		return this;
	}

	async handle<T extends keyof CommandInteractionHandlers<Inst>>(
		type: T,
		bot: Inst,
		int: Interaction,
	): Promise<CommandResponse> {
		const handler = this.#_handlers[type];
		if (!handler) return;
		// biome-ignore lint/suspicious/noExplicitAny: it has to be for now
		return handler(bot, int as any);
	}
}
