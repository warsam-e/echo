import {
	type ApplicationCommandData,
	ApplicationIntegrationType,
	type ClientApplication,
	type Guild,
	InteractionContextType,
	type Snowflake,
} from 'discord.js';
import type { Echo } from '$index.ts';
import type { CommandScope } from './command_route.ts';
import { _echo_log } from './logging.ts';

function rootCommands(bot: Echo, scope: CommandScope) {
	const commands: ApplicationCommandData[] = [];
	for (const [route, command] of bot.commands) {
		const [commandScope, , , subcommand] = route.split('/');
		if (commandScope === scope && subcommand === undefined) commands.push(command.commandInfo());
	}
	return commands;
}

function globalCommands(bot: Echo, application: ClientApplication): ApplicationCommandData[] {
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

function guildCommands(bot: Echo): ApplicationCommandData[] {
	return rootCommands(bot, 'guild').map((command) => ({
		...command,
		integrationTypes: undefined,
		contexts: undefined,
	}));
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
	desired: ApplicationCommandData[],
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

export async function _register_cmds(bot: Echo) {
	const application = bot.application;
	if (!application) throw new Error('Application is not defined');

	const guilds = guildCommands(bot);
	const guildSyncs = new Map<Snowflake, Promise<void>>();
	const syncGuild = (guild: Guild, commands: ApplicationCommandData[]) => {
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
	const pendingSyncs = bot.guilds.cache.map((guild) => syncGuild(guild, guilds));
	if (!bot.shard || bot.shard.ids.includes(0)) {
		pendingSyncs.push(syncCommands(bot, application.commands, globalCommands(bot, application), 'global'));
	}
	await Promise.all(pendingSyncs);
}
