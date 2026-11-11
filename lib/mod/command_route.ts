import { createHash } from 'node:crypto';
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

export function commandRouteFingerprint(route: string): string {
	return createHash('sha256').update(route).digest().subarray(0, 12).toString('base64url');
}

export function componentId(route: string, action: string): string {
	const id = `${componentPrefix}${route}:${action}`;
	if (id.length <= 100) return id;
	const compactId = `${componentPrefix}~${commandRouteFingerprint(route)}:${action}`;
	if (compactId.length > 100) throw new Error('Echo component IDs must be at most 100 characters.');
	return compactId;
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

export function resolveComponentCommandRoute(customId: string, routes: Iterable<string>): string | undefined {
	const route = componentCommandRoute(customId);
	if (!route?.startsWith('~')) return route;
	const fingerprint = route.slice(1);
	for (const candidate of routes) {
		if (commandRouteFingerprint(candidate) === fingerprint) return candidate;
	}
	throw new Error('Command not found.');
}
