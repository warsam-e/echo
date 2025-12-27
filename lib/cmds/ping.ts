import type { Echo } from '$index.ts';
import { Command } from '$mod/index.ts';

export default <T extends Echo>() =>
	new Command<T>({
		name: 'ping',
		description: 'Pong!',
	}).addHandler('chat_input', async (bot, int) => {
		const sent = await int.deferReply({ withResponse: true });
		if (!sent.resource?.message?.createdTimestamp)
			return int.editReply('An error occured while executing the command.');
		const diff = sent.resource?.message?.createdTimestamp - int.createdTimestamp;

		const content = [
			'### 🏓 Pong!',
			`## ${diff}ms`,
			...(bot.isSharding ? [`-# via shard #${bot.shardId}`] : []),
		].join('\n');

		return int.editReply(content);
	});
