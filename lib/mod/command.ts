import {
	type AnySelectMenuInteraction,
	type ApplicationCommandData,
	type ApplicationCommandOptionData,
	ApplicationCommandOptionType,
	type ApplicationCommandSubCommandData,
	ApplicationCommandType,
	type ApplicationIntegrationType,
	type AutocompleteInteraction,
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

// biome-ignore lint/suspicious/noConfusingVoidType: it's intended
export type CommandResponse = void | Promise<InteractionResponse | InteractionCallbackResponse | void | Message>;

export type InteractionHadlerCB<T extends Interaction, Inst = Echo> = (bot: Inst, int: T) => CommandResponse;

/**
 * Typings for interaction handlers.
 * used in {@link Command.addHandler} method.
 * @internal
 */
export interface CommandInteractionHandlers<Inst = Echo> {
	chat_input: InteractionHadlerCB<ChatInputCommandInteraction, Inst>;
	button: InteractionHadlerCB<ButtonInteraction, Inst>;
	modal_submit: InteractionHadlerCB<ModalSubmitInteraction, Inst>;
	select_menu: InteractionHadlerCB<AnySelectMenuInteraction, Inst>;
	user_context_menu: InteractionHadlerCB<UserContextMenuCommandInteraction, Inst>;
	message_context_menu: InteractionHadlerCB<MessageContextMenuCommandInteraction, Inst>;
	autocomplete: InteractionHadlerCB<AutocompleteInteraction, Inst>;
}

export type CommandHandler<Inst, T extends keyof CommandInteractionHandlers<Inst>> = Partial<{
	[K in T]: CommandInteractionHandlers<Inst>[K];
}>;

/**
 * The base info for a command.
 * @internal
 */
export interface CommandInfoBasics {
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
export interface CommandInfoMessage extends CommandInfoBasics {
	type: ApplicationCommandType.Message;
}

/**
 * Typings for a command initiated by a user profile context menu action.
 * @internal
 */
export interface CommandInfoUser extends CommandInfoBasics {
	type: ApplicationCommandType.User;
}

/**
 * Typings for a command initiated by a slash command.
 * @internal
 */
export interface CommandInfoChat extends CommandInfoBasics {
	type?: ApplicationCommandType.ChatInput;
	description: string | Locales;
	options?: ApplicationCommandOptionData[];
}

/**
 * Typings for a command.
 * @internal
 */
export type CommandInfo = CommandInfoChat | CommandInfoMessage | CommandInfoUser;

/**
 * This is used by Echo internally to export command info to Discord.
 *
 * @internal
 */
export type CommandInfoExport = ApplicationCommandData;

/**
 * Typings for A function that checks if a user has permission to run a command.
 * @internal
 */
export type CommandHasPermission<Inst = Echo> = (bot: Inst, int: Interaction) => Promise<boolean>;

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
	subcommands: { command: Command<Inst>; group?: string }[] = [];
	#_handlers: CommandHandler<Inst, keyof CommandInteractionHandlers<Inst>> = {};
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
			this.options = info.options ?? [];
		} else {
			this.description = new Locales([['default', '']]);
		}
		this.integration_types = info.integration_types ?? [];
		this.contexts = info.contexts ?? [];
		this.checkPermission = () => Promise.resolve(true);
		this.nsfw = info.nsfw ?? false;
		this.default_member_permissions = info.default_member_permissions ?? null;
	}

	addSubCommandGroup(group: CommandSubGroup<Command<Inst>>): this {
		const name = group.name instanceof Locales ? group.name : set_locales({ default: group.name });
		const description =
			group.description instanceof Locales ? group.description : set_locales({ default: group.description });
		this.options.push({
			type: ApplicationCommandOptionType.SubcommandGroup,
			name: name.default,
			nameLocalizations: name.size > 1 ? name.toJSON() : undefined,
			description: description.default,
			descriptionLocalizations: description.size > 1 ? description.toJSON() : undefined,
			options: group.commands.map((command) => command.#_subcommandOption()),
		});
		this.subcommands.push(...group.commands.map((command) => ({ command, group: name.default })));
		return this;
	}

	addSubCommands(cmds: Command<Inst>[]): this {
		this.options.push(...cmds.map((command) => command.#_subcommandOption()));
		this.subcommands.push(...cmds.map((command) => ({ command })));
		return this;
	}

	#_subcommandOption(): ApplicationCommandSubCommandData {
		return {
			type: ApplicationCommandOptionType.Subcommand,
			name: this.name.default,
			nameLocalizations: this.name.size > 1 ? this.name.toJSON() : undefined,
			description: this.description.default,
			descriptionLocalizations: this.description.size > 1 ? this.description.toJSON() : undefined,
			options: this.options.length ? (this.options as ApplicationCommandSubCommandData['options']) : undefined,
		};
	}

	commandInfo(): CommandInfoExport {
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
