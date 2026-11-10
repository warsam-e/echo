import Echo, { ActivityType } from '$index.ts';
import cmds from './cmds/index.ts';

const token = Bun.env.TOKEN;
if (!token) throw new Error('Set TOKEN to your Discord bot token.');

const bot = await new Echo({
	name: 'Echo Test',
	color: 'LuminousVividPink',
})
	.registerGuild(cmds)
	.init(token);

const [guilds, users] = await Promise.all([bot.guildCount(), bot.memberCount()]);

bot.user?.setActivity({
	type: ActivityType.Watching,
	name: `${guilds.toLocaleString()} guilds | ${users.toLocaleString()} users`,
});
