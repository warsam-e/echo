import {
	ApplicationIntegrationType,
	type ClientApplication,
	type Guild,
	InteractionContextType,
	type Snowflake,
} from 'discord.js';
import type { Echo } from '$index.ts';
import type { CommandInfoExport } from './command.ts';
import type { CommandScope } from './command_route.ts';
import { _echo_log } from './logging.ts';

function rootCommands<Inst extends Echo>(bot: Inst, scope: CommandScope) {
	const commands: CommandInfoExport[] = [];
	for (const [route, command] of bot.commands) {
		const [commandScope, , , subcommand] = route.split('/');
		if (commandScope === scope && subcommand === undefined) commands.push(command.commandInfo());
	}
	return commands;
}

function globalCommands<Inst extends Echo>(bot: Inst, application: ClientApplication): CommandInfoExport[] {
	const installTypes = [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall].filter(
		(type) => application.integrationTypesConfig?.[type] !== undefined,
	);
	if (!installTypes.length) installTypes.push(ApplicationIntegrationType.GuildInstall);

	return rootCommands(bot, 'global').map((command) => {
		const integrationTypes = command.integrationTypes ?? installTypes;
		const defaultContexts = [InteractionContextType.Guild, InteractionContextType.BotDM];
		if (integrationTypes.includes(ApplicationIntegrationType.UserInstall)) {
			defaultContexts.push(InteractionContextType.PrivateChannel);
		}
		return { ...command, integrationTypes, contexts: command.contexts ?? defaultContexts };
	});
}

function guildCommands<Inst extends Echo>(bot: Inst): CommandInfoExport[] {
	return rootCommands(bot, 'guild').map((command) => ({ ...command, integrationTypes: undefined, contexts: undefined }));
}

function matchesSettings<T>(desired: readonly T[] | undefined, current: readonly T[] | null): boolean {
	return (
		desired === undefined ||
		(current !== null && desired.length === current.length && desired.every((value) => current.includes(value)))
	);
}

async function syncCommands(
	bot: Echo,
	manager: ClientApplication['commands'] | Guild['commands'],
	desired: CommandInfoExport[],
	target: string,
): Promise<void> {
	const current = await manager.fetch({ withLocalizations: true });
	const unchanged =
		current.size === desired.length &&
		desired.every((command) => {
			const saved = current.find((entry) => entry.type === command.type && entry.name === command.name);
			return (
				saved &&
				matchesSettings(command.integrationTypes, saved.integrationTypes) &&
				matchesSettings(command.contexts, saved.contexts) &&
				saved.equals(
					{
						...command,
						integrationTypes: saved.integrationTypes ?? undefined,
						contexts: saved.contexts ?? undefined,
					},
					true,
				)
			);
		});
	if (unchanged) return;

	await _echo_log(
		{ cb: () => manager.set(desired), title: 'cmds', bot },
		`Syncing ${bot.botChalk(desired.length)} commands for ${bot.botChalk(target)}`,
	);
}

export async function _register_cmds<Inst extends Echo>(bot: Inst) {
	const application = bot.application;
	if (!application) throw new Error('Application is not defined');

	const globals = globalCommands(bot, application);
	const guilds = guildCommands(bot);
	const guildSyncs = new Map<Snowflake, Promise<void>>();
	const syncGuild = (guild: Guild, commands: CommandInfoExport[]) => {
		const pending = guildSyncs.get(guild.id);
		if (pending) return pending;
		const sync = syncCommands(bot, guild.commands, commands, guild.name).finally(() => guildSyncs.delete(guild.id));
		guildSyncs.set(guild.id, sync);
		return sync;
	};

	bot.on('guildCreate', async (guild) => {
		try {
			await syncGuild(guild, guildCommands(bot));
		} catch (error) {
			console.error(`Failed to sync commands for guild ${guild.id}`, error);
		}
	});
	await Promise.all([
		syncCommands(bot, application.commands, globals, 'global'),
		...bot.guilds.cache.map((guild) => syncGuild(guild, guilds)),
	]);
}
