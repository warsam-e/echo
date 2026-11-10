import type { ApplicationCommandType } from 'discord.js';

export type CommandScope = 'global' | 'guild';

export function commandRoute(scope: CommandScope, type: ApplicationCommandType, path: string[]): string {
	if (path.some((name) => !name.trim())) throw new Error('Command routes require non-empty default names.');
	return `${scope}/${type}/${path.map((name) => encodeURIComponent(name)).join('/')}`;
}
