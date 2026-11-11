import type { ApplicationCommandType, AutocompleteInteraction, CommandInteraction } from 'discord.js';

export type CommandScope = 'global' | 'guild';

export function commandRoute(scope: CommandScope, type: ApplicationCommandType, path: string[]): string {
	if (path.some((name) => !name.trim())) throw new Error('Command routes require non-empty default names.');
	const route = path.map((name) => name.replaceAll('%', '%25').replaceAll('/', '%2F').replaceAll(':', '%3A'));
	return `${scope}/${type}/${route.join('/')}`;
}

export function interactionCommandRoute(interaction: CommandInteraction | AutocompleteInteraction): string {
	const path = [interaction.commandName];
	if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
		const group = interaction.options.getSubcommandGroup(false);
		const subcommand = interaction.options.getSubcommand(false);
		if (group) path.push(group);
		if (subcommand) path.push(subcommand);
	}
	return commandRoute(interaction.commandGuildId ? 'guild' : 'global', interaction.commandType, path);
}

const componentPrefix = 'echo:';

export function componentId(route: string, action: string): string {
	const id = `${componentPrefix}${route}:${action}`;
	if (id.length > 100) throw new Error('Echo component IDs must be at most 100 characters.');
	return id;
}

export function componentCommandRoute(customId: string): string | undefined {
	if (!customId.startsWith(componentPrefix)) return;
	const separator = customId.indexOf(':', componentPrefix.length);
	if (separator <= componentPrefix.length) return;
	return customId.slice(componentPrefix.length, separator);
}

export function componentAction(customId: string): string | undefined {
	const route = componentCommandRoute(customId);
	if (route === undefined) return;
	return customId.slice(componentPrefix.length + route.length + 1);
}
