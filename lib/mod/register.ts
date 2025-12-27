import type { ApplicationCommand, Collection, Guild } from 'discord.js';
import type { Echo } from '$index.ts';
import type { Command, CommandInfoExport } from './command.ts';
import { _echo_log } from './logging.ts';

async function _register_global_command<Inst extends Echo>(bot: Inst, cmds: Collection<string, Command<Inst>>) {
	if (!bot.application) return;
	return _echo_log(
		{
			cb: bot.rest.put(`/applications/${bot.application.id}/commands`, {
				body: cmds.map((c) => c.commandInfo()),
			}),
			title: 'cmds/global',
			bot,
		},
		`Adding ${bot.botChalk(cmds.size.toLocaleString())} global commands`,
	);
}

async function _update_global_command<Inst extends Echo>(bot: Inst, current: ApplicationCommand, cmd: Command<Inst>) {
	if (!bot.application) return;
	return _echo_log(
		{
			cb: bot.rest.patch(`/applications/${bot.application.id}/commands/${current.id}`, {
				body: cmd.commandInfo(),
			}),
			title: 'cmds/update',
			bot,
		},
		`Updating global command ${bot.botChalk(cmd.name.default)}`,
	);
}

function _similar_cmd(cmd: ApplicationCommand, local_cmd: CommandInfoExport) {
	const orig = cmd.equals(local_cmd);
	const compareArrs = <T>(a: T[], b: T[]) => a.length === b.length && a.every((v) => b.includes(v));
	const integration_types = cmd.integrationTypes ?? [];
	const contexts = cmd.contexts ?? [];

	const local_integration_types = local_cmd.integration_types ?? [];
	const local_contexts = local_cmd.contexts ?? [];

	return orig && compareArrs(integration_types, local_integration_types) && compareArrs(contexts, local_contexts);
}

async function _register_global<Inst extends Echo>(bot: Inst, cmds: Collection<string, Command<Inst>>) {
	if (!bot.application) return;
	const cmds_manager = bot.application.commands;
	await cmds_manager.fetch({
		withLocalizations: true,
	});

	const removing = [...cmds_manager.cache.filter((c) => !cmds.has(c.name)).values()];
	const adding: Array<Command<Inst>> = [];
	const updating: Array<[Command<Inst>, ApplicationCommand]> = [];

	for (const cmd of cmds.values()) {
		const local_cmd = cmd.commandInfo();
		const find = cmds_manager.cache.find((c) => c.name === cmd.name.default);
		if (!find) adding.push(cmd);
		else {
			const should_update = !_similar_cmd(find, local_cmd);
			if (should_update) updating.push([cmd, find]);
		}
	}

	if (!removing.length && !adding.length && !updating.length) return;
	await _echo_log({ title: 'cmds/global', bot }, 'Changes detected for global commands');

	if (removing.length) {
		for (const cmd of removing) {
			await _echo_log(
				{ cb: cmd.delete(), title: 'cmds/delete', bot },
				`Removing global command ${bot.botChalk(cmd.name)}`,
			);
		}
	}

	if (adding.length) {
		await _echo_log(
			{
				title: 'cmds/global',
				bot,
			},
			`Adding ${bot.botChalk(adding.length)} global commands`,
		);

		await _register_global_command(bot, cmds);
	}

	if (updating.length) {
		await _echo_log(
			{
				title: 'cmds/global',
				bot,
			},
			`Updating ${bot.botChalk(updating.length)} global commands`,
		);

		for await (const [cmd, find] of updating) {
			await _update_global_command(bot, find, cmd);
		}
	}

	await _echo_log(
		{ title: 'cmds/global', bot },
		`Registered ${bot.botChalk(cmds.size.toLocaleString())} global commands`,
	);
}

async function _register_guild<Inst extends Echo>(bot: Inst, guild: Guild, cmds: Collection<string, Command<Inst>>) {
	const cmds_manager = guild.commands;
	await cmds_manager.fetch({
		withLocalizations: true,
	});

	const removing = [...cmds_manager.cache.filter((c) => !cmds.has(c.name)).values()];
	const adding: Array<Command<Inst>> = [];
	const updating: Array<[Command<Inst>, ApplicationCommand]> = [];

	for (const cmd of cmds.values()) {
		const local_cmd = cmd.commandInfo();
		const find = cmds_manager.cache.find((c) => c.name === cmd.name.default);
		if (!find) adding.push(cmd);
		else {
			const should_update = !find.equals(local_cmd);
			if (should_update) updating.push([cmd, find]);
		}
	}

	if (!removing.length && !adding.length && !updating.length) return;
	await _echo_log({ title: 'cmds/guild', bot }, `Changes detected for guild ${bot.botChalk(guild.name)}`);

	if (removing.length) {
		for (const cmd of removing) {
			await _echo_log(
				{ cb: cmd.delete(), title: 'cmds/delete', bot },
				`Removing guild command ${bot.botChalk(cmd.name)} for ${bot.botChalk(guild.name)}`,
			);
		}
	}

	if (adding.length) {
		await _echo_log(
			{
				title: 'cmds/guild',
				bot,
			},
			`Adding ${bot.botChalk(adding.length)} guild commands for guild ${bot.botChalk(guild.name)}`,
		);

		for await (const cmd of adding) {
			await _echo_log(
				{ cb: cmds_manager.create(cmd.commandInfo()), title: 'cmds/adding', bot },
				`Registering guild command ${bot.botChalk(cmd.name.default)} for ${bot.botChalk(guild.name)}`,
			);
		}
	}

	if (updating.length) {
		await _echo_log(
			{
				title: 'cmds/guild',
				bot,
			},
			`Updating ${bot.botChalk(updating.length)} guild commands for guild ${bot.botChalk(guild.name)}`,
		);

		for await (const [cmd, find] of updating) {
			const local_cmd = cmd.commandInfo();
			await _echo_log(
				{ cb: find.edit(local_cmd), title: 'cmds/update', bot },
				`Updating guild command ${bot.botChalk(cmd.name.default)} for ${bot.botChalk(guild.name)}`,
			);
		}
	}
}

/**
 * register commands. Don't call this function directly, Echo will call this function for you on startup as long as the commands are defined with .registerCommands()
 * @internal
 */
export async function _register_cmds<Inst extends Echo>(bot: Inst) {
	if (!bot.application) throw new Error('Application is not defined');

	const local_global_commands = bot.commands.filter((c) => c.global);
	const local_guild_commands = bot.commands.filter((c) => !c.global);

	if (!local_global_commands.size && !local_guild_commands.size)
		return _echo_log({ title: 'cmds', bot }, 'No commands to register');

	if (local_guild_commands.size > 0) {
		await Promise.all(
			bot.guilds.cache.map(async (guild) => {
				await _register_guild(bot, guild, local_guild_commands);
			}),
		);
	}

	await _register_global(bot, local_global_commands);
}
