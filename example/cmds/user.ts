import { inspect } from 'node:util';
import { ApplicationCommandType, Command } from '$index.ts';

const user = new Command({
	name: 'user action',
	type: ApplicationCommandType.User,
}).addHandler('user_context_menu', (_bot, int) => {
	return int.reply(`\`\`\`js\n${inspect(int.targetMember ?? int.targetUser, false, 0)}\`\`\``);
});

export default user;
