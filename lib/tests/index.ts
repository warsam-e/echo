import Echo, { ActivityType } from '@index.js';
import cmds from './cmds/index.ts';

const bot = await new Echo({
	name: 'Echo Test',
	color: 'LuminousVividPink',
})
	.registerCommands(cmds)
	.init();

const [guilds, users] = await Promise.all([bot.guildCount(), bot.memberCount()]);

bot.user?.setActivity({
	type: ActivityType.Watching,
	name: `${guilds.toLocaleString()} guilds | ${users.toLocaleString()} users`,
});
