import type {
	MentionableSelectMenuBuilder,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	UserSelectMenuBuilder,
} from 'discord.js';

export type AnySelectMenuBuilder =
	| StringSelectMenuBuilder
	| RoleSelectMenuBuilder
	| UserSelectMenuBuilder
	| MentionableSelectMenuBuilder;
